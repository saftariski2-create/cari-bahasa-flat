const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchWithTimeout(url, options = {}) {
  const { timeout = 9000, headers = {}, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8', ...headers }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}) {
  const res = await fetchWithTimeout(url, options);
  return res.text();
}

async function fetchJson(url, options = {}) {
  const res = await fetchWithTimeout(url, options);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Respon bukan JSON: ' + text.slice(0, 120));
  }
}

module.exports = { fetchText, fetchJson, UA };
