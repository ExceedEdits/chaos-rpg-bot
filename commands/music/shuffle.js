// ============================================================
//  Chaos RPG Bot — /shuffle
//  Embaralha a fila (Fisher-Yates).
// ============================================================

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getState }            = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('Embaralha a ordem das músicas na fila');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state || state.queue.length === 0) {
    return interaction.reply({ content: '📭 A fila está vazia.', flags: MessageFlags.Ephemeral });
  }

  if (state.queue.length === 1) {
    return interaction.reply({ content: '🔀 A fila tem apenas 1 música — nada a embaralhar.', flags: MessageFlags.Ephemeral });
  }

  // Fisher-Yates
  const q = state.queue;
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }

  await interaction.reply(`🔀 Fila embaralhada! **${q.length}** música(s) na nova ordem.`);
}

module.exports = { data, execute };
