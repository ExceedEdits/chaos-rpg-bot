// ============================================================
//  Chaos RPG Bot — /back
//  Volta para a música anterior do histórico.
//  A faixa atual é devolvida ao início da fila.
// ============================================================

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getState, goBack } = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('back')
  .setDescription('Volta para a música anterior');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state) {
    return interaction.reply({ content: '❌ Não estou em nenhum canal de voz.', flags: MessageFlags.Ephemeral });
  }

  if (state.history.length === 0) {
    return interaction.reply({ content: '📭 Não há músicas anteriores no histórico.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();

  const prev = await goBack(interaction.guild.id);
  if (!prev) {
    return interaction.editReply('❌ Não foi possível voltar para a música anterior.');
  }

  await interaction.editReply(`⏮️ Voltando para: **${prev.title}** \`${prev.duration}\``);
}

module.exports = { data, execute };
