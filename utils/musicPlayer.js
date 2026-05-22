// ============================================================
//  Chaos RPG Bot — Music Player
//  Metadados/busca : yt-dlp (dump-json / ytsearch1)
//  Spotify         : Spotify Web API (Authorization Code flow)
//  Streaming       : yt-dlp → ffmpeg (pipe local, PCM raw)
// ============================================================

const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  StreamType,
} = require('@discordjs/voice');
const path      = require('path');
const fs        = require('fs');
const https     = require('https');
const { spawn, execFileSync } = require('child_process');
const YTDlpWrap = require('yt-dlp-wrap').default;

// ── ffmpeg ────────────────────────────────────────────────────
// No Linux (Railway/nixpacks) preferimos o ffmpeg do sistema, que é instalado
// via nixpacks.toml e fica disponível no PATH como 'ffmpeg'.
// No Windows (dev local) e como fallback no Linux usamos o ffmpeg-static.
const _FFMPEG_BIN = (() => {
  if (process.platform === 'win32') return require('ffmpeg-static');
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg'; // sistema (nixpacks)
  } catch {
    return require('ffmpeg-static'); // fallback bundled
  }
})();

// ── yt-dlp ───────────────────────────────────────────────────
// No Windows (dev local) o binário fica em bin/ junto ao projeto.
// No Linux (Railway, Render, VPS) bin/ é somente-leitura — usa /tmp,
// que é sempre gravável em ambientes de contêiner.
const _BIN_NAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const _BIN_PATH = process.platform === 'win32'
  ? path.join(__dirname, '..', 'bin', _BIN_NAME)
  : path.join('/tmp', _BIN_NAME);
let _ytDlpReady = false;

async function _ensureYtDlp() {
  if (_ytDlpReady) return;
  const wrap = new YTDlpWrap(_BIN_PATH);
  try {
    await wrap.getVersion();
    _ytDlpReady = true;
  } catch {
    console.log('[Music] yt-dlp não encontrado. Baixando do GitHub...');
    try {
      await YTDlpWrap.downloadFromGithub(_BIN_PATH);
      // Garante permissão de execução no Linux (necessário após download)
      if (process.platform !== 'win32') {
        try { fs.chmodSync(_BIN_PATH, 0o755); } catch {}
      }
      _ytDlpReady = true;
      console.log('[Music] yt-dlp pronto em', _BIN_PATH);
    } catch (err) {
      console.error('[Music] Falha ao baixar yt-dlp:', err.message);
      throw err;
    }
  }
}

// ── Spotify Web API ───────────────────────────────────────────
let _spToken   = null;
let _spExpires = 0;

const _SP_PATTERNS = {
  track:    /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([a-zA-Z0-9]+)/,
  playlist: /open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/([a-zA-Z0-9]+)/,
  album:    /open\.spotify\.com\/(?:intl-[a-z-]+\/)?album\/([a-zA-Z0-9]+)/,
};

function _spotifyType(url) {
  for (const [type, re] of Object.entries(_SP_PATTERNS)) {
    if (re.test(url)) return type;
  }
  return null;
}

function _spotifyId(url, type) {
  const m = url.match(_SP_PATTERNS[type]);
  return m ? m[1] : null;
}

