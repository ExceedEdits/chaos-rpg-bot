// ============================================================
//  Chaos RPG Bot — /play
//  Toca imediatamente ou adiciona à fila.
//  Aceita nome, link de vídeo/playlist do YouTube e
//  link de faixa/playlist/álbum do Spotify.
// ============================================================

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  getState,
  resolveQuery,
  addToQueue,
  addManyToQueue,
} = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Toca uma música, playlist ou álbum')
  .addStringOption(o => o
    .setName('query')
    .setDescription('Nome, link do YouTube (vídeo/playlist) ou link do Spotify (faixa/playlist/álbum)')
    .setRequired(true));

async function execute(interaction) {
  const query  = interaction.options.getString('query');
  const member = interaction.member;
  const guild  = interaction.guild;

  // Usuário deve estar em um canal de voz
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) {
    return interaction.reply({ content: '❌ Entre em um canal de voz primeiro.', ephemeral: true });
  }

  // Se o bot já está em outro canal desta guild, bloqueia
  const state = getState(guild.id);
  if (state?.connection) {
    const botChannelId = state.connection.joinConfig?.channelId;
    if (botChannelId && botChannelId !== voiceChannel.id) {
      return interaction.reply({
        content: `❌ Já estou tocando em <#${botChannelId}>. Entre nesse canal ou use \`/stop\` primeiro.`,
        ephemeral: true,
      });
    }
  }

  await interaction.deferReply();

  let resolved;
  try {
    resolved = await resolveQuery(query, interaction.user.username);
  } catch (err) {
    return interaction.editReply(`❌ ${err.message}`);
  }

  const { tracks, playlistName, truncated, continuation } = resolved;

  if (!tracks.length) {
    return interaction.editReply('❌ Nenhuma faixa encontrada.');
  }

  // ── Playlist / Álbum ──────────────────────────────────────
  if (playlistName) {
    // Calcula posição antes de adicionar para poder responder imediatamente
    const curState      = getState(guild.id);
    const isIdle        = !curState?.currentTrack && !(curState?.queue.length);
    const startPosition = isIdle ? 0 : (curState?.queue.length ?? 0) + 1;
    const count         = tracks.length;

    const truncNote = truncated ? ` *(primeiras ${count} faixas carregadas)*` : '';
    const text = startPosition === 0
      ? `▶️ Tocando **${playlistName}** — ${count} músicas adicionadas à fila.${truncNote}`
      : `📋 **${playlistName}** adicionada — ${count} músicas a partir da posição **#${startPosition}**.${truncNote}`;

    // Responde imediatamente (antes do addManyToQueue, que pode demorar)
    await interaction.editReply(text);

    // Botão "carregar mais" enviado em followUp separado para garantir visibilidade
    // (editReply em respostas deferidas pode perder components silenciosamente)
    if (truncated && continuation) {
      const customId = `loadmore:${continuation.type}:${continuation.id}:${continuation.offset}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel('Carregar mais músicas')
          .setStyle(ButtonStyle.Secondary),
      );
      await interaction.followUp({ content: '📂 Há mais músicas disponíveis nesta playlist.', components: [row] });
    }

    // Adiciona à fila após as respostas já terem sido enviadas
    try {
      await addManyToQueue(guild.id, tracks, voiceChannel, interaction.channel);
    } catch (err) {
      console.error('[Music] addManyToQueue error:', err);
      await interaction.followUp({ content: '❌ Não foi possível conectar ao canal de voz.', ephemeral: true });
    }
    return;
  }

  // ── Faixa única ───────────────────────────────────────────
  const track = tracks[0];
  let position;
  try {
    ({ position } = await addToQueue(guild.id, track, voiceChannel, interaction.channel));
  } catch (err) {
    console.error('[Music] addToQueue error:', err);
    return interaction.editReply('❌ Não foi possível conectar ao canal de voz.');
  }

  if (position === 0) {
    return interaction.editReply(`▶️ Tocando: **${track.title}** \`${track.duration}\``);
  }
  return interaction.editReply(
    `📋 Adicionado à fila na posição **#${position}**: **${track.title}** \`${track.duration}\``
  );
}

module.exports = { data, execute };
