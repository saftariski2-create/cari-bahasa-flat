const path = require('path');
const express = require('express');

const { search, suggest, byId, LANGUAGES } = require('./src/lib/search');
const { detectTypo } = require('./src/lib/search');
const weatherService = require('./src/services/weather');
const newsService = require('./src/services/news');
const stockService = require('./src/services/stocks');
const wikiService = require('./src/services/wiki');
const cache = require('./src/lib/cache');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const WEATHER_RE = /\b(cuaca|weather|suhu|udara|hujan|ramalan|prakiraan|panas|dingin)\b/i;
const NEWS_RE = /\b(berita|news|kabar|headline|artikel|terbaru|update|trend)\b/i;
const STOCK_RE = /\b(saham|stock|bursa|ihsg|indeks|harga saham|ticker|ipo)\b/i;

// ---------------------------------------------------------------
// FILTER KATA TERLARANG + PEMBERSIH HTML
// ---------------------------------------------------------------
const BLOCK_RE = /\b(bokep|xnxx|xvideos|porn|porno|bugil|sex|sexs|ngentot|jav|hentai|seks)\b/i;
const diblokir = (t = '') => BLOCK_RE.test(String(t));

// Buang tag HTML dari teks RSS
function bersihkan(t = '') {
  return String(t)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Bersihkan daftar berita + buang yang judulnya terlarang
function rapikanBerita(list) {
  if (!Array.isArray(list)) return list;
  return list
    .map((n) => {
      if (!n || typeof n !== 'object') return n;
      const out = { ...n };
      for (const k of ['title', 'description', 'snippet', 'summary']) {
        if (typeof out[k] === 'string') out[k] = bersihkan(out[k]);
      }
      return out;
    })
    .filter((n) => !(n && diblokir(n.title)));
}

// Hasil news bisa berupa array atau objek berisi beberapa array
function rapikanNews(news) {
  if (!news) return news;
  if (Array.isArray(news)) return rapikanBerita(news);
  if (typeof news === 'object') {
    const out = { ...news };
    for (const key of Object.keys(out)) {
      if (Array.isArray(out[key])) out[key] = rapikanBerita(out[key]);
    }
    return out;
  }
  return news;
}
// ---------------------------------------------------------------

function detectIntent(q) {
  const text = (q || '').toLowerCase();
  if (STOCK_RE.test(text)) return 'stock';
  if (WEATHER_RE.test(text)) return 'weather';
  if (NEWS_RE.test(text)) return 'news';

  // Ticker polos: huruf kapital semua (AAPL, NVDA, BBCA, TLKM.JK) atau nama perusahaan yang dikenal
  const trimmed = text.trim();
  if (/^[A-Z]{2,6}(\.[A-Z]{2})?$/.test(q.trim())) return 'stock';
  if (/^[a-z]{2,6}(\.[a-z]{2})?$/.test(q.trim())) return 'stock';
  if (stockService.COMPANY_MAP[trimmed]) return 'stock';
  return 'language';
}

function stripIntentWords(q, intent) {
  return q
    .replace(STOCK_RE, ' ')
    .replace(WEATHER_RE, ' ')
    .replace(NEWS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function safe(promise, fallback = null) {
  try {
    return await promise;
  } catch (err) {
    console.error('[api]', err.message);
    return fallback;
  }
}

/** Endpoint utama: satu kali panggil, semua panel terisi. */
app.get('/api/search', async (req, res) => {
  const started = Date.now();
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Parameter q wajib diisi' });

  if (diblokir(q)) {
    return res.status(400).json({ error: 'Kata kunci tidak diizinkan.', blocked: true });
  }

  const intent = detectIntent(q);
  const result = search(q, { limit: 10 });

  // Jika tidak ada hasil dan ada saran perbaikan, pakai hasil dari ejaan yang diperbaiki
  let autoCorrected = false;
  if ((!result.results.length || intent === 'stock') && result.typo?.suggestion) {
    const fixed = search(result.typo.suggestion, { limit: 10 });
    if (fixed.results.length > result.results.length) {
      result.results = fixed.results;
      autoCorrected = true;
    }
  }
  if (intent === 'stock' && result.typo?.suggestion && !stockService.extractSymbol(q).symbol) {
    autoCorrected = true;
  }
  if (intent === 'weather' && result.typo?.suggestion) autoCorrected = false;

  const topLang = result.results[0]?.lang || null;
  const newsQuery = intent === 'news' ? stripIntentWords(q, 'news') || 'teknologi' : topLang ? topLang.name : q;

  const jobs = [];
  if (intent === 'weather') jobs.push(['weather', safe(weatherService.getWeather(q))]);
  if (intent === 'stock') jobs.push(['stock', safe(stockService.getStock(q))]);
  if (intent === 'news' || topLang || intent === 'language') {
    jobs.push(['news', safe(newsService.getNews(newsQuery, { languageId: topLang?.id }))]);
  }
  if (topLang) jobs.push(['wiki', safe(wikiService.getSummary(topLang.wiki || topLang.name))]);

  const settled = await Promise.all(
    jobs.map(async ([key, promise]) => [key, await promise])
  );
  const payload = { weather: null, news: null, stock: null, wiki: null };
  for (const [key, value] of settled) payload[key] = value;

  // Bersihkan HTML + saring berita terlarang
  payload.news = rapikanNews(payload.news);

  res.json({
    query: q,
    intent,
    autoCorrected,
    correctedQuery: result.correctedQuery,
    typo: result.typo,
    tokens: result.tokens,
    total: result.total,
    results: result.results.map(({ lang, score, matched }) => ({
      ...lang,
      _score: score,
      _matched: matched.slice(0, 3)
    })),
    ...payload,
    took: Date.now() - started
  });
});

app.get('/api/suggest', (req, res) => {
  const q = String(req.query.q || '');
  if (diblokir(q)) return res.json({ query: q, suggestions: [] });
  res.json({ query: q, suggestions: suggest(q, 8) });
});

app.get('/api/weather', async (req, res) => {
  const q = String(req.query.q || 'Jakarta');
  res.json(await safe(weatherService.getWeather(q), { error: 'Gagal mengambil data cuaca' }));
});

app.get('/api/news', async (req, res) => {
  const q = String(req.query.q || 'teknologi');
  if (diblokir(q)) {
    return res.status(400).json({ error: 'Kata kunci tidak diizinkan.', blocked: true, headlines: [], developer: [] });
  }
  const data = await safe(newsService.getNews(q), { error: 'Gagal mengambil berita', headlines: [], developer: [] });
  res.json(rapikanNews(data));
});

app.get('/api/stock', async (req, res) => {
  const q = String(req.query.q || 'BBCA');
  res.json(await safe(stockService.getStock(q), { error: 'Gagal mengambil data saham' }));
});

app.get('/api/language/:id', async (req, res) => {
  const lang = byId(req.params.id);
  if (!lang) return res.status(404).json({ error: 'Bahasa tidak ditemukan' });
  const [wiki, news] = await Promise.all([
    safe(wikiService.getSummary(lang.wiki || lang.name)),
    safe(newsService.getNews(lang.name, { languageId: lang.id }))
  ]);
  res.json({ language: lang, wiki, news: rapikanNews(news) });
});

app.get('/api/trending', (req, res) => {
  res.json({
    languages: [...LANGUAGES]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 12)
      .map((l) => ({ id: l.id, name: l.name, rank: l.rank, accent: l.accent, tags: l.tags.slice(0, 3), desc: l.desc }))
  });
});

app.get('/api/spellcheck', (req, res) => {
  const q = String(req.query.q || '');
  res.json({ query: q, typo: detectTypo(q) });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, cache: cache.size(), uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`CariBahasa jalan di http://localhost:${PORT}`);
});
