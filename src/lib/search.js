const { LANGUAGES } = require('../data/languages');
const { normalize, weightedSimilarity, editDistance, isKeyboardSlip } = require('./fuzzy');

const STOP_WORDS = new Set([
  'bahasa', 'pemrograman', 'pemograman', 'programming', 'program', 'language', 'languages',
  'untuk', 'yang', 'paling', 'dan', 'di', 'ke', 'dari', 'dengan', 'apa', 'adalah', 'itu', 'ini',
  'saya', 'mau', 'cari', 'mencari', 'info', 'tentang', 'the', 'a', 'of', 'for', 'to', 'in', 'is',
  'best', 'terbaik', 'ter', 'apa', 'mana', 'mana', 'yg', 'dgn', 'buat', 'bikin', 'dong', 'nih',
  'pengertian', 'belajar', 'belajar', 'contoh', 'kegunaan', 'fungsi'
]);

/** Kata perintah yang juga ikut dikenali (dan ikut diperiksa ejaannya). */
const COMMAND_WORDS = [
  'cuaca', 'weather', 'suhu', 'udara', 'ramalan', 'hujan', 'cerah',
  'berita', 'news', 'terbaru', 'kabar', 'headline', 'artikel',
  'saham', 'stock', 'harga', 'bursa', 'ihsg', 'indeks', 'ticker'
];

const TAG_BOOST = {
  tercepat: ['performa', 'sistem'], cepat: ['performa'], performance: ['performa'], performance: ['performa'],
  mudah: ['pemula', 'pendidikan'], pemula: ['pemula', 'pendidikan'], anak: ['pendidikan', 'visual'],
  ai: ['ai', 'machine learning'], ml: ['ai'], machine: ['ai'], learning: ['ai'], neural: ['ai'],
  web: ['web'], website: ['web'], frontend: ['frontend', 'web'], backend: ['backend', 'server'],
  mobile: ['mobile'], android: ['android', 'mobile'], ios: ['ios', 'mobile'], app: ['mobile', 'app'],
  game: ['game'], gameengine: ['game'], unity: ['game'],
  data: ['data', 'data science'], analisis: ['data', 'statistik'], statistik: ['statistik'],
  cloud: ['cloud', 'devops'], devops: ['devops'], server: ['server', 'backend'],
  blockchain: ['blockchain', 'web3'], crypto: ['blockchain'], web3: ['web3'],
  embedded: ['embedded', 'sistem'], iot: ['embedded'], mikrokontroler: ['embedded'],
  sistem: ['sistem', 'low level'], os: ['sistem', 'kernel'], kernel: ['kernel', 'sistem'],
  fungsional: ['fungsional'], oop: ['oop', 'berorientasi objek'],
  enterprise: ['enterprise'], bank: ['perbankan', 'enterprise'], finansial: ['finansial'],
  chip: ['hardware', 'fpga'], hardware: ['hardware'], fpga: ['fpga'],
  script: ['scripting'], otomatisasi: ['automation', 'scripting'], automation: ['automation']
};

const SORT_RULES = [
  { keys: ['gaji', 'salary', 'pendapatan', 'cuan'], sort: (a, b) => salaryVal(b.lang) - salaryVal(a.lang) },
  { keys: ['mudah', 'pemula', 'termudah', 'belajar', 'pertama'], sort: (a, b) => a.lang.level - b.lang.level },
  { keys: ['populer', 'terpopuler', 'terkenal', 'rank', 'ranking'], sort: (a, b) => a.lang.rank - b.lang.rank },
  { keys: ['baru', 'terbaru', 'modern', 'termuda'], sort: (a, b) => b.lang.year - a.lang.year },
  { keys: ['tua', 'tertua', 'lawas', 'klasik'], sort: (a, b) => a.lang.year - b.lang.year }
];

function salaryVal(lang) {
  const m = String(lang.salary || '').match(/([\d.]+)/);
  return m ? Number(m[1].replace(/\./g, '')) : 0;
}

/** Kamus untuk deteksi typo: semua nama/alias bahasa + kata perintah. */
const DICTIONARY = (() => {
  const words = new Map(); // word -> canonical suggestion
  const add = (word, canonical) => {
    const w = normalize(word);
    if (!w) return;
    if (!words.has(w)) words.set(w, { word: w, canonical: canonical || w, type: 'lang' });
  };
  for (const lang of LANGUAGES) {
    add(lang.name, lang.name);
    for (const aka of lang.aka || []) add(aka, lang.name);
    for (const tag of lang.tags || []) add(tag, tag);
  }
  for (const c of COMMAND_WORDS) add(c, c);
  return [...words.values()].map((w) => ({ ...w, type: COMMAND_WORDS.includes(w.word) ? 'command' : 'lang' }));
})();

