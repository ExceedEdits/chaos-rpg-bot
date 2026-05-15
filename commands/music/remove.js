// ============================================================
//  Chaos RPG Bot — /remove <posição>
//  Remove uma música específica da fila pelo número.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const { getState }            = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remove uma música da fila pelo número')
  .addIntegerOption(o => o
    .setName('posicao')
    .setDescription('Número da música na fila (veja com /queue)')
    .setRequired(true)
    .setMinValue(1));

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state || state.queue.length === 0) {
    return interaction.reply({ content: '📭 A fila está vazia.', ephemeral: true });
  }

  const pos = interaction.options.getInteger('posicao');

  if (pos > state.queue.length) {
    return interaction.reply({
      content: `❌ Posição inválida. A fila tem **${state.queue.length}** música(s). Use \`/queue\` para ver.`,
      ephemeral: true,
    });
  }

  const [removed] = state.queue.splice(pos - 1, 1);
  await interaction.reply(`🗑️ Removido da fila (#${pos}): **${removed.title}** \`${removed.duration}\``);
}

module.exports = { data, execute };
