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

  // Sempre baixa a versão mais recente do GitHub.
  // O parâmetro "n" do YouTube muda frequentemente — yt-dlp desatualizado
  // falha com "Requested format is not available" em todos os clients.
  // No Railway /tmp é limpo a cada deploy, então o download sempre ocorre.
  // Em dev local: só baixa se o binário não existir ou estiver com mais de 24h.
  const needsDownload = (() => {
    try {
      const stat = fs.statSync(_BIN_PATH);
      if (process.platform !== 'win32') {
        // No Linux, /tmp é limpo no redeploy — sempre baixa
        return true;
      }
      // No Windows (dev local), atualiza a cada 24 horas
      return Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000;
    } catch {
      return true; // não existe
    }
  })();

  if (needsDownload) {
    console.log('[Music] Baixando yt-dlp mais recente do GitHub...');
    try {
      await YTDlpWrap.downloadFromGithub(_BIN_PATH);
      if (process.platform !== 'win32') {
        try { fs.chmodSync(_BIN_PATH, 0o755); } catch {}
      }
      console.log('[Music] yt-dlp atualizado com sucesso.');
    } catch (downloadErr) {
      console.warn('[Music] Falha ao baixar yt-dlp:', downloadErr.message, '— tentando binário existente...');
    }
  }

  const wrap = new YTDlpWrap(_BIN_PATH);
  try {
    const version = await wrap.getVersion();
    _ytDlpReady = true;
    console.log('[Music] yt-dlp pronto. Versão:', version);
  } catch (err) {
    console.error('[Music] yt-dlp não funciona:', err.message);
    throw err;
  }
}

// ── YouTube bot detection workaround ─────────────────────────
// O YouTube bloqueia IPs de data center (Railway, Render, VPS) com
// "Sign in to confirm you're not a bot". Duas estratégias combinadas:
//
//  1. player_client=ios — simula o app do YouTube no iOS, que usa
//     uma API diferente sem bot check. Funciona na maioria dos casos.
//
//  2. Cookies (opcional) — se YOUTUBE_COOKIES_B64 estiver no .env,
//     o conteúdo do cookies.txt (formato Netscape) em base64 é gravado
//     em /tmp e passado via --cookies. Mais robusto para contas logadas.
//
//     Como exportar:
//       Chrome → extensão "Get cookies.txt LOCALLY" → Export as Netscape
//       base64 -w 0 cookies.txt   (Linux/Mac)
//       [Convert]::ToBase64String([IO.File]::ReadAllBytes("cookies.txt"))   (PowerShell)
//     Cole o resultado em YOUTUBE_COOKIES_B64 nas variáveis do Railway.

const _COOKIES_PATH = path.join(
  process.platform === 'win32' ? (process.env.TEMP ?? 'C:\\Temp') : '/tmp',
  'yt-cookies.txt',
);
let _cookiesWritten = false;

/**
 * Valida o conteúdo de um arquivo cookies.txt em formato Netscape.
 * Retorna { valid: true } ou { valid: false, reason: string }.
 */
function _validateCookiesContent(content) {
  // Deve ser formato Netscape HTTP Cookie File
  if (!content.includes('# Netscape HTTP Cookie File') && !content.includes('# HTTP Cookie File')) {
    return {
      valid:  false,
      reason: 'Formato inválido — o arquivo não começa com "# Netscape HTTP Cookie File".\n' +
              '  Use a extensão "Get cookies.txt LOCALLY" no Chrome e exporte como Netscape.\n' +
              '  NÃO use exportação JSON ou de outra extensão.',
    };
  }
  if (!content.includes('youtube.com')) {
    return {
      valid:  false,
      reason: 'Nenhuma entrada de youtube.com encontrada.\n' +
              '  Exporte os cookies estando na aba youtube.com (não youtube.com/music).',
    };
  }
  // Verifica presença de pelo menos um cookie de autenticação essencial
  const authCookies = ['SAPISID', 'HSID', 'SSID', '__Secure-1PSID', '__Secure-3PSID', 'SID'];
  const found = authCookies.filter(c => content.includes(c));
  if (found.length === 0) {
    return {
      valid:  false,
      reason: 'Cookies de autenticação não encontrados (SAPISID, HSID, SID, etc.).\n' +
              '  Certifique-se de estar LOGADO no YouTube ao exportar os cookies.\n' +
              '  Cookies exportados sem login não funcionam para bypass de bot detection.',
    };
  }
  return { valid: true, authFound: found };
}

