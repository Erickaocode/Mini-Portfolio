// Rode uma única vez na sua máquina pra obter o refresh token:
//   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node get-refresh-token.js
//
// Antes, cadastre esta URL como Redirect URI no seu app em
// https://developer.spotify.com/dashboard -> Edit Settings:
//   http://127.0.0.1:8888/callback

const http = require('http');
const { URL, URLSearchParams } = require('url');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPE = 'user-read-currently-playing user-read-playback-state user-read-recently-played';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Defina SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET antes de rodar este script.');
  process.exit(1);
}

const authorizeUrl = new URL('https://accounts.spotify.com/authorize');
authorizeUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  scope: SCOPE,
  redirect_uri: REDIRECT_URI,
}).toString();

console.log('\nAbra esta URL no navegador e autorize com sua conta Spotify:\n');
console.log(authorizeUrl.toString());
console.log('\nAguardando o redirecionamento em http://127.0.0.1:8888/callback ...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);

  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400).end(`Erro na autorização: ${error}`);
    server.close();
    return;
  }

  try {
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok) {
      throw new Error(data.error_description || 'Falha ao trocar o code pelo token.');
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Pronto!</h1><p>Pode fechar esta aba e voltar pro terminal.</p>');

    console.log('\nSeu refresh token (guarde com segurança, é o único segredo que importa):\n');
    console.log(data.refresh_token);
    console.log('\nUse-o como variável de ambiente SPOTIFY_REFRESH_TOKEN no Vercel.\n');
  } catch (err) {
    res.writeHead(500).end(err.message);
    console.error(err.message);
  } finally {
    server.close();
  }
});

server.listen(8888);