/** Faz uma requisição HTTPS e retorna o body parseado como JSON. */
function _jsonRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode >= 400) {
            const msg = parsed?.error_description ?? parsed?.error?.message ?? parsed?.error ?? raw;
            reject(new Error(`HTTP ${res.statusCode}: ${msg}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error('Resposta não-JSON do servidor'));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Obtém (ou renova) o access token do Spotify.
 *
 * Se SPOTIFY_REFRESH_TOKEN estiver no .env, usa Authorization Code flow →
 * acessa playlists privadas do usuário (scope: playlist-read-private).
 *
 * Caso contrário, usa Client Credentials → apenas conteúdo público.
 *
 * Para obter o refresh_token, execute:  node scripts/spotify-auth.js
 */
async function _getSpotifyToken() {
  if (_spToken && Date.now() < _spExpires) return _spToken;

  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Credenciais do Spotify não configuradas no .env (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET).');
  }

  const auth         = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;


  // Authorization Code (refresh) → acesso de usuário (playlists privadas)
  // Client Credentials           → acesso de app (só conteúdo público)
  const bodyStr = refreshToken
    ? `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
    : 'grant_type=client_credentials';

  const body = Buffer.from(bodyStr);
  const data = await _jsonRequest({
    hostname: 'accounts.spotify.com',
    path:     '/api/token',
    method:   'POST',
    headers: {
      'Authorization':  `Basic ${auth}`,
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': body.length,
    },
  }, body);

  _spToken   = data.access_token;
  _spExpires = Date.now() + (data.expires_in - 60) * 1000;

  // Atualiza o refresh token se o Spotify emitiu um novo (rotação de token)
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    process.env.SPOTIFY_REFRESH_TOKEN = data.refresh_token;
    console.log('[Music] Spotify refresh token renovado. Atualize SPOTIFY_REFRESH_TOKEN no .env.');
  }

  return _spToken;
}

/** Faz um GET autenticado na Spotify Web API e retorna JSON. */
async function _spotifyGet(path) {
  const token = await _getSpotifyToken();
  return _jsonRequest({
    hostname: 'api.spotify.com',
    path,
    method:   'GET',
    headers:  { 'Authorization': `Bearer ${token}` },
  });
}

/**
 * Pagina resultados da Spotify API.
 * `basePath` deve conter o endpoint sem query string.
 * `getItems(page)` extrai o array de itens de cada página.
 * `mapper(item)` converte cada item; retorne null para pular.
 * Máximo de `maxItems` resultados.
 */
async function _spotifyPaginate(basePath, getItems, mapper, maxItems = 500, limit = 100) {
  let   offset  = 0;
  const results = [];

  while (results.length < maxItems) {
    const sep  = basePath.includes('?') ? '&' : '?';
    const page = await _spotifyGet(`${basePath}${sep}limit=${limit}&offset=${offset}`);
    const items = getItems(page) ?? [];

    for (const item of items) {
      const mapped = mapper(item);
      if (mapped) results.push(mapped);
      if (results.length >= maxItems) break;
    }

    if ((!page.next && !page.tracks?.next) || items.length === 0) break;
    offset += limit;
  }

  return results;
}

// ── Estado global por guild ───────────────────────────────────
const states = new Map();

// ── Helpers ───────────────────────────────────────────────────

/** Retorna uma instância de YTDlpWrap (stateless — só guarda o caminho do binário). */
function _getWrap() { return new YTDlpWrap(_BIN_PATH); }

/** Retorna true se a URL for de uma playlist do YouTube (contém list=). */
function _isYouTubePlaylist(url) {
  try {
    const u = new URL(url);
    return (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be'))
        && u.searchParams.has('list');
  } catch { return false; }
}

/**
 * Usa yt-dlp para buscar metadados de uma playlist do YouTube.
 * Mais confiável que play-dl, que tem playlist_info quebrada.
 */
async function _fetchYouTubePlaylist(url, requestedBy, max = 500, offset = 0) {
  await _ensureYtDlp();
  const wrap = _getWrap();

  const raw = await wrap.execPromise([
    url,
    '--flat-playlist',
    '--dump-json',
    '--no-warnings',
    '--quiet',
    `--playlist-start=${offset + 1}`,
    `--playlist-end=${offset + max}`,
  ]);

  const lines  = raw.trim().split('\n').filter(Boolean);
  if (!lines.length) throw new Error('Playlist vazia ou inacessível.');

  let playlistName = 'Playlist do YouTube';
  const tracks = lines.map(line => {
    const item = JSON.parse(line);
    if (item.playlist_title) playlistName = item.playlist_title;
    return {
      title:       item.title ?? 'Sem título',
      url:         `https://www.youtube.com/watch?v=${item.id}`,
      duration:    formatDuration(item.duration ?? 0),
      thumbnail:   item.thumbnails?.[item.thumbnails.length - 1]?.url ?? null,
      requestedBy,
    };
  });

  const totalCount = lines.length > 0 ? (JSON.parse(lines[0]).playlist_count ?? 0) : 0;
  const truncated  = totalCount > offset + max;
  const listId     = (() => { try { return new URL(url).searchParams.get('list'); } catch { return null; } })();

  return {
    tracks,
    playlistName,
    truncated,
    continuation: truncated && listId ? { type: 'yt', id: listId, offset: offset + max } : null,
  };
}

function formatDuration(sec) {
  if (!sec || sec < 0) return '?:??';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Busca o melhor resultado no YouTube via yt-dlp (ytsearch1:).
 *
 * Usar a mesma ferramenta para buscar e para streamar garante que o vídeo
 * encontrado é sempre streamável — evita o caso de play-dl retornar um
 * URL que yt-dlp não consegue acessar (resultado mudo sem erro).
 */
async function _ytSearch(query) {
  await _ensureYtDlp();
  const wrap = _getWrap();
  const raw  = await wrap.execPromise([
    `ytsearch1:${query}`,
    '--dump-json',
    '--no-playlist',
    '--flat-playlist',
    '--no-warnings',
    '--quiet',
  ]);

  const item = JSON.parse(raw.trim().split('\n')[0]);
  if (!item?.id) throw new Error(`Nenhum resultado no YouTube para "${query}".`);

  return {
    url:       `https://www.youtube.com/watch?v=${item.id}`,
    title:     item.title      ?? 'Sem título',
    duration:  item.duration   ?? 0,
    thumbnail: item.thumbnails?.[item.thumbnails.length - 1]?.url ?? null,
  };
}

function extractVideoId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/v\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Streaming: yt-dlp → ffmpeg → PCM raw (s16le 48 kHz stereo).
 * Tudo pipe local — sem HTTP entre o bot e a CDN, sem timeout.
 */
async function _getYouTubeAudioStream(url) {
  await _ensureYtDlp();

  const ytdlp = spawn(_BIN_PATH, [
    url,
    '-f', 'bestaudio',
    '--no-playlist',
    '-o', '-',
    '--quiet',
  ]);

  const ffmpeg = spawn(_FFMPEG_BIN, [
    '-i', 'pipe:0',
    '-vn',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);
  ytdlp.stderr.resume();
  ffmpeg.stderr.resume();

  // ── Tratamento de erros de pipe ───────────────────────────
  // EPIPE ocorre quando o player para (skip/stop/clear) enquanto yt-dlp
  // ainda está escrevendo. Sem um handler explícito o Node.js lança um
  // evento 'error' não-tratado e crasha o processo inteiro.
  // Absorvemos EPIPE silenciosamente; outros erros são logados.
  const _ignorePipe = err => {
    if (err.code !== 'EPIPE') console.error('[Music] pipe error:', err.message);
  };

  ytdlp.stdout.on('error', _ignorePipe);
  ffmpeg.stdin.on('error', _ignorePipe);

  ytdlp.on('error', err => {
    if (err.code !== 'EPIPE') console.error('[Music] yt-dlp error:', err.message);
    try { ffmpeg.stdin.destroy(); } catch {}
  });
  ffmpeg.on('error', err => {
    if (err.code !== 'EPIPE') console.error('[Music] ffmpeg error:', err.message);
  });

  return { stream: ffmpeg.stdout, type: StreamType.Raw };
}

/**
 * Se a faixa é do Spotify e ainda não tem URL do YouTube,
 * faz a busca agora (resolução lazy — ocorre só antes de tocar).
 */
async function _resolveTrackUrl(track) {
  if (track.url) return;
  if (!track.spotifyQuery) throw new Error(`Faixa sem URL: ${track.title}`);

  // Usa yt-dlp para buscar — garante que o resultado é sempre streamável
  const found    = await _ytSearch(track.spotifyQuery);
  track.url      = found.url;
  track.duration = formatDuration(found.duration);
  if (!track.thumbnail && found.thumbnail) track.thumbnail = found.thumbnail;
}

// ── Resolução de query ────────────────────────────────────────

/**
 * Resolve uma query para uma ou mais faixas.
 * Retorna { tracks: Track[], playlistName: string|null, truncated: boolean }
 *
 * Faixas do Spotify em playlists/álbuns são "lazy" — têm `spotifyQuery`
 * mas não `url`; a busca no YouTube acontece só antes de tocar.
 */
async function resolveQuery(query, requestedBy) {
  query = query.trim();

  // ── YouTube: playlist (detectada pelo parâmetro list= na URL) ─
  // Usamos yt-dlp em vez de play-dl (playlist_info do play-dl está quebrado)
  if (_isYouTubePlaylist(query)) {
    return _fetchYouTubePlaylist(query, requestedBy, 500);
  }

  // ── YouTube: link de vídeo ────────────────────────────────
  if (extractVideoId(query)) {
    await _ensureYtDlp();
    const raw  = await _getWrap().execPromise([
      query, '--dump-json', '--no-playlist', '--quiet', '--no-warnings',
    ]);
    const data = JSON.parse(raw.trim());
    return {
      tracks: [{
        title:       data.title ?? 'Sem título',
        url:         data.webpage_url ?? query,
        duration:    formatDuration(data.duration ?? 0),
        thumbnail:   data.thumbnails?.[data.thumbnails.length - 1]?.url ?? null,
        requestedBy,
      }],
      playlistName: null,
      truncated:    false,
      continuation: null,
    };
  }

  // ── Spotify ───────────────────────────────────────────────
  const spType = _spotifyType(query);

  if (spType === 'track') {
    const id    = _spotifyId(query, 'track');
    const track = await _spotifyGet(`/v1/tracks/${id}`);

    const artists  = track.artists?.map(a => a.name).join(', ') ?? '';
    const thumb    = track.album?.images?.[0]?.url ?? null;
    const ytSearch = `${artists} ${track.name}`;

    // Usa yt-dlp para buscar — mesma ferramenta do streaming, sem resultado mudo
    const found = await _ytSearch(ytSearch);

    return {
      tracks: [{
        title:       track.name ?? found.title,
        url:         found.url,
        duration:    formatDuration(found.duration),
        thumbnail:   thumb ?? found.thumbnail ?? null,
        requestedBy,
      }],
      playlistName: null,
      truncated:    false,
    };
  }

  if (spType === 'playlist') {
    const MAX    = 500;
    const id     = _spotifyId(query, 'playlist');
    const tracks = [];
    let   playlistName = 'Playlist do Spotify';
    let   total        = 0;

    // ── Busca a playlist (metadados + primeira página de faixas) ──
    // Não passa limit= aqui para garantir o formato padrão { name, tracks: { items, next, total } }
    let playlist;
    try {
      playlist = await _spotifyGet(`/v1/playlists/${id}`);
    } catch (err) {
      console.error('[Music] Spotify playlist erro:', err.message);
      if (err.message.includes('403')) {
        throw new Error(
          '❌ Spotify: acesso negado à playlist.\n' +
          '• Playlists editoriais do Spotify (Top 50, Radar de Novidades, etc.) não são acessíveis\n' +
          '• Refresh token expirado — rode `node scripts/spotify-auth.js` novamente'
        );
      }
      if (err.message.includes('404')) throw new Error('Playlist não encontrada no Spotify.');
      throw err;
    }

    playlistName = playlist.name ?? 'Playlist do Spotify';

    // Spotify retorna as faixas de duas formas dependendo da versão da API:
    // - Formato antigo: { name, tracks: { items: [...], next, total } }
    // - Formato novo:   { name, items: { href, items: [...], next, total } }
    const firstPageObj = playlist.tracks ?? playlist.items;
    total = firstPageObj?.total ?? 0;

    // Função auxiliar para mapear um item da resposta em Track
    // Spotify usa "item" no endpoint /items e "track" no endpoint /tracks
    const mapItem = item => {
      const t = item?.item ?? item?.track;
      if (!t?.name || t.type !== 'track') return null; // ignora episódios e itens inválidos
      const artists      = t.artists?.map(a => a.name).join(', ') ?? '';
      const spotifyQuery = `${artists} ${t.name}`.trim();
      return {
        title:        t.name,
        url:          null,
        spotifyQuery,
        duration:     '?:??',
        thumbnail:    t.album?.images?.[0]?.url ?? null,
        requestedBy,
      };
    };

    // Processa a primeira página
    for (const item of (firstPageObj.items ?? [])) {
      if (tracks.length >= MAX) break;
      const mapped = mapItem(item);
      if (mapped) tracks.push(mapped);
    }

    // Pagina o restante via next
    let rawNext = firstPageObj.next ?? null;
    try {
      while (rawNext && tracks.length < MAX) {
        let nextPath;
        try { nextPath = new URL(rawNext).pathname + new URL(rawNext).search; }
        catch { break; }

        const page = await _spotifyGet(nextPath);
        for (const item of (page.items ?? [])) {
          if (tracks.length >= MAX) break;
          const mapped = mapItem(item);
          if (mapped) tracks.push(mapped);
        }
        rawNext = page.next ?? null;
      }
    } catch (err) {
      if (tracks.length === 0) throw err;
      console.warn('[Music] Spotify: paginação interrompida após', tracks.length, 'faixas:', err.message);
    }

    if (!tracks.length) throw new Error('Playlist vazia ou sem faixas acessíveis.');

    return {
      tracks,
      playlistName,
      truncated:    total > MAX,
      continuation: total > MAX ? { type: 'sp', id, offset: MAX } : null,
    };
  }

  if (spType === 'album') {
    const MAX = 500;
    const id  = _spotifyId(query, 'album');

    // Metadados do álbum (inclui thumbnail)
    const album = await _spotifyGet(`/v1/albums/${id}`);
    const name  = album.name ?? 'Álbum do Spotify';
    const thumb = album.images?.[0]?.url ?? null;

    // Faixas (paginadas, lazy) — álbuns têm limite de 50 por página
    const tracks = await _spotifyPaginate(
      `/v1/albums/${id}/tracks`,
      page => page.items,
      item => {
        if (!item?.name) return null;
        const artists      = item.artists?.map(a => a.name).join(', ') ?? '';
        const spotifyQuery = `${artists} ${item.name}`.trim();
        return {
          title:         item.name,
          url:           null,
          spotifyQuery,
          duration:      '?:??',
          thumbnail:     thumb,
          requestedBy,
        };
      },
      MAX,
      50,   // max permitido pela API do Spotify para álbuns
    );

    return {
      tracks,
      playlistName: name,
      truncated:    (album.tracks?.total ?? 0) > MAX,
    };
  }

  // ── Busca por texto no YouTube ────────────────────────────
  const found = await _ytSearch(query);
  return {
    tracks: [{
      title:       found.title,
      url:         found.url,
      duration:    formatDuration(found.duration),
      thumbnail:   found.thumbnail ?? null,
      requestedBy,
    }],
    playlistName: null,
    truncated:    false,
  };
}

// Alias retrocompatível para faixas individuais
async function resolveTrack(query, requestedBy) {
  const { tracks } = await resolveQuery(query, requestedBy);
  return tracks[0];
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
    history:      [],
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
  // Remove do mapa ANTES de parar o player para que o evento Idle
  // disparado sincronamente por stop() não acione _playNext.
  states.delete(guildId);
  state.queue        = [];
  state.currentTrack = null;
  try { state.player.stop(true); }     catch {}
  try { state.connection?.destroy(); } catch {}
}

/** Conecta ao canal de voz (se ainda não estiver conectado). */
function _ensureConnection(state, voiceChannel) {
  if (state.connection) return;

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
      destroyState(voiceChannel.guild.id);
    }
  });
}

// ── Reprodução ────────────────────────────────────────────────

async function _playNext(guildId) {
  const state = states.get(guildId);
  if (!state) return;

  if (state.queue.length === 0) {
    state.currentTrack = null;
    state.textChannel?.send('✅ Fila concluída! Todas as músicas foram tocadas.').catch(() => {});
    return;
  }

  const track = state.queue.shift();
  state.currentTrack = track;

  try {
    // Resolução lazy: faixas do Spotify sem URL buscam no YouTube agora
    await _resolveTrackUrl(track);

    const { stream, type } = await _getYouTubeAudioStream(track.url);
    const resource = createAudioResource(stream, { inputType: type });
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

/** Adiciona uma única faixa à fila. */
async function addToQueue(guildId, track, voiceChannel, textChannel) {
  const state = states.get(guildId) ?? _createState(guildId);
  state.textChannel = textChannel;
  _ensureConnection(state, voiceChannel);

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

/** Adiciona múltiplas faixas à fila de uma vez (playlists). */
async function addManyToQueue(guildId, tracks, voiceChannel, textChannel) {
  if (!tracks.length) return { startPosition: 0, count: 0 };

  const state = states.get(guildId) ?? _createState(guildId);
  state.textChannel = textChannel;
  _ensureConnection(state, voiceChannel);

  const idle = state.player.state.status === AudioPlayerStatus.Idle
            && state.currentTrack === null
            && state.queue.length === 0;

  const startPosition = idle ? 0 : state.queue.length + 1;
  state.queue.push(...tracks);

  if (idle) await _playNext(guildId);

  return { startPosition, count: tracks.length };
}

async function restartCurrent(guildId) {
  const state = states.get(guildId);
  if (!state?.currentTrack) return false;

  try {
    const { stream, type } = await _getYouTubeAudioStream(state.currentTrack.url);
    const resource = createAudioResource(stream, { inputType: type });
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
  if (state.currentTrack) state.queue.unshift(state.currentTrack);
  state.queue.unshift(prevTrack);
  state.currentTrack = null;

  if (state.player.state.status === AudioPlayerStatus.Idle) {
    await _playNext(guildId);
  } else {
    state.player.stop();
  }

  return prevTrack;
}

/**
 * Carrega mais faixas a partir de onde uma playlist truncada parou.
 * @param {{ type: 'sp'|'yt', id: string, offset: number }} continuation
 * @param {string} requestedBy
 * @returns {{ tracks, playlistName, truncated, continuation }}
 */
async function loadMoreTracks(continuation, requestedBy) {
  const { type, id, offset } = continuation;
  const MAX = 500;

  if (type === 'yt') {
    return _fetchYouTubePlaylist(
      `https://www.youtube.com/playlist?list=${id}`,
      requestedBy,
      MAX,
      offset,
    );
  }

  if (type === 'sp') {
    const tracks  = [];
    let   nextUrl = `/v1/playlists/${id}/items?offset=${offset}&limit=100`;
    let   hasMore = false;

    while (nextUrl && tracks.length < MAX) {
      let reqPath;
      try { reqPath = new URL(nextUrl).pathname + new URL(nextUrl).search; }
      catch { reqPath = nextUrl; }

      const page = await _spotifyGet(reqPath);

      for (const item of (page.items ?? [])) {
        if (tracks.length >= MAX) break;
        const t = item?.item ?? item?.track;
        if (!t?.name || t.type !== 'track') continue;
        const artists      = t.artists?.map(a => a.name).join(', ') ?? '';
        const spotifyQuery = `${artists} ${t.name}`.trim();
        tracks.push({
          title:        t.name,
          url:          null,
          spotifyQuery,
          duration:     '?:??',
          thumbnail:    t.album?.images?.[0]?.url ?? null,
          requestedBy,
        });
      }

      nextUrl = page.next ?? null;
    }

    hasMore = !!nextUrl;
    return {
      tracks,
      playlistName: null, // já exibido na mensagem original
      truncated:    hasMore,
      continuation: hasMore ? { type: 'sp', id, offset: offset + tracks.length } : null,
    };
  }

  throw new Error('Tipo de continuação desconhecido: ' + type);
}

// Inicializa yt-dlp em background ao carregar o módulo
_ensureYtDlp().catch(err => console.warn('[Music] Falha ao inicializar yt-dlp:', err.message));

module.exports = {
  getState,
  destroyState,
  resolveQuery,
  resolveTrack,
  loadMoreTracks,
  addToQueue,
  addManyToQueue,
  restartCurrent,
  goBack,
  formatDuration,
};