function _ensureYtCookies() {
  if (_cookiesWritten) return;
  const b64 = process.env.YOUTUBE_COOKIES_B64;
  if (!b64) return;
  try {
    const content = Buffer.from(b64, 'base64').toString('utf8');

    // Validação de formato e autenticação
    const check = _validateCookiesContent(content);
    if (!check.valid) {
      console.error('[Music] ❌ Cookies do YouTube INVÁLIDOS:', check.reason);
      return; // não grava — cookies ruins são piores que nenhum cookie
    }

    // Normaliza quebras de linha (Windows CRLF → LF) para evitar parsing errors
    const normalized = content.replace(/\r\n/g, '\n');
    fs.writeFileSync(_COOKIES_PATH, normalized, 'utf8');
    _cookiesWritten = true;
    console.log(`[Music] ✅ Cookies do YouTube válidos. Cookies de auth encontrados: ${check.authFound.join(', ')}`);
  } catch (err) {
    console.warn('[Music] Falha ao gravar cookies do YouTube:', err.message);
  }
}

/**
 * Retorna os args do yt-dlp que contornam bot detection.
 *
 * Com cookies válidos → player_client=web (compatível com cookies do browser)
 *                        + youtubetab:skip=authcheck (playlists com cookies)
 * Sem cookies / fallback → player_client=ios,android,mweb (bypass de IPs
 *   de data center sem autenticação — tenta os 3 em sequência)
 */
function _ytBotArgs() {
  _ensureYtCookies();

  if (_cookiesWritten) {
    // player_client: android → tv_embedded → web (compatíveis com cookies).
    // player_skip=js → não baixa o JavaScript do player do YouTube para
    //   descriptografar o parâmetro "n". Usa a implementação interna do
    //   yt-dlp, que é atualizada a cada release. Evita o erro
    //   "Requested format is not available" causado por falha na descriptografia.
    // IMPORTANTE: skip=dash NÃO deve ser usado — ele desativa o caminho
    //   de autenticação que aplica os cookies, causando "Sign in" errors.
    return [
      '--extractor-args', 'youtube:player_client=android,tv_embedded,web;player_skip=js',
      '--extractor-args', 'youtubetab:skip=authcheck',
      '--cookies', _COOKIES_PATH,
      '--no-check-formats',
    ];
  }

  // Sem cookies: tenta ios → android → mweb.
  // ATENÇÃO: IPs de data center (Railway) são bloqueados pelo YouTube sem cookies.
  return [
    '--extractor-args', 'youtube:player_client=ios,android,mweb;player_skip=js',
    '--no-check-formats',
  ];
}

/**
 * Executa o yt-dlp com retry automático em caso de falha.
 *
 * Com cookies:
 *   1ª tentativa: android,tv_embedded,web + cookies
 *   Se falhar com bot/format error → tenta cada client individualmente
 *   com os mesmos cookies antes de desistir.
 *
 * Sem cookies:
 *   1ª tentativa: ios,android,mweb
 *   Sem retry (IP bloqueado sem auth — não há o que tentar).
 */
async function _ytExec(wrap, args) {
  try {
    return await wrap.execPromise([...args, ..._ytBotArgs()]);
  } catch (err) {
    const isRecoverable = /Sign in|not a bot|confirm you|Failed to extract any player|Requested format is not available/i.test(err.message);

    // Sem cookies ou erro não-recuperável → propaga
    if (!_cookiesWritten || !isRecoverable) throw err;

    // Com cookies: tenta clients individualmente na ordem de confiabilidade
    const fallbackClients = ['android', 'tv_embedded', 'web', 'mweb'];
    let lastErr = err;

    for (const client of fallbackClients) {
      try {
        console.warn(`[Music] Falha com client primário. Tentando player_client=${client} + cookies...`);
        return await wrap.execPromise([
          ...args,
          '--extractor-args', `youtube:player_client=${client};player_skip=js`,
          '--extractor-args', 'youtubetab:skip=authcheck',
          '--cookies', _COOKIES_PATH,
          '--no-check-formats',
        ]);
      } catch (e) {
        const errLine = e.message.split('\n').find(l => l.includes('ERROR:')) ?? e.message.slice(0, 120);
        console.warn(`[Music] player_client=${client} falhou: ${errLine}`);
        lastErr = e;
      }
    }

    throw lastErr;
  }
}

// ── Spotify Web API ───────────────────────────────────────────

