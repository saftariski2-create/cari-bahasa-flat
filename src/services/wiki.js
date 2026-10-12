const { fetchJson } = require('../lib/http');
const cache = require('../lib/cache');

const HEADERS = { 'User-Agent': 'CariBahasa/1.0 (https://github.com/caribahasa; kontak@example.org)' };

function pickPage(pages) {
  const list = Object.values(pages || {});
  const page = list.find((p) => !p.missing && p.extract);
  if (!page) return null;
  return page;
}

function shape(page, lang) {
  return {
    title: page.title,
    extract: (page.extract || '').slice(0, 700),
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    thumb: page.thumbnail?.source || null,
    lang
  };
}

async function exact(lang, title) {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
    `&titles=${encodeURIComponent(title)}&redirects=1` +
    `&prop=extracts|pageimages&exintro=1&explaintext=1&pithumbsize=400`;
  const data = await fetchJson(url, { timeout: 9000, headers: HEADERS });
  const page = pickPage(data?.query?.pages);
  return page ? shape(page, lang) : null;
}

async function search(lang, title, base) {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(title)}&gsrlimit=3&gsrnamespace=0` +
    `&prop=extracts|pageimages&exintro=1&explaintext=1&pithumbsize=400`;
  const data = await fetchJson(url, { timeout: 9000, headers: HEADERS });
  const pages = Object.values(data?.query?.pages || {}).filter((p) => !p.missing && p.extract);
  const wanted = String(base || '').toLowerCase();
  const match = pages.find((p) => p.title.toLowerCase().includes(wanted)) || pages[0];
  return match ? shape(match, lang) : null;
}

/** Ambil ringkasan Wikipedia: judul persis dulu, baru pencarian (ID → EN). */
async function getSummary(title) {
  const key = `wiki:${title}`;
  return cache.wrap(key, 60 * 60 * 12, async () => {
    const base = String(title || '').split('(')[0].trim();
    const attempts = [
      () => exact('id', title),
      () => exact('en', title),
      () => search('id', title, base),
      () => search('en', title, base)
    ];
    for (const run of attempts) {
      try {
        const page = await run();
        if (page && page.extract.length > 80) return page;
      } catch (err) {
        // lanjut ke percobaan berikutnya
      }
    }
    return null;
  });
}

module.exports = { getSummary };
