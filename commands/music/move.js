// ============================================================
//  Chaos RPG Bot — /move
//  Move uma faixa de uma posição para outra na fila.
// ============================================================

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getState, moveTrack }               = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('move')
  .setDescription('Move uma música para outra posição na fila')
  .addIntegerOption(o => o
    .setName('posicao')
    .setDescription('Posição atual da música na fila')
    .setRequired(true)
    .setMinValue(1))
  .addIntegerOption(o => o
    .setName('destino')
    .setDescription('Nova posição na fila')
    .setRequired(true)
    .setMinValue(1));

async function execute(interaction) {
  const state = getState(interaction.guildId);

  if (!state?.queue?.length) {
    return interaction.reply({ content: '❌ A fila está vazia.', flags: MessageFlags.Ephemeral });
  }

  const from = interaction.options?.getInteger?.('posicao') ?? parseInt(interaction.options?.options?.posicao);
  const to   = interaction.options?.getInteger?.('destino') ?? parseInt(interaction.options?.options?.destino);
  const len  = state.queue.length;

  if (from < 1 || from > len) {
    return interaction.reply({
      content: `❌ Posição **${from}** inválida. A fila tem **${len}** música(s).`,
      flags:   MessageFlags.Ephemeral,
    });
  }
  if (to < 1 || to > len) {
    return interaction.reply({
      content: `❌ Destino **${to}** inválido. A fila tem **${len}** música(s).`,
      flags:   MessageFlags.Ephemeral,
    });
  }
  if (from === to) {
    return interaction.reply({ content: '❌ A posição atual e o destino são iguais.', flags: MessageFlags.Ephemeral });
  }

  const track = moveTrack(interaction.guildId, from, to);
  if (!track) {
    return interaction.reply({ content: '❌ Não foi possível mover a faixa.', flags: MessageFlags.Ephemeral });
  }

  await interaction.reply(
    `✅ **${track.title}** movida da posição \`${from}\` para \`${to}\`.`
  );
}

module.exports = { data, execute };
