// ============================================================
//  Chaos RPG Bot — /queue
//  Exibe a fila atual com paginação (10 músicas por página).
// ============================================================

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getState }            = require('../../utils/musicPlayer');

const PER_PAGE = 10;

const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Exibe a fila de músicas')
  .addIntegerOption(o => o
    .setName('pagina')
    .setDescription('Número da página (padrão: 1)')
    .setMinValue(1));

async function execute(interaction) {
  const state = getState(interaction.guild.id);

  if (!state?.currentTrack && (!state?.queue || state.queue.length === 0)) {
    return interaction.reply({ content: '📭 Nada tocando e a fila está vazia.', flags: MessageFlags.Ephemeral });
  }

  const queue    = state.queue;
  const total    = queue.length;
  const pages    = Math.max(1, Math.ceil(total / PER_PAGE));
  const page     = Math.min(interaction.options.getInteger('pagina') ?? 1, pages);
  const start    = (page - 1) * PER_PAGE;
  const slice    = queue.slice(start, start + PER_PAGE);

  const lines = [];

  // Cabeçalho
  lines.push(`🎶 **Fila de Músicas** | Página **${page}/${pages}** | ${total} música(s) na fila`);
  lines.push('');

  // Faixa atual
  if (state.currentTrack) {
    lines.push('**Tocando agora:**');
    lines.push(`▶️ **${state.currentTrack.title}** \`${state.currentTrack.duration}\` — *${state.currentTrack.requestedBy}*`);
    lines.push('');
  }

  // Fila
  if (slice.length > 0) {
    lines.push('**Fila:**');
    for (let i = 0; i < slice.length; i++) {
      const track = slice[i];
      const pos   = start + i + 1;
      lines.push(`\`${String(pos).padStart(2)}\` **${track.title}** \`${track.duration}\` — *${track.requestedBy}*`);
    }
  } else if (total === 0) {
    lines.push('*A fila está vazia — esta é a última música.*');
  }

  // Navegação
  if (pages > 1) {
    lines.push('');
    lines.push(`Use \`/queue pagina:${page < pages ? page + 1 : 1}\` para ver a próxima página.`);
  }

  await interaction.reply({ content: lines.join('\n'), ephemeral: false });
}

module.exports = { data, execute };
