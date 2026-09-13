const DISCORD_USER_ID = '1062440850208067664';
const LANYARD_URL = `https://api.lanyard.rest/v1/users/${DISCORD_USER_ID}`;
const REDIS_KEY = 'discord:last-activity';
// O Lanyard às vezes tem uma falha passageira e devolve zero atividades por um instante,
// mesmo com o app continuando aberto. Damos essa folga antes de considerar a atividade
// realmente encerrada, pra não piscar pra "última atividade" à toa.
const GRACE_MS = 45000;

// Ignora status customizado (type 4) e o Spotify (já mostrado no widget de música).
function pickActivity(activities) {
  if (!Array.isArray(activities)) return null;
  return activities.find((a) => a.type !== 4 && !(a.type === 2 && a.name === 'Spotify')) || null;
}

function redisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisGet(key) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Falha ao ler do Redis (${res.status})`);
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function redisSet(key, value) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Falha ao gravar no Redis (${res.status})`);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=30');

  try {
    const lanyardRes = await fetch(LANYARD_URL, { cache: 'no-store' });
    if (!lanyardRes.ok) throw new Error(`Falha ao consultar Lanyard (${lanyardRes.status})`);
    const lanyardJson = await lanyardRes.json();
    if (!lanyardJson.success) throw new Error('Lanyard retornou success=false');

    const discordStatus = lanyardJson.data.discord_status || 'offline';
    const activity = pickActivity(lanyardJson.data.activities);

    if (activity) {
      const record = { activity, seenAt: Date.now() };
      // Precisa aguardar a gravação: a função serverless pode ser congelada assim que a resposta
      // é enviada, matando qualquer escrita ainda pendente em segundo plano.
      if (redisConfigured()) {
        await redisSet(REDIS_KEY, record).catch(() => {});
      }
      res.status(200).json({ discordStatus, activity, seenAt: record.seenAt, isCurrent: true });
      return;
    }

    const last = redisConfigured() ? await redisGet(REDIS_KEY).catch(() => null) : null;
    if (last && last.activity) {
      const withinGrace = Date.now() - last.seenAt < GRACE_MS;
      res.status(200).json({ discordStatus, activity: last.activity, seenAt: last.seenAt, isCurrent: withinGrace });
      return;
    }

    res.status(200).json({ discordStatus, activity: null, seenAt: null, isCurrent: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
