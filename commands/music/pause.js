// ============================================================
//  Chaos RPG Bot — /pause
// ============================================================

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { AudioPlayerStatus }   = require('@discordjs/voice');
const { getState }            = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pausa a música atual');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state?.currentTrack) {
    return interaction.reply({ content: '❌ Nada está tocando no momento.', flags: MessageFlags.Ephemeral });
  }

  if (state.player.state.status === AudioPlayerStatus.Paused) {
    return interaction.reply({ content: '⏸️ Já está pausado. Use `/resume` para retomar.', flags: MessageFlags.Ephemeral });
  }

  state.player.pause();
  await interaction.reply(`⏸️ Pausado: **${state.currentTrack.title}**`);
}

module.exports = { data, execute };
