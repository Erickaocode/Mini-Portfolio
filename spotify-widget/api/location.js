// Recebe do celular (Atalhos do iPhone / MacroDroid / Tasker) a entrada e saída da academia.
// O próprio celular faz o geofence: aqui só chega "entrei"/"saí", nunca coordenadas nem o nome do lugar.
//
// POST /api/location
//   Authorization: Bearer <LOCATION_SECRET>
//   { "action": "arrive" }   -> passa a mostrar "Treinando"
//   { "action": "leave" }    -> volta ao normal
const REDIS_KEY = 'location:current';
// Se o aviso de saída falhar (celular sem sinal, bateria etc.), o status some sozinho depois disso.
const MAX_SESSION_SECONDS = 3 * 60 * 60;

async function redisCommand(command) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Falha no Redis (${res.status})`);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch (err) {
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  const secret = process.env.LOCATION_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    res.status(500).json({ error: 'Redis não configurado' });
    return;
  }

  const { action } = readBody(req);

  try {
    if (action === 'arrive') {
      const record = { since: Date.now() };
      await redisCommand(['SET', REDIS_KEY, JSON.stringify(record), 'EX', String(MAX_SESSION_SECONDS)]);
      res.status(200).json({ ok: true, location: record });
      return;
    }

    if (action === 'leave') {
      await redisCommand(['DEL', REDIS_KEY]);
      res.status(200).json({ ok: true, location: null });
      return;
    }

    res.status(400).json({ error: 'action deve ser "arrive" ou "leave"' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
