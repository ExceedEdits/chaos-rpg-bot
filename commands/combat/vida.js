// ============================================================
//  Chaos RPG Bot — /dano  /curar  /escudo  /vida
//  Comandos de combate — HP e escudo
// ============================================================

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const characterStore = require('../../utils/characterStore');
const { applyDamage, applyHeal, applyShield,
        formatEvents } = require('../../utils/combatEngine');
const { formatFullStatus } = require('../../utils/statusEngine');

// ── Helper: executa operação e responde ──────────────────────
async function runCombatOp(interaction, opFn) {
  const guildId = interaction.guildId;
  const query   = interaction.options.getString('personagem');
  const amount  = interaction.options.getInteger('valor');

  await interaction.deferReply();

  const char = await characterStore.find(guildId, query);
  if (!char) {
    await interaction.editReply(`❌ Personagem \`${query}\` não encontrado.`);
    return;
  }

  const { char: updated, log, events } = opFn(char, amount);
  await characterStore.upsert(guildId, updated);

  const name      = updated.emoji ? `${updated.emoji} **${updated.name}**` : `**${updated.name}**`;
  const eventMsgs = formatEvents(updated, events);
  const status    = formatFullStatus(updated);

  const lines = [`${name}`, log, '', status];
  if (eventMsgs.length) lines.push('', ...eventMsgs);

  await interaction.editReply(lines.join('\n'));
}

// ── /dano ─────────────────────────────────────────────────────
const dataDano = new SlashCommandBuilder()
  .setName('dano')
  .setDescription('Aplica dano a um personagem')
  .addStringOption(o => o.setName('personagem').setDescription('Nome, emoji ou @jogador').setRequired(true))
  .addIntegerOption(o => o.setName('valor').setDescription('Quantidade de dano').setRequired(true).setMinValue(1));

// ── /curar ────────────────────────────────────────────────────
const dataCurar = new SlashCommandBuilder()
  .setName('curar')
  .setDescription('Cura um personagem')
  .addStringOption(o => o.setName('personagem').setDescription('Nome, emoji ou @jogador').setRequired(true))
  .addIntegerOption(o => o.setName('valor').setDescription('Quantidade de cura').setRequired(true).setMinValue(1));

// ── /escudo ───────────────────────────────────────────────────
const dataEscudo = new SlashCommandBuilder()
  .setName('escudo')
  .setDescription('Define o valor do escudo de um personagem')
  .addStringOption(o => o.setName('personagem').setDescription('Nome, emoji ou @jogador').setRequired(true))
  .addIntegerOption(o => o.setName('valor').setDescription('Novo valor do escudo').setRequired(true).setMinValue(0));

// ── /vida ─────────────────────────────────────────────────────
const dataVida = new SlashCommandBuilder()
  .setName('vida')
  .setDescription('Define o HP atual de um personagem diretamente')
  .addStringOption(o => o.setName('personagem').setDescription('Nome, emoji ou @jogador').setRequired(true))
  .addIntegerOption(o => o.setName('valor').setDescription('Novo HP atual').setRequired(true).setMinValue(0));

// ── Executores ────────────────────────────────────────────────
async function executeDano(interaction) {
  await runCombatOp(interaction, applyDamage);
}

async function executeCurar(interaction) {
  await runCombatOp(interaction, applyHeal);
}

async function executeEscudo(interaction) {
  await runCombatOp(interaction, applyShield);
}

async function executeVida(interaction) {
  const guildId = interaction.guildId;
  const query   = interaction.options.getString('personagem');
  const valor   = interaction.options.getInteger('valor');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const char = await characterStore.find(guildId, query);
  if (!char) { await interaction.editReply(`❌ Personagem \`${query}\` não encontrado.`); return; }

  const prev = char.hp;
  char.hp    = Math.min(valor, char.hpMax);
  await characterStore.upsert(guildId, char);

  const events = [];
  if (char.hp === 0)                      events.push('death');
  else if (char.hp <= char.critThreshold) events.push('critical');

  const eventMsgs = formatEvents(char, events);
  const lines = [
    `❤️ HP de **${char.name}** ajustado: ${prev} → **${char.hp}**`,
    '',
    formatFullStatus(char),
  ];
  if (eventMsgs.length) lines.push('', ...eventMsgs);

  await interaction.editReply(lines.join('\n'));
}

module.exports = [
  { data: dataDano,   execute: executeDano   },
  { data: dataCurar,  execute: executeCurar  },
  { data: dataEscudo, execute: executeEscudo },
  { data: dataVida,   execute: executeVida   },
];
