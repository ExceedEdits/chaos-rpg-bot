// ============================================================
//  Chaos RPG Bot — /resume
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const { AudioPlayerStatus }   = require('@discordjs/voice');
const { getState }            = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Retoma a música pausada');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state?.currentTrack) {
    return interaction.reply({ content: '❌ Nada está tocando no momento.', ephemeral: true });
  }

  if (state.player.state.status !== AudioPlayerStatus.Paused) {
    return interaction.reply({ content: '▶️ A música não está pausada.', ephemeral: true });
  }

  state.player.unpause();
  await interaction.reply(`▶️ Retomando: **${state.currentTrack.title}**`);
}

module.exports = { data, execute };
