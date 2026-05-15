// ============================================================
//  Chaos RPG Bot — /play
//  Toca imediatamente ou adiciona à fila.
//  Aceita nome, link YouTube e link Spotify.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const { resolveTrack, addToQueue } = require('../../utils/musicPlayer');

const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Toca uma música ou adiciona à fila')
  .addStringOption(o => o
    .setName('query')
    .setDescription('Nome da música, link do YouTube ou link do Spotify')
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
  const { getState } = require('../../utils/musicPlayer');
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

  let track;
  try {
    track = await resolveTrack(query, interaction.user.username);
  } catch (err) {
    return interaction.editReply(`❌ ${err.message}`);
  }

  let position;
  try {
    ({ position } = await addToQueue(guild.id, track, voiceChannel, interaction.channel));
  } catch (err) {
    console.error('[Music] addToQueue error:', err);
    return interaction.editReply('❌ Não foi possível conectar ao canal de voz.');
  }

  if (position === 0) {
    // Está tocando agora — a notificação "Tocando agora" é enviada pelo playNext via textChannel
    await interaction.editReply(`▶️ Tocando: **${track.title}** \`${track.duration}\``);
  } else {
    await interaction.editReply(
      `📋 Adicionado à fila na posição **#${position}**: **${track.title}** \`${track.duration}\``
    );
  }
}

module.exports = { data, execute };
