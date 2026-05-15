// ============================================================
//  Chaos RPG Bot — Music Player
//  Metadados/busca: play-dl (ainda funciona)
//  Streaming de áudio: youtubei.js cliente ANDROID
//    (retorna URLs diretas sem precisar decodificar o player do YT)
// ============================================================

// ffmpeg-static precisa estar no PATH antes de @discordjs/voice inicializar
process.env.FFMPEG_PATH = require('ffmpeg-static');

const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  StreamType,
} = require('@discordjs/voice');
const { Readable } = require('stream');
const play         = require('play-dl');

// ── Innertube (youtubei.js) — inicializado de forma lazy ─────
let _innertube     = null;
let _innertubeInit = null;

async function _getInnertube() {
  if (_innertube) return _innertube;
  if (!_innertubeInit) {
    const { Innertube } = require('youtubei.js');
    _innertubeInit = Innertube.create({
      client_type:             'ANDROID',
      generate_session_locally: true,
      cache:                    null,
    });
  }
  _innertube = await _innertubeInit;
  return _innertube;
}

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

/** Extrai o video ID de qualquer formato de URL do YouTube. */
function extractVideoId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/v\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,   // ID puro
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Cria um stream de áudio para o URL do YouTube usando youtubei.js ANDROID.
 * Retorna um Readable compatível com createAudioResource.
 */
async function _getYouTubeAudioStream(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error(`Não foi possível extrair o ID do vídeo: ${url}`);

  const yt   = await _getInnertube();
  const info = await yt.getBasicInfo(videoId, 'ANDROID');

  const download = await info.download({
    type:    'audio',
    quality: 'best',
    client:  'ANDROID',
  });

  return Readable.from(download);
}

// ── Resolução de faixa ────────────────────────────────────────

/**
 * Resolve uma query (nome, link YouTube ou link Spotify)
 * para um objeto de faixa { title, url, duration, thumbnail, requestedBy }.
 */
async function resolveTrack(query, requestedBy) {
  query = query.trim();

  // ── YouTube: link de vídeo ────────────────────────────────
  if (play.yt_validate(query) === 'video') {
    const info = await play.video_info(query);
    const v    = info.video_details;
    return {
      title:       v.title ?? 'Sem título',
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
  // sp_validate retorna 'track'|'album'|'playlist'|'search'|false
  // 'search' = texto puro, não é Spotify
  let spType = false;
  try { spType = play.sp_validate(query); } catch {}
  const isSpotify = spType === 'track' || spType === 'album' || spType === 'playlist';

  if (isSpotify) {
    if (isSpotify && spType !== 'track') {
      throw new Error('Somente músicas individuais do Spotify são suportadas (não álbuns nem playlists).');
    }
    try {
      const sp          = await play.spotify(query);
      const searchQuery = `${sp.artists.map(a => a.name).join(', ')} ${sp.name}`;
      const results     = await play.search(searchQuery, { limit: 1 });
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
  const results = await play.search(query, { limit: 1 });
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
    queue:        [],
    history:      [],   // últimas 20 faixas (mais recente = último)
    currentTrack: null,
    textChannel:  null,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    if (state.currentTrack) {
      state.history.push(state.currentTrack);
      if (state.history.length > 20) state.history.shift();
    }
    state.currentTrack = null;
    _playNext(guildId);
  });

  player.on('error', err => {
    console.error(`[Music][${guildId}] Player error: ${err.message}`);
    state.currentTrack = null;
    state.textChannel?.send('❌ Erro ao reproduzir a faixa. Pulando...').catch(() => {});
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
    const audioStream = await _getYouTubeAudioStream(track.url);
    // StreamType.Arbitrary → ffmpeg converte AAC/WebM para Opus automaticamente
    const resource    = createAudioResource(audioStream, { inputType: StreamType.Arbitrary });
    state.player.play(resource);

    state.textChannel
      ?.send(`🎵 Tocando agora: **${track.title}** \`${track.duration}\` — pedido por *${track.requestedBy}*`)
      .catch(() => {});
  } catch (err) {
    console.error(`[Music][${guildId}] Erro ao tocar "${track.title}":`, err.message);
    state.textChannel
      ?.send(`❌ Não foi possível tocar **${track.title}**. Pulando...`)
      .catch(() => {});
    _playNext(guildId);
  }
}

// ── API pública ───────────────────────────────────────────────

async function addToQueue(guildId, track, voiceChannel, textChannel) {
  const state = states.get(guildId) ?? _createState(guildId);
  state.textChannel = textChannel;

  if (!state.connection) {
    const conn = joinVoiceChannel({
      channelId:      voiceChannel.id,
      guildId:        voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf:       true,
    });
    conn.subscribe(state.player);
    state.connection = conn;

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

async function restartCurrent(guildId) {
  const state = states.get(guildId);
  if (!state?.currentTrack) return false;

  try {
    const audioStream = await _getYouTubeAudioStream(state.currentTrack.url);
    const resource    = createAudioResource(audioStream, { inputType: StreamType.Arbitrary });
    state.player.play(resource);
    return true;
  } catch (err) {
    console.error(`[Music][${guildId}] Restart error:`, err.message);
    return false;
  }
}

async function goBack(guildId) {
  const state = states.get(guildId);
  if (!state || state.history.length === 0) return null;

  const prevTrack = state.history.pop();

  if (state.currentTrack) {
    state.queue.unshift(state.currentTrack);
  }
  state.queue.unshift(prevTrack);
  state.currentTrack = null;

  if (state.player.state.status === AudioPlayerStatus.Idle) {
    await _playNext(guildId);
  } else {
    state.player.stop();
  }

  return prevTrack;
}

module.exports = {
  getState,
  destroyState,
  resolveTrack,
  addToQueue,
  restartCurrent,
  goBack,
  formatDuration,
};
