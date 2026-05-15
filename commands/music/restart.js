// ============================================================
//  Chaos RPG Bot — /restart
//  Volta ao começo da música atual.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const { getState, restartCurrent } = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('restart')
  .setDescription('Reinicia a música atual do começo');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state?.currentTrack) {
    return interaction.reply({ content: '❌ Nada está tocando no momento.', ephemeral: true });
  }

  await interaction.deferReply();

  const ok = await restartCurrent(interaction.guild.id);
  if (!ok) {
    return interaction.editReply('❌ Não foi possível reiniciar a música.');
  }

  await interaction.editReply(`🔁 Reiniciando: **${state.currentTrack.title}**`);
}

module.exports = { data, execute };
