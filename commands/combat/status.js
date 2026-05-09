// ============================================================
//  Chaos RPG Bot — /status
//  Aplica, remove e lista status de personagens
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const characterStore            = require('../../utils/characterStore');
const { formatFullStatus }      = require('../../utils/statusEngine');

function toId(label) {
  return label.toLowerCase().replace(/\s+/g, '_');
}

const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Gerencia status ativos de personagens')

  // aplicar
  .addSubcommand(s => s
    .setName('aplicar')
    .setDescription('Aplica um status a um personagem')
    .addStringOption(o => o
      .setName('personagem')
      .setDescription('Nome, emoji ou @jogador')
      .setRequired(true))
    .addStringOption(o => o
      .setName('nome')
      .setDescription('Nome do status (ex: Veneno, Bênção, Escudo Arcano)')
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('duracao')
      .setDescription('Duração em rodadas (omita para permanente)')
      .setMinValue(1))
    .addStringOption(o => o
      .setName('efeito')
      .setDescription('Tipo de efeito por rodada (opcional)')
      .addChoices(
        { name: '⚔️ Dano por rodada',   value: 'dano'   },
        { name: '💚 Cura por rodada',    value: 'cura'   },
        { name: '🛡️ Escudo por rodada', value: 'escudo' },
      ))
    .addIntegerOption(o => o
      .setName('valor')
      .setDescription('Valor do efeito por rodada (obrigatório se efeito definido)')
      .setMinValue(1)))

  // remover
  .addSubcommand(s => s
    .setName('remover')
    .setDescription('Remove um status de um personagem')
    .addStringOption(o => o
      .setName('personagem')
      .setDescription('Nome, emoji ou @jogador')
      .setRequired(true))
    .addStringOption(o => o
      .setName('nome')
      .setDescription('Nome do status a remover')
      .setRequired(true)))

  // ver
  .addSubcommand(s => s
    .setName('ver')
    .setDescription('Lista os status ativos de um personagem')
    .addStringOption(o => o
      .setName('personagem')
      .setDescription('Nome, emoji ou @jogador')
      .setRequired(true)));

async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  await interaction.deferReply({ ephemeral: true });

  const query = interaction.options.getString('personagem');
  const char  = await characterStore.find(guildId, query);
  if (!char) {
    await interaction.editReply(`❌ Personagem \`${query}\` não encontrado.`);
    return;
  }

  // Garante que statuses existe
  if (!char.statuses) char.statuses = [];

  // ── aplicar ──────────────────────────────────────────────────
  if (sub === 'aplicar') {
    const label    = interaction.options.getString('nome');
    const duracao  = interaction.options.getInteger('duracao') ?? null;
    const efeito   = interaction.options.getString('efeito')   ?? null;
    const valor    = interaction.options.getInteger('valor')   ?? null;
    const id       = toId(label);

    // Valida: efeito sem valor
    if (efeito && !valor) {
      await interaction.editReply(`❌ Informe o \`valor\` do efeito por rodada.`);
      return;
    }

    // Remove versão anterior do mesmo status se existir
    char.statuses = char.statuses.filter(s => s.id !== id);

    // Tenta encontrar o personagem do autor para registrar como fonte
    const allChars  = await characterStore.getAll(guildId);
    const sourceChar = allChars.find(c => c.discordId === interaction.user.id);

    const status = {
      id,
      label,
      duration: duracao,
      effect:   efeito ? { type: efeito, value: valor } : null,
      sourceId: sourceChar?.id ?? null,
    };

    char.statuses.push(status);
    await characterStore.upsert(guildId, char);

    const durLabel = duracao ? `${duracao} rodada(s)` : 'permanente';
    const efLabel  = efeito
      ? `· ${efeito === 'dano' ? '⚔️' : efeito === 'cura' ? '💚' : '🛡️'} ${valor} ${efeito}/rodada`
      : '· apenas descritivo';

    await interaction.editReply([
      `✅ **${label}** aplicado em ${char.emoji ?? ''} **${char.name}**`,
      `  • Duração: ${durLabel} ${efLabel}`,
      '',
      formatFullStatus(char),
    ].join('\n'));
    return;
  }

  // ── remover ───────────────────────────────────────────────────
  if (sub === 'remover') {
    const label  = interaction.options.getString('nome');
    const id     = toId(label);
    const before = char.statuses.length;

    char.statuses = char.statuses.filter(s => s.id !== id);

    if (char.statuses.length === before) {
      await interaction.editReply(`❌ Status \`${label}\` não encontrado em **${char.name}**.`);
      return;
    }

    await characterStore.upsert(guildId, char);
    await interaction.editReply([
      `🗑️ **${label}** removido de ${char.emoji ?? ''} **${char.name}**`,
      '',
      formatFullStatus(char),
    ].join('\n'));
    return;
  }

  // ── ver ───────────────────────────────────────────────────────
  if (sub === 'ver') {
    await interaction.editReply(formatFullStatus(char));
  }
}

module.exports = { data, execute };
