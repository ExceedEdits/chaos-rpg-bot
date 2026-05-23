// ============================================================
//  Chaos RPG Bot — /resume
// ============================================================

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { AudioPlayerStatus }   = require('@discordjs/voice');
const { getState }            = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Retoma a música pausada');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state?.currentTrack) {
    return interaction.reply({ content: '❌ Nada está tocando no momento.', flags: MessageFlags.Ephemeral });
  }

  if (state.player.state.status !== AudioPlayerStatus.Paused) {
    return interaction.reply({ content: '▶️ A música não está pausada.', flags: MessageFlags.Ephemeral });
  }

  state.player.unpause();
  await interaction.reply(`▶️ Retomando: **${state.currentTrack.title}**`);
}

module.exports = { data, execute };
