// ============================================================
//  Chaos RPG Bot — Music Player
//  Gerencia conexão de voz, AudioPlayer e fila por guild.
// ============================================================

const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
} = require('@discordjs/voice');
const play = require('play-dl');

// ── Spotify (opcional) ────────────────────────────────────────
if (process.env.SPOTIFY_CLIENT_ID) {
  play.setToken({
    spotify: {
      client_id:     process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET ?? '',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN  ?? '',
      market:        'BR',
    },
  }).catch(e => console.warn('[Music] Spotify setup falhou:', e.message));
}

// ── Estado global por guild ───────────────────────────────────
// { connection, player, queue, currentTrack, textChannel }
const states = new Map();

// ── Helpers ───────────────────────────────────────────────────

function formatDuration(sec) {
  if (!sec || sec < 0) return '?:??';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Resolve uma query (nome, link YouTube ou link Spotify)
 * para um objeto de faixa.
 * @returns {{ title, url, duration, thumbnail, requestedBy }}
 */
async function resolveTrack(query, requestedBy) {
  query = query.trim();

  // ── YouTube: link de vídeo ────────────────────────────────
  if (play.yt_validate(query) === 'video') {
    const info = await play.video_info(query);
    const v    = info.video_details;
    return {
      title:       v.title          ?? 'Sem título',
      url:         v.url,
      duration:    formatDuration(v.durationInSec),
      thumbnail:   v.thumbnails?.[0]?.url ?? null,
      requestedBy,
    };
  }

  // ── YouTube: playlist ─────────────────────────────────────
  if (play.yt_validate(query) === 'playlist') {
    throw new Error('Playlists do YouTube ainda não são suportadas. Use um link de vídeo ou pesquise por nome.');
  }

  // ── Spotify ───────────────────────────────────────────────
  let spType = false;
  try { spType = play.sp_validate(query); } catch {}

  if (spType) {
    if (spType !== 'track') {
      throw new Error('Somente músicas individuais do Spotify são suportadas (não álbuns nem playlists).');
    }
    try {
      const sp          = await play.spotify(query);
      const searchQuery = `${sp.artists.map(a => a.name).join(', ')} ${sp.name}`;
      const results     = await play.search(searchQuery, { limit: 1, source: { youtube: 'video' } });
      if (!results.length) throw new Error(`Nenhum resultado no YouTube para "${searchQuery}".`);
      const v = results[0];
      return {
        title:       v.title              ?? sp.name,
        url:         v.url,
        duration:    formatDuration(v.durationInSec),
        thumbnail:   sp.thumbnail?.url    ?? v.thumbnails?.[0]?.url ?? null,
        requestedBy,
      };
    } catch (err) {
      if (/token|auth|credential/i.test(err.message)) {
        throw new Error(
          'Link do Spotify detectado, mas as credenciais não estão configuradas. ' +
          'Use o nome da música ou um link do YouTube.'
        );
      }
      throw err;
    }
  }

  // ── Busca por texto no YouTube ────────────────────────────
  const results = await play.search(query, { limit: 1, source: { youtube: 'video' } });
  if (!results.length) throw new Error(`Nenhum resultado encontrado para "${query}".`);
  const v = results[0];
  return {
    title:       v.title             ?? 'Sem título',
    url:         v.url,
    duration:    formatDuration(v.durationInSec),
    thumbnail:   v.thumbnails?.[0]?.url ?? null,
    requestedBy,
  };
}

// ── Gerenciamento de estado ───────────────────────────────────

function getState(guildId) {
  return states.get(guildId) ?? null;
}

function _createState(guildId) {
  const player = createAudioPlayer();
  const state  = {
    connection:   null,
    player,
    queue:        [],   // [{ title, url, duration, thumbnail, requestedBy }]
    currentTrack: null,
    textChannel:  null,
  };

  // Avança a fila automaticamente quando a faixa termina
  player.on(AudioPlayerStatus.Idle, () => {
    state.currentTrack = null;
    _playNext(guildId);
  });

  // Pula faixa com erro
  player.on('error', err => {
    console.error(`[Music][${guildId}] Player error: ${err.message}`);
    state.currentTrack = null;
    state.textChannel
      ?.send('❌ Erro ao reproduzir a faixa. Pulando...')
      .catch(() => {});
    _playNext(guildId);
  });

  states.set(guildId, state);
  return state;
}

function destroyState(guildId) {
  const state = states.get(guildId);
  if (!state) return;
  try { state.player.stop(true); }     catch {}
  try { state.connection?.destroy(); } catch {}
  states.delete(guildId);
}

// ── Reprodução ────────────────────────────────────────────────

async function _playNext(guildId) {
  const state = states.get(guildId);
  if (!state) return;

  if (state.queue.length === 0) {
    state.currentTrack = null;
    return;
  }

  const track = state.queue.shift();
  state.currentTrack = track;

  try {
    const stream   = await play.stream(track.url);
    const resource = createAudioResource(stream.stream, { inputType: stream.type });
    state.player.play(resource);

    state.textChannel
      ?.send(`🎵 Tocando agora: **${track.title}** \`${track.duration}\` — pedido por *${track.requestedBy}*`)
      .catch(() => {});
  } catch (err) {
    console.error(`[Music][${guildId}] Stream error para "${track.title}":`, err.message);
    state.textChannel
      ?.send(`❌ Não foi possível tocar **${track.title}**. Pulando...`)
      .catch(() => {});
    _playNext(guildId);
  }
}

/**
 * Adiciona uma faixa à fila. Se o player estiver ocioso, começa a tocar.
 * Entra no canal de voz se necessário.
 *
 * @returns {{ position: number }} — 0 = tocando agora; >0 = posição na fila
 */
async function addToQueue(guildId, track, voiceChannel, textChannel) {
  // Garante que existe estado para esta guild
  const state = states.get(guildId) ?? _createState(guildId);
  state.textChannel = textChannel;

  // Conecta / reconecta ao canal de voz
  if (!state.connection) {
    const conn = joinVoiceChannel({
      channelId:      voiceChannel.id,
      guildId:        voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf:       true,
    });
    conn.subscribe(state.player);
    state.connection = conn;

    // Limpa estado se desconectado inesperadamente
    conn.on('stateChange', (_, next) => {
      if (next.status === 'destroyed' || next.status === 'disconnected') {
        destroyState(guildId);
      }
    });
  }

  const idle = state.player.state.status === AudioPlayerStatus.Idle
            && state.currentTrack === null
            && state.queue.length === 0;

  state.queue.push(track);

  if (idle) {
    await _playNext(guildId);
    return { position: 0 };
  }

  return { position: state.queue.length };
}

module.exports = {
  getState,
  destroyState,
  resolveTrack,
  addToQueue,
  formatDuration,
};
