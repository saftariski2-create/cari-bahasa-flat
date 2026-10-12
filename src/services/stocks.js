const { fetchText, fetchJson } = require('../lib/http');
const cache = require('../lib/cache');

/** Peta nama perusahaan populer -> simbol (format Google Finance: SIMBOL:BURSA). */
const COMPANY_MAP = {
  // AS
  apple: 'AAPL:NASDAQ', microsoft: 'MSFT:NASDAQ', google: 'GOOGL:NASDAQ', alphabet: 'GOOGL:NASDAQ',
  amazon: 'AMZN:NASDAQ', tesla: 'TSLA:NASDAQ', nvidia: 'NVDA:NASDAQ', meta: 'META:NASDAQ',
  facebook: 'META:NASDAQ', netflix: 'NFLX:NASDAQ', intel: 'INTC:NASDAQ', amd: 'AMD:NASDAQ',
  ibm: 'IBM:NYSE', oracle: 'ORCL:NYSE', cisco: 'CSCO:NASDAQ', adobe: 'ADBE:NASDAQ',
  salesforce: 'CRM:NYSE', uber: 'UBER:NYSE', airbnb: 'ABNB:NASDAQ', spotify: 'SPOT:NYSE',
  shopify: 'SHOP:NYSE', paypal: 'PYPL:NASDAQ', coinbase: 'COIN:NASDAQ', broadcom: 'AVGO:NASDAQ',
  qualcomm: 'QCOM:NASDAQ', walmart: 'WMT:NYSE', disney: 'DIS:NYSE', jpmorgan: 'JPM:NYSE',
  visa: 'V:NYSE', mastercard: 'MA:NYSE', twitter: 'X', snap: 'SNAP:NYSE', palantir: 'PLTR:NASDAQ',
  // Indonesia (IDX)
  bca: 'BBCA:IDX', bbca: 'BBCA:IDX', 'bank central asia': 'BBCA:IDX',
  mandiri: 'BMRI:IDX', bmi: 'BMRI:IDX', 'bank mandiri': 'BMRI:IDX',
  bni: 'BBNI:IDX', 'bank negara indonesia': 'BBNI:IDX',
  bri: 'BBRI:IDX', 'bank rakyat indonesia': 'BBRI:IDX',
  btn: 'BBTN:IDX', 'bank tabungan negara': 'BBTN:IDX',
  telkom: 'TLKM:IDX', telkomsel: 'TLKM:IDX',
  goto: 'GOTO:IDX', gojek: 'GOTO:IDX', tokopedia: 'GOTO:IDX',
  bukalapak: 'BUKA:IDX', blibli: 'BELI:IDX',
  indofood: 'INDF:IDX', indomie: 'INDF:IDX', unilever: 'UNVR:IDX',
  astra: 'ASII:IDX', 'astra international': 'ASII:IDX',
  antam: 'ANTM:IDX', 'aneka tambang': 'ANTM:IDX', adaro: 'ADRO:IDX',
  'bank jago': 'ARTO:IDX', jago: 'ARTO:IDX',
  xl: 'EXCL:IDX', indosat: 'ISAT:IDX', 'smartfren': 'FREN:IDX',
  gudanggaram: 'GGRM:IDX', 'gudang garam': 'GGRM:IDX',
  kalbe: 'KLBF:IDX', 'kalbe farma': 'KLBF:IDX', 'sido muncul': 'SIDO:IDX',
  'ace hardware': 'ACES:IDX', aces: 'ACES:IDX', mapi: 'MAPI:IDX',
  cpin: 'CPIN:IDX', charoen: 'CPIN:IDX', inco: 'INCO:IDX', vale: 'INCO:IDX',
  emtk: 'EMTK:IDX', 'elang mahkota': 'EMTK:IDX',
  // Kripto & indeks
  bitcoin: 'BTC-USD', btc: 'BTC-USD', ethereum: 'ETH-USD', eth: 'ETH-USD',
  ihsg: 'COMPOSITE:IDX', 'indeks harga saham gabungan': 'COMPOSITE:IDX', idx: 'COMPOSITE:IDX', 'idx composite': 'COMPOSITE:IDX',
  sp500: '.INX:INDEXSP', 's&p': '.INX:INDEXSP', nasdaq: '.IXIC:INDEXNASDAQ', dowjones: '.DJI:INDEXDJX'
};

const NOISE = /\b(saham|stock|harga|harga saham|bursa|ticker|chart|grafik|hari ini|hari|berapa|nilai|price)\b/g;

