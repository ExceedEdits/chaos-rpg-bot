// ============================================================
//  Chaos RPG Bot — /skip
//  Pula para a próxima música da fila.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const { getState }            = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Pula para a próxima música da fila');

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state?.currentTrack) {
    return interaction.reply({ content: '❌ Nada está tocando no momento.', ephemeral: true });
  }

  const skipped = state.currentTrack.title;
  const next    = state.queue[0];

  // Parar dispara o evento Idle → playNext() automaticamente
  state.player.stop();

  const msg = next
    ? `⏭️ Pulando **${skipped}**...\n🎵 Próxima: **${next.title}** \`${next.duration}\``
    : `⏭️ Pulando **${skipped}**...\n📭 A fila está vazia.`;

  await interaction.reply(msg);
}

module.exports = { data, execute };
