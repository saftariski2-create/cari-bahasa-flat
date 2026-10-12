const { fetchText, fetchJson } = require('../lib/http');
const cache = require('../lib/cache');

function decodeEntities(input = '') {
  return String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const menit = Math.floor(diff / 60000);
  if (menit < 1) return 'baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7) return `${hari} hari lalu`;
  return new Date(then).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function stripPublisher(title) {
  const idx = title.lastIndexOf(' - ');
  if (idx > 20) return { title: title.slice(0, idx), publisher: title.slice(idx + 3) };
  return { title, publisher: '' };
}

/** Google News RSS (bisa difilter bahasa & negara). */
async function googleNews(query, { hl = 'id', gl = 'ID', ceid = 'ID:id' } = {}) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  const xml = await fetchText(url, { timeout: 10000 });
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const items = blocks.map((block) => {
    const raw = tag(block, 'title');
    const { title, publisher } = stripPublisher(raw);
    const sourceUrl = (block.match(/<source[^>]*url="([^"]+)"/i) || [])[1] || '';
    return {
      title,
      url: tag(block, 'link'),
      publisher: publisher || tag(block, 'source') || new URL(sourceUrl || 'https://news.google.com').hostname,
      publishedAt: tag(block, 'pubDate'),
      publishedText: timeAgo(tag(block, 'pubDate')),
      summary: tag(block, 'description'),
      image: null,
      source: 'Google News'
    };
  });
  return items.filter((i) => i.title && i.url);
}

/** dev.to — artikel developer (cadangan + pelengkap). */
async function devTo(query, tagName) {
  const base = tagName
    ? `https://dev.to/api/articles?tag=${encodeURIComponent(tagName)}&per_page=8`
    : `https://dev.to/api/articles?per_page=8`;
  try {
    const data = await fetchJson(base, { timeout: 9000 });
    const q = String(query || '').toLowerCase();
    return (Array.isArray(data) ? data : [])
      .filter((a) => !tagName || true)
      .slice(0, 8)
      .map((a) => ({
        title: a.title,
        url: a.url,
        publisher: 'dev.to',
        publishedAt: a.published_at,
        publishedText: timeAgo(a.published_at),
        summary: a.description,
        image: a.cover_image || a.social_image || null,
        source: 'dev.to',
        reactions: a.public_reactions_count || 0,
        author: a.user?.name || a.user?.username || '',
        relevance: q ? (a.title.toLowerCase().includes(q) ? 2 : 1) : 1
      }));
  } catch (err) {
    return [];
  }
}

const TOPIC_TAGS = {
  python: 'python', javascript: 'javascript', typescript: 'typescript', java: 'java',
  csharp: 'csharp', cpp: 'cpp', c: 'c', go: 'go', rust: 'rust', kotlin: 'kotlin',
  swift: 'swift', php: 'php', ruby: 'ruby', dart: 'dart', scala: 'scala', elixir: 'elixir',
  haskell: 'haskell', r: 'r', julia: 'julia', sql: 'sql', html: 'html', css: 'css',
  webassembly: 'webassembly', blockchain: 'blockchain', ai: 'ai', devops: 'devops'
};

async function getNews(query, options = {}) {
  const q = String(query || '').trim() || 'teknologi';
  const tagName = options.tag || TOPIC_TAGS[options.languageId] || null;
  const key = `news:${q.toLowerCase()}:${tagName || '-'}`;

  return cache.wrap(key, 240, async () => {
    const [gNews, devArticles] = await Promise.all([
      googleNews(q).catch(() => []),
      devTo(q, tagName).catch(() => [])
    ]);

    const seen = new Set();
    const items = [];
    for (const item of [...gNews, ...devArticles]) {
      const keyTitle = item.title.toLowerCase().slice(0, 60);
      if (seen.has(keyTitle)) continue;
      seen.add(keyTitle);
      items.push(item);
    }

    return {
      query: q,
      tag: tagName,
      source: gNews.length ? 'Google News' : devArticles.length ? 'dev.to' : null,
      total: items.length,
      headlines: items.slice(0, 10),
      developer: devArticles.slice(0, 6),
      updatedAt: new Date().toISOString()
    };
  });
}

module.exports = { getNews, googleNews, devTo };
