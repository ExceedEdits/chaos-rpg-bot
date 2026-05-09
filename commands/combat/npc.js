// ============================================================
//  Chaos RPG Bot — /npc
//  Gerenciamento de NPCs: replicar, resetar, listar, remover.
//  Requer cargo de Mestre para todas as operações.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const characterStore       = require('../../utils/characterStore');
const { formatFullStatus } = require('../../utils/statusEngine');

function isMaster(member) {
  const cargo = process.env.MASTER_ROLE ?? 'Mestre';
  return member.roles.cache.some(r => r.name === cargo);
}

const data = new SlashCommandBuilder()
  .setName('npc')
  .setDescription('Gerencia NPCs de combate (requer Mestre)')

  // replicar
  .addSubcommand(s => s
    .setName('replicar')
    .setDescription('Cria N cópias independentes de um NPC base')
    .addStringOption(o => o
      .setName('nome')
      .setDescription('Nome do NPC base (ex: Goblin)')
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('quantidade')
      .setDescription('Quantas cópias criar')
      .setRequired(true)
      .setMinValue(2)
      .setMaxValue(20))
    .addStringOption(o => o
      .setName('sufixos')
      .setDescription('Sufixos separados por vírgula (ex: A,B,C ou 🔴,🟡,🟢). Omita para usar números.')))

  // resetar
  .addSubcommand(s => s
    .setName('resetar')
    .setDescription('Restaura HP máximo e zera status de um ou mais NPCs')
    .addStringOption(o => o
      .setName('nome')
      .setDescription('Nome exato, prefixo do grupo (ex: "Goblin") ou "todos" para todos os NPCs')
      .setRequired(true)))

  // listar
  .addSubcommand(s => s
    .setName('listar')
    .setDescription('Lista todos os NPCs do servidor'))

  // remover
  .addSubcommand(s => s
    .setName('remover')
    .setDescription('Remove um ou mais NPCs')
    .addStringOption(o => o
      .setName('nome')
      .setDescription('Nome exato, prefixo do grupo (ex: "Goblin") ou "todos"')
      .setRequired(true)));

// ── Helpers ───────────────────────────────────────────────────

/** Retorna todos os personagens sem discordId (NPCs) */
async function getAllNpcs(guildId) {
  const all = await characterStore.getAll(guildId);
  return all.filter(c => !c.discordId);
}

/**
 * Resolve quais NPCs o nome/prefixo aponta:
 *   "todos"     → todos os NPCs
 *   "Goblin"    → NPCs cujo nome começa com "Goblin"
 *   "Goblin 3"  → NPC com nome exato "Goblin 3"
 */
async function resolveNpcs(guildId, query) {
  const npcs = await getAllNpcs(guildId);
  const q    = query.trim();
  if (q.toLowerCase() === 'todos') return npcs;
  return npcs.filter(c =>
    c.name.toLowerCase() === q.toLowerCase() ||
    c.name.toLowerCase().startsWith(q.toLowerCase() + ' ') ||
    c.name.toLowerCase().startsWith(q.toLowerCase() + '_')
  );
}

/** Reseta HP e status de um personagem, retorna cópia resetada */
function resetChar(char) {
  return {
    ...char,
    hp:       char.hpMax,
    shield:   0,
    statuses: [],
  };
}

// ── Executor ──────────────────────────────────────────────────

