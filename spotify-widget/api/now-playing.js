const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing?market=BR';
const RECENTLY_PLAYED_URL = 'https://api.spotify.com/v1/me/player/recently-played?limit=1';

async function getAccessToken() {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao renovar token do Spotify (${response.status})`);
  }

  const data = await response.json();
  return data.access_token;
}

function shapeTrack(track, isPlaying, progressMs) {
  return {
    isPlaying,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    album: track.album.name,
    albumArt: track.album.images?.[0]?.url ?? null,
    songUrl: track.external_urls?.spotify ?? null,
    progressMs: progressMs ?? 0,
    durationMs: track.duration_ms ?? 0,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=30');

  try {
    const accessToken = await getAccessToken();
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const nowPlayingRes = await fetch(NOW_PLAYING_URL, { headers: authHeader });

    if (nowPlayingRes.status === 200) {
      const data = await nowPlayingRes.json();
      if (data && data.item) {
        res.status(200).json(shapeTrack(data.item, data.is_playing, data.progress_ms));
        return;
      }
    }

    // Nada tocando agora (204 ou sem item) - mostra a última música ouvida.
    const recentRes = await fetch(RECENTLY_PLAYED_URL, { headers: authHeader });
    if (!recentRes.ok) {
      throw new Error(`Falha ao buscar últimas músicas (${recentRes.status})`);
    }
    const recentData = await recentRes.json();
    const lastItem = recentData.items?.[0]?.track;

    if (!lastItem) {
      res.status(200).json({ isPlaying: false, title: null });
      return;
    }

    res.status(200).json(shapeTrack(lastItem, false, null));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