// Cache separado para Client Credentials e Authorization Code (user token)
// Client Credentials: acessa qualquer conteúdo PÚBLICO de qualquer usuário.
// Authorization Code: acessa playlists PRIVADAS da conta autenticada.
let _spCCToken   = null;  // Client Credentials
let _spCCExpires = 0;
let _spACToken   = null;  // Authorization Code (refresh token do .env)
let _spACExpires = 0;

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
            const err  = new Error(`HTTP ${res.statusCode}: ${msg}`);
            err.status = res.statusCode;
            reject(err);
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
 * Obtém (ou renova) o access token via Client Credentials.
 * Funciona para qualquer conteúdo público de qualquer usuário do Spotify.
 */
async function _getClientCredentialsToken() {
  if (_spCCToken && Date.now() < _spCCExpires) return _spCCToken;

  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Credenciais do Spotify não configuradas no .env (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET).');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = Buffer.from('grant_type=client_credentials');

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

  _spCCToken   = data.access_token;
  _spCCExpires = Date.now() + (data.expires_in - 60) * 1000;
  return _spCCToken;
}

/**
 * Obtém (ou renova) o access token via Authorization Code (refresh token).
 * Necessário apenas para playlists PRIVADAS da conta configurada no .env.
 * Retorna null se SPOTIFY_REFRESH_TOKEN não estiver configurado.
 *
 * Para obter o refresh_token, execute:  node scripts/spotify-auth.js
 */
async function _getUserToken() {
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!refreshToken) return null;
  if (_spACToken && Date.now() < _spACExpires) return _spACToken;

  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const auth    = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const bodyStr = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;
  const body    = Buffer.from(bodyStr);

  try {
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

    _spACToken   = data.access_token;
    _spACExpires = Date.now() + (data.expires_in - 60) * 1000;

    // Atualiza o refresh token se o Spotify emitiu um novo (rotação de token)
    if (data.refresh_token && data.refresh_token !== refreshToken) {
      process.env.SPOTIFY_REFRESH_TOKEN = data.refresh_token;
      console.log('[Music] Spotify refresh token renovado. Atualize SPOTIFY_REFRESH_TOKEN no .env.');
    }

    return _spACToken;
  } catch (err) {
    console.warn('[Music] Falha ao renovar user token do Spotify:', err.message);
    return null;
  }
}

/**
 * Faz um GET autenticado na Spotify Web API.
 *
 * Estratégia de token:
 *  1. Tenta Client Credentials — funciona para qualquer conteúdo público
 *     de qualquer usuário do Spotify (playlists, álbuns, faixas).
 *  2. Se receber 401/403 E houver refresh token configurado, tenta o
 *     user token (Authorization Code) — para playlists privadas da conta
 *     do .env.
 *  3. Se ambos falharem, lança o erro original com mensagem amigável.
 */
