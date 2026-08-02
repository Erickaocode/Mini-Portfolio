const RAWG_SEARCH_URL = 'https://api.rawg.io/api/games';

// Cache em memória da instância serverless: evita bater na RAWG de novo
// pro mesmo jogo enquanto a função ficar "quente" entre invocações.
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function searchGameArt(name) {
  const cached = cache.get(name);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.image;
  }

  const url = `${RAWG_SEARCH_URL}?key=${process.env.RAWG_API_KEY}&search=${encodeURIComponent(name)}&page_size=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar jogo na RAWG (${res.status})`);

  const data = await res.json();
  const image = data.results?.[0]?.background_image ?? null;
  cache.set(name, { image, at: Date.now() });
  return image;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');

  const name = req.query.name;
  if (!name) {
    res.status(400).json({ error: 'Parâmetro "name" é obrigatório' });
    return;
  }

  if (!process.env.RAWG_API_KEY) {
    res.status(200).json({ image: null });
    return;
  }

  try {
    const image = await searchGameArt(name);
    res.status(200).json({ image });
  } catch (error) {
    res.status(200).json({ image: null, error: error.message });
  }
};
