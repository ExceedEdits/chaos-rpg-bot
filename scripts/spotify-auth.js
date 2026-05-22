// ============================================================
//  Chaos RPG Bot — Spotify Auth Helper
//  Executa UMA VEZ para obter o refresh_token do Spotify.
//
//  Pré-requisitos:
//    1. Hospede scripts/spotify-callback.html no GitHub Pages:
//       a. Crie um repositório público no GitHub (ex: "spotify-callback")
//       b. Faça upload do arquivo scripts/spotify-callback.html como "index.html"
//       c. Vá em Settings → Pages → Source: Deploy from a branch → main / (root)
//       d. Anote a URL (ex: https://seu-usuario.github.io/spotify-callback/)
//
//    2. No painel do Spotify (https://developer.spotify.com/dashboard):
//       Abra seu app → Edit Settings → Redirect URIs →
//       Adicione a URL do GitHub Pages (ex: https://seu-usuario.github.io/spotify-callback/)
//       → Save
//
//    3. SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET e SPOTIFY_REDIRECT_URI no .env
//       SPOTIFY_REDIRECT_URI=https://seu-usuario.github.io/spotify-callback/
//
//  Uso:
//    node scripts/spotify-auth.js
// ============================================================

require('dotenv').config();
const https    = require('https');
const readline = require('readline');

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI;
const SCOPES        = 'playlist-read-private playlist-read-collaborative';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ SPOTIFY_CLIENT_ID e/ou SPOTIFY_CLIENT_SECRET não encontrados no .env');
  process.exit(1);
}

if (!REDIRECT_URI) {
  console.error('❌ SPOTIFY_REDIRECT_URI não encontrado no .env');
  console.error('   Adicione a URL do GitHub Pages ao .env:');
  console.error('   SPOTIFY_REDIRECT_URI=https://seu-usuario.github.io/spotify-callback/');
  process.exit(1);
}

// ── URL de autorização do Spotify ─────────────────────────────
const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
  client_id:     CLIENT_ID,
  response_type: 'code',
  redirect_uri:  REDIRECT_URI,
  scope:         SCOPES,
});

console.log('\n======================================================');
console.log('  Spotify Auth — Obtenção do Refresh Token');
console.log('======================================================\n');
console.log('1. Abra o link abaixo no navegador e autorize o app:\n');
console.log('   ' + authUrl);
console.log('\n2. Você será redirecionado para sua página do GitHub Pages.');
console.log('   Copie o código exibido na tela.\n');

// ── Leitura do código via terminal ────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('3. Cole o código aqui e pressione Enter:\n\n   > ', async code => {
  rl.close();
  code = code.trim();

  if (!code) {
    console.error('\n❌ Nenhum código informado. Execute novamente.');
    process.exit(1);
  }

  console.log('\n⏳ Trocando o código pelo refresh_token...\n');

  try {
    const tokens = await _exchangeCode(code);

    console.log('======================================================');
    console.log('✅ Sucesso! Adicione ao seu .env:\n');
    console.log('SPOTIFY_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\nDepois reinicie o bot.');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ Erro ao trocar o código:', err.message);
    console.error('   O código pode ter expirado (~10 min). Execute o script novamente.');
    process.exit(1);
  }
});

// ── Troca o authorization code pelo refresh_token ─────────────
function _exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const body = Buffer.from(new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }).toString());

    const req = https.request({
      hostname: 'accounts.spotify.com',
      path:     '/api/token',
      method:   'POST',
      headers: {
        'Authorization':  `Basic ${auth}`,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': body.length,
      },
    }, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 400 || data.error) {
            reject(new Error(`Spotify ${res.statusCode}: ${data.error_description ?? data.error ?? raw}`));
          } else if (!data.refresh_token) {
            reject(new Error(
              'Resposta sem refresh_token. Verifique se o Redirect URI no painel\n' +
              'do Spotify é exatamente: ' + REDIRECT_URI
            ));
          } else {
            resolve(data);
          }
        } catch {
          reject(new Error('Resposta inválida do Spotify.'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