async function _spotifyGet(path) {
  // ── Tentativa 1: Client Credentials (qualquer conteúdo público) ──
  try {
    const ccToken = await _getClientCredentialsToken();
    return await _jsonRequest({
      hostname: 'api.spotify.com',
      path,
      method:   'GET',
      headers:  { 'Authorization': `Bearer ${ccToken}` },
    });
  } catch (ccErr) {
    // Se não for 401/403, propaga imediatamente (ex: 404 não existe)
    if (!ccErr.status || (ccErr.status !== 401 && ccErr.status !== 403)) {
      if (ccErr.message?.includes('404')) throw new Error('Conteúdo não encontrado no Spotify.');
      throw ccErr;
    }

    // ── Tentativa 2: User token (playlists privadas da conta configurada) ──
    const userToken = await _getUserToken();
    if (!userToken) {
      throw new Error(
        '❌ Acesso negado pelo Spotify.\n' +
        '• A playlist pode ser **privada** — só o dono consegue acessar.\n' +
        '• Playlists editoriais do Spotify (ex: Top 50, Radar de Novidades) bloqueiam acesso externo.\n' +
        '• Se for sua playlist privada, configure `SPOTIFY_REFRESH_TOKEN` no .env e rode `node scripts/spotify-auth.js`.'
      );
    }

    try {
      return await _jsonRequest({
        hostname: 'api.spotify.com',
        path,
        method:   'GET',
        headers:  { 'Authorization': `Bearer ${userToken}` },
      });
    } catch (userErr) {
      throw new Error(
        '❌ Acesso negado pelo Spotify.\n' +
        '• A playlist pode ser **privada** de outro usuário (impossível de acessar).\n' +
        '• Playlists editoriais do Spotify bloqueiam acesso externo.\n' +
        '• Certifique-se de que o link é de uma playlist **pública**.'
      );
    }
  }
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

  const raw = await _ytExec(wrap, [
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
 * Se o YouTube bloquear (bot detection), cai automaticamente para SoundCloud.
 */
async function _ytSearch(query) {
  await _ensureYtDlp();
  const wrap = _getWrap();

  try {
    const raw  = await _ytExec(wrap, [
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
      source:    'youtube',
    };
  } catch (ytErr) {
    const isBotBlock = /Sign in|not a bot|confirm you/i.test(ytErr.message);
    if (!isBotBlock) throw ytErr;

    // ── Fallback: SoundCloud ──────────────────────────────────
    // SoundCloud não bloqueia IPs de data center — funciona sem cookies.
    console.warn(`[Music] YouTube bloqueou busca por "${query}". Tentando SoundCloud...`);
    return _scSearch(query);
  }
}

/**
 * Busca no SoundCloud via yt-dlp (scsearch1:).
 * Usado como fallback quando o YouTube bloqueia por bot detection.
 * SoundCloud não requer autenticação e funciona em IPs de data center.
 */
async function _scSearch(query) {
  await _ensureYtDlp();
  const wrap = _getWrap();
  const raw  = await wrap.execPromise([
    `scsearch1:${query}`,
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
  ]);

  const item = JSON.parse(raw.trim().split('\n')[0]);
  if (!item?.webpage_url) throw new Error(`Nenhum resultado no SoundCloud para "${query}".`);

  return {
    url:       item.webpage_url,
    title:     item.title    ?? 'Sem título',
    duration:  item.duration ?? 0,
    thumbnail: item.thumbnail ?? null,
    source:    'soundcloud',
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
/**
 * Busca título e thumbnail de um vídeo do YouTube via API pública de oEmbed.
 * Não requer autenticação — funciona mesmo quando o yt-dlp é bloqueado.
 * Retorna { title, thumbnail } ou null se falhar.
 */
async function _ytOEmbed(videoUrl) {
  try {
    const data = await _jsonRequest({
      hostname: 'www.youtube.com',
      path:     `/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
      method:   'GET',
      headers:  { 'User-Agent': 'Mozilla/5.0' },
    });
    return {
      title:     data.title        ?? null,
      thumbnail: data.thumbnail_url ?? null,
      author:    data.author_name   ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Retorna os args de extração adequados para a URL:
 * - YouTube → _ytBotArgs() (cookies + player_client)
 * - SoundCloud / outros → sem args especiais (não precisam de autenticação)
 */
function _streamArgs(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes('youtube.com') || host.includes('youtu.be')) return _ytBotArgs();
  } catch {}
  return []; // SoundCloud, Bandcamp, etc. não precisam de bot args
}

async function _getYouTubeAudioStream(url) {
  await _ensureYtDlp();

  const ytdlp = spawn(_BIN_PATH, [
    url,
    '-f', 'bestaudio/best',
    '--no-playlist',
    '-o', '-',
    '--quiet',
    ..._streamArgs(url),
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
    const wrap = _getWrap();

    try {
      const raw  = await _ytExec(wrap, [
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
    } catch (ytErr) {
      // ── Fallback: oEmbed → SoundCloud ──────────────────────
      // Quando o yt-dlp é bloqueado em links do YouTube, busca o título
      // via oEmbed (API pública, sem autenticação) e pesquisa no SoundCloud.
      const isBotBlock = /Sign in|not a bot|confirm you/i.test(ytErr.message);
      if (!isBotBlock) throw ytErr;

      console.warn('[Music] YouTube bloqueou link direto. Buscando título via oEmbed...');
      const meta = await _ytOEmbed(query);

      if (!meta?.title) {
        throw new Error(
          '❌ YouTube bloqueou o acesso e não foi possível obter o título do vídeo.\n' +
          'Configure `YOUTUBE_COOKIES_B64` no Railway para resolver o bloqueio.'
        );
      }

      const searchQuery = meta.author ? `${meta.title} ${meta.author}` : meta.title;
      console.warn(`[Music] Título obtido: "${meta.title}". Buscando no SoundCloud...`);
      const sc = await _scSearch(searchQuery);

      // Preserva thumbnail do YouTube se o SoundCloud não tiver
      if (!sc.thumbnail && meta.thumbnail) sc.thumbnail = meta.thumbnail;

      return {
        tracks: [{
          title:       `${sc.title} *(via SoundCloud)*`,
          url:         sc.url,
          duration:    formatDuration(sc.duration),
          thumbnail:   sc.thumbnail ?? null,
          requestedBy,
        }],
        playlistName: null,
        truncated:    false,
        continuation: null,
      };
    }
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
      throw err; // mensagem amigável já gerada por _spotifyGet
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

// ── Diagnóstico de startup ────────────────────────────────────

/**
 * Testa combinações de args do yt-dlp contra um vídeo público do YouTube.
 * Roda em background após o bot iniciar e loga qual combinação funciona.
 * Usa um vídeo curto e público (YouTube Help channel) para o teste.
 */
async function _runYtDiagnostic() {
  const TEST_URL  = 'https://www.youtube.com/watch?v=BaW_jenozKc'; // "me at the zoo" — 1º vídeo do YT, sempre público
  const TEST_ARGS = [
    '--dump-json', '--no-playlist', '--quiet', '--no-warnings',
  ];

  await _ensureYtDlp();
  _ensureYtCookies();

  const wrap = _getWrap();

  // Monta lista de combinações a testar
  const combos = [];

  if (_cookiesWritten) {
    combos.push(
      { label: 'cookies only (sem extractor-args)',                         args: ['--cookies', _COOKIES_PATH] },
      { label: 'cookies + android',                                         args: ['--cookies', _COOKIES_PATH, '--extractor-args', 'youtube:player_client=android'] },
      { label: 'cookies + tv_embedded',                                     args: ['--cookies', _COOKIES_PATH, '--extractor-args', 'youtube:player_client=tv_embedded'] },
      { label: 'cookies + android + player_skip=js',                        args: ['--cookies', _COOKIES_PATH, '--extractor-args', 'youtube:player_client=android;player_skip=js'] },
      { label: 'cookies + android + no-check-formats',                      args: ['--cookies', _COOKIES_PATH, '--extractor-args', 'youtube:player_client=android', '--no-check-formats'] },
      { label: 'cookies + android + player_skip=js + no-check-formats',     args: ['--cookies', _COOKIES_PATH, '--extractor-args', 'youtube:player_client=android;player_skip=js', '--no-check-formats'] },
    );
  }

  combos.push(
    { label: 'sem cookies + ios',           args: ['--extractor-args', 'youtube:player_client=ios'] },
    { label: 'sem cookies + android',       args: ['--extractor-args', 'youtube:player_client=android'] },
    { label: 'sem cookies + tv_embedded',   args: ['--extractor-args', 'youtube:player_client=tv_embedded'] },
    { label: 'sem cookies (padrão)',        args: [] },
  );

  console.log('[Music] ── Diagnóstico yt-dlp/YouTube ──────────────────────');
  if (_cookiesWritten) {
    console.log('[Music] Cookies: ✅ carregados e válidos');
  } else {
    console.log('[Music] Cookies: ❌ não configurados (YOUTUBE_COOKIES_B64 ausente ou inválido)');
  }

  let firstWorking = null;

  for (const combo of combos) {
    try {
      const raw  = await wrap.execPromise([TEST_URL, ...TEST_ARGS, ...combo.args]);
      const data = JSON.parse(raw.trim().split('\n')[0]);
      console.log(`[Music] ✅  ${combo.label} → "${data.title ?? '?'}"`);
      if (!firstWorking) firstWorking = combo;
    } catch (err) {
      const reason = err.message.split('\n').find(l => l.includes('ERROR:'))?.replace('ERROR:', '').trim()
                  ?? err.message.slice(0, 80);
      console.log(`[Music] ❌  ${combo.label} → ${reason}`);
    }
  }

  console.log('[Music] ─────────────────────────────────────────────────────');
  if (firstWorking) {
    console.log(`[Music] 🎯 Combinação recomendada: ${firstWorking.label}`);
  } else {
    console.log('[Music] ⚠️  Nenhuma combinação funcionou. YouTube pode estar bloqueando este IP.');
    console.log('[Music]    Fallback para SoundCloud ativo para buscas por texto/Spotify.');
  }
}

// Inicializa yt-dlp e cookies em background ao carregar o módulo
_ensureYtDlp()
  .then(() => _runYtDiagnostic())
  .catch(err => console.warn('[Music] Falha ao inicializar yt-dlp:', err.message));

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