async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  await interaction.deferReply({ ephemeral: true });

  if (!isMaster(interaction.member)) {
    const cargo = process.env.MASTER_ROLE ?? 'Mestre';
    await interaction.editReply(`❌ Você precisa do cargo **${cargo}** para gerenciar NPCs.`);
    return;
  }

  // ── replicar ───────────────────────────────────────────────
  if (sub === 'replicar') {
    const nome       = interaction.options.getString('nome');
    const quantidade = interaction.options.getInteger('quantidade');
    const sufixosRaw = interaction.options.getString('sufixos');

    // Busca o NPC base (sem discordId)
    const base = await characterStore.find(guildId, nome);
    if (!base) {
      await interaction.editReply(`❌ NPC \`${nome}\` não encontrado.`);
      return;
    }
    if (base.discordId) {
      await interaction.editReply(`❌ **${base.name}** é um personagem de jogador, não um NPC.`);
      return;
    }

    // Monta lista de sufixos
    let sufixos;
    if (sufixosRaw) {
      sufixos = sufixosRaw.split(',').map(s => s.trim()).filter(Boolean);
      if (sufixos.length < quantidade) {
        await interaction.editReply(
          `❌ Você forneceu ${sufixos.length} sufixo(s) para ${quantidade} cópias. Forneça ao menos ${quantidade} sufixos ou omita para usar números.`
        );
        return;
      }
    } else {
      sufixos = Array.from({ length: quantidade }, (_, i) => String(i + 1));
    }

    const criados  = [];
    const pulados  = [];

    for (let i = 0; i < quantidade; i++) {
      const novoNome = `${base.name} ${sufixos[i]}`;
      const existing = await characterStore.find(guildId, novoNome);

      if (existing) {
        pulados.push(novoNome);
        continue;
      }

      // Cópia independente: herda stats mas evolui sozinha
      const copia = {
        ...base,
        name:     novoNome,
        hp:       base.hpMax,   // começa com HP cheio
        shield:   0,            // escudo zerado
        statuses: [],           // sem status herdados
        // discordId permanece null → continua NPC
      };

      await characterStore.upsert(guildId, copia);
      criados.push(novoNome);
    }

    const lines = [];
    if (criados.length > 0) {
      lines.push(`✅ **${criados.length}** cópia(s) de **${base.name}** criada(s):`);
      lines.push(criados.map(n => `  • ${n}`).join('\n'));
    }
    if (pulados.length > 0) {
      lines.push(`⚠️ Pulado(s) (já existiam): ${pulados.join(', ')}`);
    }

    await interaction.editReply(lines.join('\n'));
    return;
  }

  // ── resetar ────────────────────────────────────────────────
  if (sub === 'resetar') {
    const query = interaction.options.getString('nome');
    const npcs  = await resolveNpcs(guildId, query);

    if (npcs.length === 0) {
      await interaction.editReply(`❌ Nenhum NPC encontrado para \`${query}\`.`);
      return;
    }

    for (const npc of npcs) {
      await characterStore.upsert(guildId, resetChar(npc));
    }

    if (npcs.length === 1) {
      const updated = resetChar(npcs[0]);
      await interaction.editReply(
        `♻️ **${updated.name}** resetado!\n\n${formatFullStatus(updated)}`
      );
    } else {
      const lines = [
        `♻️ **${npcs.length}** NPC(s) resetado(s) com HP máximo e status zerados:`,
        npcs.map(n => {
          const emoji = n.emoji ? `${n.emoji} ` : '';
          return `  • ${emoji}${n.name} → ❤️ ${n.hpMax}/${n.hpMax}`;
        }).join('\n'),
      ];
      await interaction.editReply(lines.join('\n'));
    }
    return;
  }

  // ── listar ─────────────────────────────────────────────────
  if (sub === 'listar') {
    const npcs = await getAllNpcs(guildId);

    if (npcs.length === 0) {
      await interaction.editReply('📭 Nenhum NPC criado neste servidor.');
      return;
    }

    // Agrupa por prefixo de nome para facilitar leitura
    const groups = {};
    for (const npc of npcs) {
      // Prefixo = tudo antes do último espaço+número/sufixo, ou o nome inteiro
      const match  = npc.name.match(/^(.*?)(?:\s+[\w🔴🟢🟡🔵⚪]+)?$/);
      const prefix = match ? match[1].trim() || npc.name : npc.name;
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(npc);
    }

    const lines = [`👹 **NPCs (${npcs.length}):**`, ''];
    for (const [prefix, members] of Object.entries(groups)) {
      if (members.length === 1) {
        const n = members[0];
        const emoji = n.emoji ? `${n.emoji} ` : '';
        const statCount = n.statuses?.length ?? 0;
        const statusTag = statCount > 0 ? ` [${statCount} status]` : '';
        lines.push(`${emoji}**${n.name}** — ❤️ ${n.hp}/${n.hpMax}${n.shield > 0 ? ` 🛡️${n.shield}` : ''}${statusTag}`);
      } else {
        lines.push(`**${prefix}** (${members.length}x)`);
        for (const n of members) {
          const emoji = n.emoji ? `${n.emoji} ` : '';
          const statCount = n.statuses?.length ?? 0;
          const statusTag = statCount > 0 ? ` [${statCount} status]` : '';
          const hpRatio   = n.hp / n.hpMax;
          const hpIcon    = hpRatio > 0.5 ? '🟢' : hpRatio > 0.25 ? '🟡' : '🔴';
          lines.push(`  ${emoji}${n.name} ${hpIcon} ${n.hp}/${n.hpMax}${n.shield > 0 ? ` 🛡️${n.shield}` : ''}${statusTag}`);
        }
      }
    }

    await interaction.editReply(lines.join('\n'));
    return;
  }

  // ── remover ────────────────────────────────────────────────
  if (sub === 'remover') {
    const query = interaction.options.getString('nome');
    const npcs  = await resolveNpcs(guildId, query);

    if (npcs.length === 0) {
      await interaction.editReply(`❌ Nenhum NPC encontrado para \`${query}\`.`);
      return;
    }

    for (const npc of npcs) {
      await characterStore.remove(guildId, npc.id);
    }

    if (npcs.length === 1) {
      await interaction.editReply(`🗑️ **${npcs[0].name}** removido.`);
    } else {
      await interaction.editReply(
        `🗑️ **${npcs.length}** NPC(s) removido(s): ${npcs.map(n => n.name).join(', ')}`
      );
    }
  }
}

module.exports = { data, execute };