const DICT_WORDS = DICTIONARY.map((d) => d.word);

function tokenize(query) {
  return normalize(query)
    .split(' ')
    .filter((t) => t && t.length > 1 && !STOP_WORDS.has(t));
}

/** Temukan kandidat terbaik di kamus untuk sebuah token. */
function bestMatch(token, minSimilarity = 0.72) {
  let best = null;
  for (const entry of DICTIONARY) {
    const sim = weightedSimilarity(token, entry.word);
    if (!best || sim > best.similarity) {
      best = { ...entry, similarity: sim, distance: editDistance(token, entry.word) };
    }
  }
  if (best && best.similarity >= minSimilarity && best.distance <= Math.max(1, Math.floor(token.length / 3)) + 1) {
    return best;
  }
  return null;
}

/** Apakah token ini "dikenal" (persis ada di kamus atau jadi substring nama bahasa). */
function isKnown(token) {
  if (DICT_WORDS.includes(token)) return true;
  return LANGUAGES.some((l) => normalize(l.name).split(' ').includes(token) || l.tags.includes(token));
}

/**
 * Deteksi salah ketik. Mengembalikan null jika tidak ada indikasi typo.
 */
function detectTypo(query) {
  const raw = normalize(query);
  if (!raw || raw.length < 3) return null;

  // 1) Seluruh query dibandingkan dengan nama/alias bahasa (mis. "javasript", "piton")
  let globalBest = null;
  for (const lang of LANGUAGES) {
    const candidates = [lang.name, ...(lang.aka || [])].map(normalize);
    for (const c of candidates) {
      const sim = weightedSimilarity(raw, c);
      if (!globalBest || sim > globalBest.similarity) {
        globalBest = { similarity: sim, suggestion: lang.name, source: c, distance: editDistance(raw, c) };
      }
    }
  }

  const corrections = [];
  const tokens = tokenize(query).filter((t) => t.length >= 3);
  for (const token of tokens) {
    if (isKnown(token)) continue;
    const match = bestMatch(token);
    if (match && match.distance >= 1) {
      corrections.push({
        word: token,
        suggestion: match.canonical,
        similarity: Number(match.similarity.toFixed(3)),
        distance: match.distance,
        keyboardSlip: isKeyboardSlip(token, match.word)
      });
    }
  }

  let suggestion = null;
  let similarity = 0;
  const shortQuery = raw.length <= 24 && raw.split(' ').length <= 2;
  if (shortQuery && globalBest && globalBest.distance >= 1 && globalBest.distance <= 4 && globalBest.similarity >= 0.68 && globalBest.similarity <= 0.999) {
    suggestion = globalBest.suggestion;
    similarity = globalBest.similarity;
  } else if (corrections.length) {
    suggestion = corrections[0].suggestion;
    similarity = corrections[0].similarity;
  }
  if (!suggestion && !corrections.length) return null;

  return {
    hasTypo: true,
    original: query.trim(),
    suggestion,
    similarity: Number(similarity.toFixed(3)),
    corrections,
    reason: describeReason(corrections[0], globalBest)
  };
}

function describeReason(correction, globalBest) {
  if (correction && correction.keyboardSlip) return 'huruf yang bersebelahan di keyboard';
  if (correction && correction.distance === 1) return 'satu huruf salah ketik';
  if (globalBest && globalBest.distance <= 2) return 'beberapa huruf meleset';
  return 'ejaan tidak ditemukan di kamus';
}

