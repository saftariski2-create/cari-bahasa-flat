/** Utilitas string: normalisasi, jarak edit, kemiripan. */

function normalize(input = '') {
  return String(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s+#.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jarak Levenshtein-Damerau (transposisi dihitung 1). */
function editDistance(a, b, maxDistance = 12) {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDistance) return maxDistance + 1;
  if (!lenA) return lenB;
  if (!lenB) return lenA;

  let prev = Array.from({ length: lenB + 1 }, (_, i) => i);
  let prev2 = null;

  for (let i = 1; i <= lenA; i++) {
    const curr = [i];
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prev2[j - 2] + 1);
      }
    }
    prev2 = prev;
    prev = curr;
  }
  return prev[lenB];
}

/** Kemiripan 0..1 */
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  const dist = editDistance(a, b, longest);
  return Math.max(0, 1 - dist / longest);
}

/** Prefix-aware similarity: huruf depan salah lebih "berat" hukumannya. */
function weightedSimilarity(a, b) {
  const base = similarity(a, b);
  if (!a || !b) return base;
  let bonus = 0;
  if (a[0] === b[0]) bonus += 0.04;
  if (a.slice(0, 2) === b.slice(0, 2)) bonus += 0.03;
  if (b.startsWith(a.slice(0, Math.max(2, Math.floor(a.length / 2))))) bonus += 0.05;
  return Math.min(1, base + bonus);
}

/** Keyboard-typo check untuk keyboard QWERTY (opsional, dipakai untuk pesan yang lebih informatif). */
const NEIGHBORS = {
  a: 'qwsz', b: 'vgn', c: 'xdv', d: 'sfce', e: 'wrd', f: 'dgrv', g: 'fhtb',
  h: 'gjyn', i: 'uok', j: 'hkun', k: 'jlm', l: 'ko', m: 'nk',
  n: 'bhm', o: 'ipl', p: 'ol', q: 'wa', r: 'etf', s: 'adxw',
  t: 'ryg', u: 'yij', v: 'cbf', w: 'qes', x: 'zsdc', y: 'tuh',
  z: 'ax'
};

function isKeyboardSlip(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  const d = editDistance(a, b);
  if (d > 2) return false;
  let suspicious = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i] && (NEIGHBORS[a[i]] || '').includes(b[i])) suspicious++;
  }
  return suspicious > 0;
}

module.exports = { normalize, editDistance, similarity, weightedSimilarity, isKeyboardSlip };
