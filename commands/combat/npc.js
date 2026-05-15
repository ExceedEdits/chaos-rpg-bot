// ============================================================
//  Chaos RPG Bot — /npc
//  CRUD completo de NPCs. Mutações requerem sessão RPG ativa
//  e que o usuário seja o Mestre dono da sessão (ou admin).
//  Leitura (ver, listar) não requer sessão.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const characterStore             = require('../../utils/characterStore');
const { formatFullStatus }       = require('../../utils/statusEngine');
const { resolveOrReply, requireSessionMaster } = require('../../utils/sessionResolver');

// ── Opções reutilizáveis entre criar e editar ─────────────────
function addNpcOptions(sub) {
  return sub
    .addStringOption(o => o.setName('emoji').setDescription('Emoji do NPC (opcional)'))
    .addStringOption(o => o.setName('time').setDescription('Emoji/cor do time (ex: 🟢, 🔴)'))
    .addIntegerOption(o => o.setName('escudo').setDescription('Escudo máximo').setMinValue(0))
    .addBooleanOption(o => o.setName('salvaguarda').setDescription('true = escudo bloqueia excedente; false = excedente vai pro HP'))
    .addIntegerOption(o => o.setName('crit_threshold').setDescription('Aviso de HP crítico quando HP ≤ N').setMinValue(0))
    .addStringOption(o => o.setName('overheal').setDescription('Comportamento da cura além do HP máximo')
      .addChoices(
        { name: 'Limitar ao HP máximo',  value: 'cap'    },
        { name: 'Excedente vira escudo', value: 'shield' },
      ));
}

const data = new SlashCommandBuilder()
  .setName('npc')
  .setDescription('Gerencia NPCs de combate')

  // ── criar ────────────────────────────────────────────────────
  .addSubcommand(s => addNpcOptions(s
    .setName('criar')
    .setDescription('Cria um novo NPC (dono da sessão)')
    .addStringOption(o => o.setName('nome').setDescription('Nome do NPC').setRequired(true))
    .addIntegerOption(o => o.setName('hp').setDescription('HP máximo').setRequired(true).setMinValue(1))))

  // ── ver ──────────────────────────────────────────────────────
  .addSubcommand(s => s
    .setName('ver')
    .setDescription('Exibe o status completo de um NPC')
    .addStringOption(o => o.setName('nome').setDescription('Nome ou emoji do NPC').setRequired(true)))

  // ── editar ───────────────────────────────────────────────────
  .addSubcommand(s => addNpcOptions(s
    .setName('editar')
    .setDescription('Edita atributos de um NPC (dono da sessão)')
    .addStringOption(o => o.setName('nome').setDescription('Nome ou emoji do NPC').setRequired(true))
    .addIntegerOption(o => o.setName('hp').setDescription('Novo HP máximo').setMinValue(1))))

  // ── replicar ─────────────────────────────────────────────────
  .addSubcommand(s => s
    .setName('replicar')
    .setDescription('Cria N cópias independentes de um NPC base (dono da sessão)')
    .addStringOption(o => o.setName('nome').setDescription('Nome do NPC base (ex: Goblin)').setRequired(true))
    .addIntegerOption(o => o.setName('quantidade').setDescription('Quantas cópias criar').setRequired(true).setMinValue(2).setMaxValue(20))
    .addStringOption(o => o.setName('sufixos').setDescription('Sufixos separados por vírgula (ex: A,B,C). Omita para usar números.')))

  // ── resetar ──────────────────────────────────────────────────
  .addSubcommand(s => s
    .setName('resetar')
    .setDescription('Restaura HP máximo e zera status de um ou mais NPCs (dono da sessão)')
    .addStringOption(o => o.setName('nome').setDescription('Nome exato, prefixo do grupo ou "todos"').setRequired(true)))

  // ── listar ───────────────────────────────────────────────────
  .addSubcommand(s => s
    .setName('listar')
    .setDescription('Lista todos os NPCs do servidor'))

  // ── remover ──────────────────────────────────────────────────
  .addSubcommand(s => s
    .setName('remover')
    .setDescription('Remove um ou mais NPCs (dono da sessão)')
    .addStringOption(o => o.setName('nome').setDescription('Nome exato, prefixo do grupo ou "todos"').setRequired(true)));

// ── Helpers ───────────────────────────────────────────────────

async function getAllNpcs(guildId) {
  const all = await characterStore.getAll(guildId);
  return all.filter(c => !c.discordId);
}

