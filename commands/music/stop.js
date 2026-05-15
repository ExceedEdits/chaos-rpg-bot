// ============================================================
//  Chaos RPG Bot — /stop
//  Para tudo, limpa a fila e o bot sai da call.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const { getState, destroyState } = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Para a música, limpa a fila e sai do canal de voz');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state) {
    return interaction.reply({ content: '❌ Não estou em nenhum canal de voz.', ephemeral: true });
  }

  destroyState(interaction.guild.id);
  await interaction.reply('⏹️ Parado. Fila limpa. Saindo do canal de voz.');
}

module.exports = { data, execute };
