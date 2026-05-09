// ============================================================
//  Chaos RPG Bot — /iniciativa
//  Gerencia a ordem de iniciativa: adiciona NPCs/inimigos com
//  valor fixo, suporta múltiplos turnos por NPC na mesma rodada.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const rpgStore       = require('../../utils/rpgSessionStore');
const characterStore = require('../../utils/characterStore');
const { resolveOrReply } = require('../../utils/sessionResolver');

function isMaster(member) {
  const cargo = process.env.MASTER_ROLE ?? 'Mestre';
  return member.roles.cache.some(r => r.name === cargo)
      || member.permissions.has('Administrator');
}

function makeSlotKey() {
  return Math.random().toString(36).slice(2, 8);
}

function formatOrderList(order) {
  if (!order || order.length === 0) return '*Nenhum participante.*';
  const sorted = [...order].sort((a, b) => b.initiative - a.initiative);
  return sorted.map(e => {
    const label = e.emoji ? `${e.emoji} **${e.name}**` : `**${e.name}**`;
    const team  = e.team  ? ` [${e.team}]` : '';
    return `  • ${label}${team} — ${e.initiative}`;
  }).join('\n');
}

const data = new SlashCommandBuilder()
  .setName('iniciativa')
  .setDescription('Gerencia a ordem de iniciativa do combate')

  .addSubcommand(s => s
    .setName('adicionar')
    .setDescription('Adiciona NPC/inimigo à iniciativa com valor fixo (Mestre)')
    .addStringOption(o => o
      .setName('nome')
      .setDescription('Nome de exibição')
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('valor')
      .setDescription('Valor de iniciativa')
      .setRequired(true))
    .addStringOption(o => o
      .setName('emoji')
      .setDescription('Emoji opcional (ex: 👺)'))
    .addStringOption(o => o
      .setName('tipo')
      .setDescription('Tipo do participante')
      .addChoices(
        { name: 'NPC aliado', value: 'npc'     },
        { name: 'Inimigo',   value: 'inimigo'  },
      ))
    .addIntegerOption(o => o
      .setName('slots')
      .setDescription('Quantos turnos por rodada para este NPC (padrão: 1)')
      .setMinValue(1)
      .setMaxValue(5)))

  .addSubcommand(s => s
    .setName('remover')
    .setDescription('Remove todas as entradas com este nome da iniciativa (Mestre)')
    .addStringOption(o => o
      .setName('nome')
      .setDescription('Nome do participante')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('limpar')
    .setDescription('Limpa toda a ordem de iniciativa (Mestre)'))

  .addSubcommand(s => s
    .setName('ver')
    .setDescription('Exibe a ordem de iniciativa atual'));

async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  await interaction.deferReply({ ephemeral: true });

  if (sub !== 'ver' && !isMaster(interaction.member)) {
    const cargo = process.env.MASTER_ROLE ?? 'Mestre';
    await interaction.editReply(`❌ Você precisa do cargo **${cargo}** para gerenciar a iniciativa.`);
    return;
  }

  const resolved = await resolveOrReply(interaction);
  if (!resolved) return;

  const { session, sessionId } = resolved;
  const combat = session.combat ?? { active: false, round: 0, current: 0, order: [] };

  // ── adicionar ──────────────────────────────────────────────
  if (sub === 'adicionar') {
    const nome  = interaction.options.getString('nome').trim();
    const valor = interaction.options.getInteger('valor');
    const emoji = interaction.options.getString('emoji') ?? null;
    const tipo  = interaction.options.getString('tipo')  ?? null;
    const slots = interaction.options.getInteger('slots') ?? 1;

    // Tenta vincular a um personagem registrado (NPC ou PC)
    const char = await characterStore.find(guildId, nome);

    for (let i = 0; i < slots; i++) {
      combat.order.push({
        charId:    char?.id    ?? null,
        name:      char?.name  ?? nome,
        emoji:     emoji ?? char?.emoji ?? null,
        team:      tipo  ?? char?.team  ?? null,
        initiative: valor,
        discordId: null,
        slotKey:   makeSlotKey(),
        isManual:  true,
      });
    }

    // Re-ordena se o combate já está ativo
    if (combat.active) {
      const prevKey = combat.order[combat.current]?.slotKey;
      combat.order.sort((a, b) => b.initiative - a.initiative);
      if (prevKey) {
        const newIdx = combat.order.findIndex(e => e.slotKey === prevKey);
        if (newIdx >= 0) combat.current = newIdx;
      }
    }

    session.combat = combat;
    await rpgStore.saveSession(guildId, sessionId, session);

    const nameLabel = emoji ? `${emoji} **${nome}**` : `**${nome}**`;
    const slotLabel = slots > 1 ? ` (${slots} turnos)` : '';
    const teamLabel = tipo  ? ` [${tipo}]` : '';
    await interaction.editReply(
      `✅ ${nameLabel}${teamLabel} adicionado à iniciativa com valor **${valor}**${slotLabel}.\n\n` +
      `**Ordem atual:**\n${formatOrderList(combat.order)}`
    );
    return;
  }

  // ── remover ────────────────────────────────────────────────
  if (sub === 'remover') {
    const nome   = interaction.options.getString('nome').trim().toLowerCase();
    const before = combat.order.length;
    const prevKey = combat.order[combat.current]?.slotKey;

    combat.order = combat.order.filter(e => e.name.toLowerCase() !== nome);
    const removed = before - combat.order.length;

    if (removed === 0) {
      await interaction.editReply(`❌ Nenhuma entrada com o nome **${nome}** encontrada na iniciativa.`);
      return;
    }

    // Ajusta ponteiro atual
    if (combat.active && combat.order.length > 0) {
      const newIdx = prevKey
        ? combat.order.findIndex(e => e.slotKey === prevKey)
        : -1;
      combat.current = newIdx >= 0
        ? newIdx
        : Math.min(combat.current, combat.order.length - 1);
    } else {
      combat.current = 0;
    }

    session.combat = combat;
    await rpgStore.saveSession(guildId, sessionId, session);

    const orderStr = combat.order.length > 0
      ? `**Ordem atual:**\n${formatOrderList(combat.order)}`
      : '*Iniciativa vazia.*';
    await interaction.editReply(`🗑️ **${removed}** entrada(s) de **${nome}** removida(s).\n\n${orderStr}`);
    return;
  }

  // ── limpar ─────────────────────────────────────────────────
  if (sub === 'limpar') {
    session.combat = { active: false, round: 0, current: 0, order: [] };
    await rpgStore.saveSession(guildId, sessionId, session);
    await interaction.editReply('🗑️ Ordem de iniciativa limpa.');
    return;
  }

  // ── ver ────────────────────────────────────────────────────
  if (sub === 'ver') {
    if (!combat.order || combat.order.length === 0) {
      await interaction.editReply('📭 Nenhuma iniciativa registrada ainda.');
      return;
    }
    await interaction.editReply(
      `📋 **Ordem de iniciativa atual:**\n${formatOrderList(combat.order)}`
    );
  }
}

module.exports = { data, execute };