function extractSymbol(query) {
  const raw = String(query || '').toLowerCase().trim();
  const cleaned = raw.replace(NOISE, ' ').replace(/[^\p{L}\p{N}.\-]/gu, ' ').replace(/\s+/g, ' ').trim();

  if (COMPANY_MAP[cleaned]) return { symbol: COMPANY_MAP[cleaned], matched: cleaned, fallbacks: [] };
  if (COMPANY_MAP[raw]) return { symbol: COMPANY_MAP[raw], matched: raw, fallbacks: [] };

  // Sudah dalam bentuk ticker: AAPL, BBCA, BBCA.JK, TLKM.JK
  const ticker = cleaned.toUpperCase().replace(/\s+/g, '');
  if (/^[A-Z0-9.\-]{2,12}$/.test(ticker)) {
    if (ticker.includes('.')) {
      const [base, suffix] = ticker.split('.');
      const exchange = { JK: 'IDX', IDX: 'IDX', US: 'NASDAQ' }[suffix] || suffix;
      return { symbol: `${base}:${exchange}`, matched: ticker, fallbacks: [`${base}:NASDAQ`, `${base}:NYSE`] };
    }
    if (ticker.includes('-')) return { symbol: ticker, matched: ticker, fallbacks: [] };
    // Tanpa sufiks: coba IDX dulu (emiten Indonesia 4 huruf), lalu bursa AS
    return { symbol: `${ticker}:IDX`, matched: ticker, guess: 'IDX', fallbacks: [`${ticker}:NASDAQ`, `${ticker}:NYSE`] };
  }
  return { symbol: null, matched: cleaned, fallbacks: [] };
}

function parseNumber(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const isIdFormat = /\.\d{3},/.test(cleaned) || /,\d{3}/.test(cleaned) === false && cleaned.includes(',');
  let num = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    num = cleaned.includes('.') && cleaned.lastIndexOf('.') > cleaned.lastIndexOf(',')
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    num = /\.\d{3}$|,\d{3}/.test(cleaned) ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else {
    num = cleaned;
  }
  const value = Number(num);
  return Number.isFinite(value) ? value : null;
}

/** Label stat bisa berbahasa Inggris atau Indonesia, tergantung bahasa halaman. */
const LABELS = {
  open: ['Open', 'Pembukaan'],
  high: ['High', 'Tinggi'],
  low: ['Low', 'Rendah'],
  mktCap: ['Mkt. cap', 'Market cap', 'Kapitalisasi pasar'],
  volume: ['Volume'],
  avgVol: ['Avg. vol.', 'Volume rata-rata'],
  dividend: ['Dividend', 'Dividen'],
  pe: ['P/E ratio', 'P/E', 'Rasio P/E'],
  high52: ['52-wk high', 'Harga tinggi dalam 52 minggu terakhir'],
  low52: ['52-wk low', 'Harga rendah dalam 52 minggu terakhir'],
  eps: ['EPS'],
  prevClose: ['Previous close', 'Penutupan sebelumnya'],
  employees: ['No. of employees', 'Jumlah karyawan']
};

/** parse angka dengan pemisah ribuan/desimal ala Indonesia & Inggris. */
function parseLocalNumber(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).replace('−', '-').replace(/\s|%/g, '');
  const hasDot = t.includes('.');
  const hasComma = t.includes(',');
  let out = t;
  if (hasDot && hasComma) {
    out = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (hasComma) {
    out = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  }
  const value = Number(out);
  return Number.isFinite(value) ? value : null;
}

function detectCurrency(text = '') {
  const t = String(text);
  if (t.includes('IDR') || t.includes('Rp')) return 'IDR';
  if (t.includes('$')) return 'USD';
  if (t.includes('€')) return 'EUR';
  return null;
}

function parseGoogleFinance(html) {
  const name = (html.match(/class="gO24Ff">([^<]+)</) || [])[1] || null;
  const priceMatch = html.match(/class="N6SYTe"><span[^>]*><span>([^<]+)<\/span>/);
  if (!name || !priceMatch) return null;

  // Batasi pencarian persentase/perubahan di sekitar blok harga utama,
  // supaya tidak terkena widget "market trends" lain di halaman.
  const start = priceMatch.index;
  const windowHtml = html.slice(start, start + 2500);
  const priceRaw = priceMatch[1];
  // Kelas bisa "ougHge" (naik/hijau) atau "ymyBi" (turun/merah) tergantung arah & bahasa
  const pctRaw = (windowHtml.match(/class="(?:ougHge|ymyBi)">([+\-−]?[\d.,]+\s*%)<\/span>/) || [])[1] || null;
  const absRaw = (windowHtml.match(/jsname="xnruHf"[^>]*><span>([^<]+)<\/span>/) || [])[1] || null;
  const direction = /arrow_downward/.test(windowHtml)
    ? 'down'
    : /arrow_upward/.test(windowHtml)
      ? 'up'
      : pctRaw && /[-−]/.test(pctRaw)
        ? 'down'
        : 'up';
  const jIdx = html.indexOf('class="jZZ2de"');
  const marketNote = jIdx >= 0
    ? decodeBasic(
        html
          .slice(jIdx, jIdx + 400)
          .replace(/<[^>]*$/, '')
          .replace(/^[^>]*>/, '')
          .replace(/<[^>]+>/g, ' ')
      )
        .replace(/\b(arrow_upward|arrow_downward)\b/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 90)
    : '';
  const marketState = /^(?:Tutup|Ditutup|Closed)\b/i.test(marketNote)
    ? 'closed'
    : /^(?:Buka|Dibuka|Open)\b/i.test(marketNote)
      ? 'open'
      : null;

  const stats = {};
  const statRe = /<div class="SwQK7">([^<]+)<\/div><div class="dO6ijd">([^<]*)<\/div>/g;
  let m;
  while ((m = statRe.exec(html))) {
    stats[m[1].trim()] = m[2].replace(/ /g, ' ').trim();
  }

  return {
    name: decodeBasic(name.trim()),
    priceText: priceRaw.trim(),
    price: parseNumber(priceRaw),
    currency: detectCurrency(priceRaw) || detectCurrency(stats['Open']) || 'IDR',
    changePercent: parseLocalNumber(pctRaw),
    changeText: absRaw ? absRaw.trim() : null,
    change: parseNumber(absRaw),
    direction,
    marketState,
    marketNote: marketNote || null,
    stats: Object.keys(stats).length ? stats : null
  };
}