/** Skor kecocokan satu bahasa terhadap query. */
function scoreLanguage(lang, query, tokens, raw) {
  const name = normalize(lang.name);
  const akas = (lang.aka || []).map(normalize);
  const tags = (lang.tags || []).map(normalize);
  const haystacks = [
    normalize(lang.desc),
    normalize((lang.pros || []).join(' ')),
    normalize((lang.frameworks || []).join(' ')),
    normalize((lang.usedBy || []).join(' ')),
    normalize((lang.paradigm || []).join(' '))
  ];

  let score = 0;
  const matched = [];

  // Kemiripan seluruh query dengan nama bahasa (menangani salah ketik: "javasript", "piton")
  const nameSim = weightedSimilarity(raw, name);
  if (raw.length >= 3 && nameSim >= 0.6) {
    score += Math.round(520 * nameSim);
    matched.push('ejaan mirip: ' + lang.name);
  } else {
    for (const aka of akas) {
      const akaSim = weightedSimilarity(raw, aka);
      if (raw.length >= 3 && akaSim >= 0.62) {
        score += Math.round(380 * akaSim);
        matched.push('alias mirip: ' + aka);
        break;
      }
    }
  }

  if (raw === name) { score += 1000; matched.push('nama persis'); }
  else if (akas.includes(raw)) { score += 700; matched.push('alias'); }
  else if (name.startsWith(raw) && raw.length >= 2) { score += 420; matched.push('awalan nama'); }
  else if (raw.includes(name) && name.length >= 3) { score += 300; matched.push('disebut di kalimat'); }

  for (const token of tokens) {
    if (token === name) { score += 500; matched.push('nama'); continue; }
    if (akas.includes(token)) { score += 380; matched.push('alias'); continue; }
    if (name.split(' ').includes(token)) { score += 260; matched.push('bagian nama'); continue; }
    if (name.includes(token) && token.length >= 3) { score += 200; matched.push('mirip nama'); continue; }
    const tagIndex = tags.indexOf(token);
    if (tagIndex >= 0) {
      score += tagIndex < 3 ? 240 : 180; // tag utama lebih berbobot
      matched.push('topik: ' + token);
      continue;
    }
    for (const tag of tags) {
      if (tag.includes(token) && token.length >= 4) { score += 120; matched.push('topik: ' + tag); break; }
    }
    // fuzzy ke nama/alias
    const sim = weightedSimilarity(token, name);
    if (sim >= 0.72) { score += 220 * sim; matched.push('mirip: ' + lang.name); continue; }
    // ada di deskripsi / kelebihan / framework
    for (const h of haystacks) {
      if (h.includes(token) && token.length >= 4) { score += 45; matched.push('disebut di deskripsi'); break; }
    }
  }

  // Boost berdasarkan kata kunci niat (tercepat, untuk AI, dsb.)
  for (const token of tokens) {
    const boostTags = TAG_BOOST[token];
    if (boostTags) {
      for (const bt of boostTags) {
        if (tags.includes(bt)) { score += 150; matched.push('cocok untuk: ' + token); break; }
      }
      if (token === 'mudah' || token === 'pemula') score += (6 - lang.level) * 18;
      if (token === 'tercepat' || token === 'cepat') score += (6 - lang.level) * 4;
    }
  }

  // Bonus popularitas ringan supaya hasil tidak acak
  score += Math.max(0, 40 - lang.rank * 0.6);

  return { score, matched: [...new Set(matched)] };
}

function applySort(results, tokens) {
  for (const token of tokens) {
    for (const rule of SORT_RULES) {
      if (rule.keys.includes(token)) return results.sort((a, b) => (b.score - a.score) * 0.001 + rule.sort(a, b));
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

function search(query, options = {}) {
  const limit = options.limit || 12;
  const raw = normalize(query);
  const tokens = tokenize(query);
  const typo = detectTypo(query);

  const scored = [];
  for (const lang of LANGUAGES) {
    const { score, matched } = scoreLanguage(lang, query, tokens, raw);
    // Hanya tampilkan kalau benar-benar ada kecocokan teks (bukan sekadar bonus popularitas)
    if (matched.length && score >= 60) scored.push({ lang, score: Math.round(score), matched });
  }

  let results = applySort(scored, tokens).slice(0, limit);
  const correctedQuery = typo && typo.suggestion ? typo.suggestion : null;

  return {
    query: query.trim(),
    normalized: raw,
    tokens,
    total: scored.length,
    results,
    typo,
    correctedQuery
  };
}

/** Saran untuk autocomplete. */
function suggest(query, limit = 8) {
  const raw = normalize(query);
  if (!raw) return [];
  const out = [];
  for (const lang of LANGUAGES) {
    const name = normalize(lang.name);
    let score = 0;
    if (name === raw) score = 1000;
    else if (name.startsWith(raw)) score = 600 - (name.length - raw.length);
    else if (name.includes(raw)) score = 300;
    else {
      const sim = weightedSimilarity(raw, name);
      if (sim >= 0.74) score = 200 * sim;
    }
    if (!score) {
      for (const aka of lang.aka || []) {
        if (normalize(aka).startsWith(raw)) { score = 250; break; }
      }
      for (const tag of lang.tags || []) {
        if (tag.startsWith(raw)) { score = 120; break; }
      }
    }
    if (score > 0) out.push({ id: lang.id, name: lang.name, score, accent: lang.accent, kind: 'Bahasa' });
  }
  out.sort((a, b) => b.score - a.score);

  const commands = [
    { name: 'Cuaca Jakarta', kind: 'Cuaca' },
    { name: 'Berita teknologi terbaru', kind: 'Berita' },
    { name: 'Saham BBCA', kind: 'Saham' },
    { name: 'Saham Apple', kind: 'Saham' }
  ].filter((c) => normalize(c.name).includes(raw) || c.kind.toLowerCase().includes(raw));

  return [...out, ...commands].slice(0, limit);
}

function byId(id) {
  return LANGUAGES.find((l) => l.id === id) || null;
}

module.exports = { search, suggest, detectTypo, byId, LANGUAGES, DICT_WORDS };
