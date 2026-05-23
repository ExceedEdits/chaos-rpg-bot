// ============================================================
//  Chaos RPG Bot — /clear
//  Limpa a fila sem interromper a música atual.
// ============================================================

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getState }            = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Limpa toda a fila (a música atual continua tocando)');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state) {
    return interaction.reply({ content: '❌ Não estou em nenhum canal de voz.', flags: MessageFlags.Ephemeral });
  }

  if (state.queue.length === 0) {
    return interaction.reply({ content: '📭 A fila já está vazia.', flags: MessageFlags.Ephemeral });
  }

  const count = state.queue.length;
  state.queue.length = 0;

  const msg = state.currentTrack
    ? `🗑️ **${count}** música(s) removida(s) da fila.\n▶️ Ainda tocando: **${state.currentTrack.title}**`
    : `🗑️ **${count}** música(s) removida(s) da fila.`;

  await interaction.reply(msg);
}

module.exports = { data, execute };