function decodeBasic(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fromGoogleFinance(symbol, fallbacks = []) {
  const candidates = [...new Set([symbol, ...fallbacks])];
  for (const candidate of candidates) {
    try {
      const url = `https://www.google.com/finance/quote/${encodeURIComponent(candidate)}`;
      const html = await fetchText(url, { timeout: 12000 });
      const parsed = parseGoogleFinance(html);
      if (parsed) return { ...parsed, symbol: candidate, source: 'Google Finance', url };
    } catch (err) {
      // coba kandidat berikutnya
    }
  }
  return null;
}

async function nasdaqSeries(ticker) {
  const end = new Date();
  const start = new Date(end.getTime() - 120 * 24 * 3600 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/historical?assetclass=stocks&fromdate=${fmt(start)}&todate=${fmt(end)}&limit=60`;
  const data = await fetchJson(url, { timeout: 10000 });
  const rows = data?.data?.tradesTable?.rows || [];
  return rows
    .map((r) => ({ date: r.date, close: Number(String(r.close).replace(/[^0-9.]/g, '')), volume: r.volume }))
    .filter((r) => Number.isFinite(r.close))
    .reverse();
}

async function getStock(query) {
  const { symbol, matched, guess, fallbacks = [] } = extractSymbol(query);
  if (!symbol) {
    return { error: 'Simbol saham tidak dikenali. Contoh: "saham BBCA", "saham Apple", "AAPL", "TLKM.JK".', query };
  }
  const key = `stock:${symbol}`;

  return cache.wrap(key, 120, async () => {
    const gf = await fromGoogleFinance(symbol, fallbacks);
    if (!gf) {
      return {
        error: `Data untuk "${symbol}" tidak tersedia saat ini. Coba simbol lain, misalnya BBCA, TLKM, AAPL, atau NVDA.`,
        symbol,
        query
      };
    }

    const [symPart, exchange] = gf.symbol.split(':');
    let series = [];
    let nasdaqInfo = null;
    if (exchange === 'NASDAQ' || exchange === 'NYSE') {
      try {
        series = await nasdaqSeries(symPart);
      } catch (err) {
        series = [];
      }
      try {
        const info = await fetchJson(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symPart)}/info?assetclass=stocks`, { timeout: 8000 });
        const d = info?.data;
        if (d) {
          nasdaqInfo = {
            companyName: d.companyName,
            exchange: d.exchange,
            lastSalePrice: d.primaryData?.lastSalePrice,
            netChange: d.primaryData?.netChange,
            percentageChange: d.primaryData?.percentageChange,
            lastTradeTimestamp: d.primaryData?.lastTradeTimestamp,
            isRealTime: d.primaryData?.isRealTime
          };
        }
      } catch (err) {
        nasdaqInfo = null;
      }
    }

    const stats = gf.stats || {};
    const pick = (...groups) => {
      for (const group of groups) {
        for (const key of LABELS[group] || [group]) {
          if (stats[key]) return stats[key];
        }
      }
      return null;
    };
    return {
      symbol: gf.symbol,
      ticker: symPart,
      exchange: exchange || null,
      name: gf.name,
      price: gf.price,
      priceText: gf.priceText,
      currency: gf.currency,
      change: gf.change,
      changeText: gf.changeText,
      changePercent: gf.changePercent,
      direction: gf.direction,
      marketState: gf.marketState,
      marketNote: gf.marketNote,
      stats: gf.stats,
      open: pick('open'),
      prevClose: pick('prevClose'),
      dayRange: pick('low') && pick('high') ? `${pick('low')} – ${pick('high')}` : null,
      yearRange: pick('low52') && pick('high52') ? `${pick('low52')} – ${pick('high52')}` : null,
      marketCap: pick('mktCap'),
      peRatio: pick('pe'),
      eps: pick('eps'),
      dividend: pick('dividend'),
      volume: pick('volume', 'avgVol'),
      employees: pick('employees'),
      series,
      nasdaqInfo,
      source: gf.source,
      url: gf.url,
      matchedInput: matched,
      guess,
      updatedAt: new Date().toISOString()
    };
  });
}

module.exports = { getStock, extractSymbol, COMPANY_MAP };
