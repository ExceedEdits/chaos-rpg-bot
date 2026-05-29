// ============================================================
//  Chaos RPG Bot — /loop
//  Ativa/desativa o loop de faixa ou de fila.
// ============================================================

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getState, setLoop }                 = require('../../utils/musicPlayer');

const MODES = {
  track: { label: '🔂 Loop de faixa',  desc: 'A música atual vai repetir indefinidamente.' },
  queue: { label: '🔁 Loop de fila',   desc: 'A fila inteira vai repetir do começo ao fim.' },
  disable: { label: '➡️ Loop desativado', desc: 'Reprodução normal sem repetição.' },
};

const data = new SlashCommandBuilder()
  .setName('loop')
  .setDescription('Ativa ou desativa o loop de música')
  .addSubcommand(s => s
    .setName('track')
    .setDescription('Repete a música atual indefinidamente'))
  .addSubcommand(s => s
    .setName('queue')
    .setDescription('Repete a fila inteira em loop'))
  .addSubcommand(s => s
    .setName('disable')
    .setDescription('Desativa o loop'));

async function execute(interaction) {
  const state = getState(interaction.guildId);

  if (!state?.currentTrack && !state?.queue?.length) {
    return interaction.reply({ content: '❌ Nada está tocando no momento.', flags: MessageFlags.Ephemeral });
  }

  const sub  = interaction.options?.getSubcommand?.() ?? interaction.options?.subcommand;
  const mode = sub === 'disable' ? null : sub;

  const ok = setLoop(interaction.guildId, mode);
  if (!ok) {
    return interaction.reply({ content: '❌ Nada está tocando no momento.', flags: MessageFlags.Ephemeral });
  }

  const info    = MODES[sub];
  const current = state.currentTrack;

  const lines = [
    `${info.label} ativado!`,
    info.desc,
  ];

  if (mode === 'track' && current) {
    lines.push(`🎵 Repetindo: **${current.title}**`);
  } else if (mode === 'queue') {
    lines.push(`🎶 Fila com **${(state.queue?.length ?? 0) + (current ? 1 : 0)}** música(s) em loop.`);
  }

  await interaction.reply(lines.join('\n'));
}

module.exports = { data, execute };