async function resolveNpcs(guildId, query) {
  const npcs = await getAllNpcs(guildId);
  const q    = query.trim();
  if (q.toLowerCase() === 'todos') return npcs;
  return npcs.filter(c =>
    c.name.toLowerCase() === q.toLowerCase() ||
    c.name.toLowerCase().startsWith(q.toLowerCase() + ' ') ||
    c.name.toLowerCase().startsWith(q.toLowerCase() + '_') ||
    c.emoji === q
  );
}

function resetChar(char) {
  return { ...char, hp: char.hpMax, shield: 0, statuses: [] };
}

// ── Executor ──────────────────────────────────────────────────
async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  await interaction.deferReply({ ephemeral: true });

  // ── ver — sem sessão, sem permissão especial ───────────────
  if (sub === 'ver') {
    const query = interaction.options.getString('nome');
    const all   = await getAllNpcs(guildId);
    const npc   = all.find(c =>
      c.name.toLowerCase() === query.trim().toLowerCase() ||
      c.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      c.emoji === query.trim()
    );
    if (!npc) {
      await interaction.editReply(`❌ NPC \`${query}\` não encontrado.`);
      return;
    }
    await interaction.editReply(formatFullStatus(npc));
    return;
  }

  // ── listar — sem sessão, sem permissão especial ────────────
  if (sub === 'listar') {
    const npcs = await getAllNpcs(guildId);
    if (npcs.length === 0) {
      await interaction.editReply('📭 Nenhum NPC criado neste servidor.');
      return;
    }

    const groups = {};
    for (const npc of npcs) {
      const match  = npc.name.match(/^(.*?)(?:\s+[\w🔴🟢🟡🔵⚪]+)?$/);
      const prefix = match ? match[1].trim() || npc.name : npc.name;
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(npc);
    }

    const lines = [`👹 **NPCs (${npcs.length}):**`, ''];
    for (const [prefix, members] of Object.entries(groups)) {
      if (members.length === 1) {
        const n = members[0];
        const emoji    = n.emoji ? `${n.emoji} ` : '';
        const statusTag = n.statuses?.length > 0 ? ` [${n.statuses.length} status]` : '';
        lines.push(`${emoji}**${n.name}** — ❤️ ${n.hp}/${n.hpMax}${n.shield > 0 ? ` 🛡️${n.shield}` : ''}${statusTag}`);
      } else {
        lines.push(`**${prefix}** (${members.length}×)`);
        for (const n of members) {
          const emoji    = n.emoji ? `${n.emoji} ` : '';
          const statusTag = n.statuses?.length > 0 ? ` [${n.statuses.length} status]` : '';
          const hpRatio  = n.hp / n.hpMax;
          const hpIcon   = hpRatio > 0.5 ? '🟢' : hpRatio > 0.25 ? '🟡' : '🔴';
          lines.push(`  ${emoji}${n.name} ${hpIcon} ${n.hp}/${n.hpMax}${n.shield > 0 ? ` 🛡️${n.shield}` : ''}${statusTag}`);
        }
      }
    }
    await interaction.editReply(lines.join('\n'));
    return;
  }

  // ── Demais comandos: exigem sessão RPG + dono da sessão ─────
  const resolved = await resolveOrReply(interaction);
  if (!resolved) return;
  const { session } = resolved;

  if (!(await requireSessionMaster(interaction, session))) return;

  // ── criar ──────────────────────────────────────────────────
  if (sub === 'criar') {
    const nome = interaction.options.getString('nome');
    const hp   = interaction.options.getInteger('hp');

    const existing = await characterStore.find(guildId, nome);
    if (existing) {
      await interaction.editReply(`❌ Já existe um personagem/NPC chamado **${nome}**.`);
      return;
    }

    const npc = {
      name:          nome,
      emoji:         interaction.options.getString('emoji')          ?? null,
      team:          interaction.options.getString('time')           ?? null,
      discordId:     null, // null = NPC
      hp,
      hpMax:         hp,
      shield:        0,
      shieldMax:     interaction.options.getInteger('escudo')         ?? 0,
      salvaguarda:   interaction.options.getBoolean('salvaguarda')    ?? false,
      critThreshold: interaction.options.getInteger('crit_threshold') ?? 0,
      overheal:      interaction.options.getString('overheal')        ?? 'cap',
      statuses:      [],
    };

    await characterStore.upsert(guildId, npc);
    await interaction.editReply(`✅ NPC **${npc.name}** criado!\n\n${formatFullStatus(npc)}`);
    return;
  }

  // ── editar ─────────────────────────────────────────────────
  if (sub === 'editar') {
    const query = interaction.options.getString('nome');
    const all   = await getAllNpcs(guildId);
    const npc   = all.find(c =>
      c.name.toLowerCase() === query.trim().toLowerCase() ||
      c.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      c.emoji === query.trim()
    );
    if (!npc) {
      await interaction.editReply(`❌ NPC \`${query}\` não encontrado.`);
      return;
    }

    const hpMax    = interaction.options.getInteger('hp');
    const emoji    = interaction.options.getString('emoji');
    const time     = interaction.options.getString('time');
    const escudo   = interaction.options.getInteger('escudo');
    const salvag   = interaction.options.getBoolean('salvaguarda');
    const crit     = interaction.options.getInteger('crit_threshold');
    const overheal = interaction.options.getString('overheal');

    if (hpMax   !== null) { npc.hpMax = hpMax; npc.hp = Math.min(npc.hp, hpMax); }
    if (emoji   !== null) npc.emoji         = emoji;
    if (time    !== null) npc.team          = time;
    if (escudo  !== null) npc.shieldMax     = escudo;
    if (salvag  !== null) npc.salvaguarda   = salvag;
    if (crit    !== null) npc.critThreshold = crit;
    if (overheal!== null) npc.overheal      = overheal;

    await characterStore.upsert(guildId, npc);
    await interaction.editReply(`✅ NPC **${npc.name}** atualizado!\n\n${formatFullStatus(npc)}`);
    return;
  }

  // ── replicar ───────────────────────────────────────────────
  if (sub === 'replicar') {
    const nome       = interaction.options.getString('nome');
    const quantidade = interaction.options.getInteger('quantidade');
    const sufixosRaw = interaction.options.getString('sufixos');

    const base = await characterStore.find(guildId, nome);
    if (!base) { await interaction.editReply(`❌ NPC \`${nome}\` não encontrado.`); return; }
    if (base.discordId) { await interaction.editReply(`❌ **${base.name}** é um personagem de jogador, não um NPC.`); return; }

    let sufixos;
    if (sufixosRaw) {
      sufixos = sufixosRaw.split(',').map(s => s.trim()).filter(Boolean);
      if (sufixos.length < quantidade) {
        await interaction.editReply(`❌ Você forneceu ${sufixos.length} sufixo(s) para ${quantidade} cópias.`);
        return;
      }
    } else {
      sufixos = Array.from({ length: quantidade }, (_, i) => String(i + 1));
    }

    const criados = [];
    const pulados = [];

    for (let i = 0; i < quantidade; i++) {
      const novoNome = `${base.name} ${sufixos[i]}`;
      const existing = await characterStore.find(guildId, novoNome);
      if (existing) { pulados.push(novoNome); continue; }

      await characterStore.upsert(guildId, {
        ...base,
        name:     novoNome,
        hp:       base.hpMax,
        shield:   0,
        statuses: [],
      });
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

    if (npcs.length === 0) { await interaction.editReply(`❌ Nenhum NPC encontrado para \`${query}\`.`); return; }

    for (const npc of npcs) await characterStore.upsert(guildId, resetChar(npc));

    if (npcs.length === 1) {
      await interaction.editReply(`♻️ **${npcs[0].name}** resetado!\n\n${formatFullStatus(resetChar(npcs[0]))}`);
    } else {
      await interaction.editReply([
        `♻️ **${npcs.length}** NPC(s) resetado(s):`,
        npcs.map(n => `  • ${n.emoji ? n.emoji + ' ' : ''}${n.name} → ❤️ ${n.hpMax}/${n.hpMax}`).join('\n'),
      ].join('\n'));
    }
    return;
  }

  // ── remover ────────────────────────────────────────────────
  if (sub === 'remover') {
    const query = interaction.options.getString('nome');
    const npcs  = await resolveNpcs(guildId, query);

    if (npcs.length === 0) { await interaction.editReply(`❌ Nenhum NPC encontrado para \`${query}\`.`); return; }

    for (const npc of npcs) await characterStore.remove(guildId, npc.id);

    if (npcs.length === 1) {
      await interaction.editReply(`🗑️ **${npcs[0].name}** removido.`);
    } else {
      await interaction.editReply(`🗑️ **${npcs.length}** NPC(s) removido(s): ${npcs.map(n => n.name).join(', ')}`);
    }
  }
}

module.exports = { data, execute };
