/** Cache in-memory sederhana dengan TTL (detik). */
const store = new Map();

function get(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

function set(key, value, ttlSeconds = 300) {
  store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  return value;
}

async function wrap(key, ttlSeconds, producer) {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const value = await producer();
  set(key, value, ttlSeconds);
  return value;
}

function clear() {
  store.clear();
}

module.exports = { get, set, wrap, clear, size: () => store.size };
