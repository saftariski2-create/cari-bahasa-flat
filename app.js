/* ============================================================
   CariBahasa — frontend (vanilla JS)
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  query: '',
  raw: null,
  tab: 'all',
  lastTypo: null,
  typoDismissed: false,
  notif: []
};

/* ---------------- util ---------------- */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nf(value, currency) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const locale = currency === 'IDR' ? 'id-ID' : 'en-US';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value));
}

function moneyText(value, currency, text) {
  if (text) return esc(text);
  const symbol = currency === 'IDR' ? 'Rp ' : currency === 'USD' ? '$' : '';
  return esc(symbol + nf(value, currency));
}

function pct(value) {
  if (value === null || value === undefined) return '';
  const v = Number(value);
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

/* ---------------- tema ---------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('cb.theme', theme);
}
function initTheme() {
  const saved = localStorage.getItem('cb.theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

/* ---------------- notifikasi ---------------- */
function loadNotif() {
  try {
    state.notif = JSON.parse(localStorage.getItem('cb.notif') || '[]');
  } catch (e) {
    state.notif = [];
  }
  renderNotif();
}
function saveNotif() {
  localStorage.setItem('cb.notif', JSON.stringify(state.notif.slice(0, 30)));
  renderNotif();
}
function renderNotif() {
  const list = $('#notifList');
  const badge = $('#bellBadge');
  const unread = state.notif.filter((n) => !n.read).length;
  badge.hidden = unread === 0;
  badge.textContent = unread > 99 ? '99+' : String(unread);
  if (!state.notif.length) {
    list.innerHTML = '<div class="notif-item muted">Belum ada notifikasi.</div>';
    return;
  }
  list.innerHTML = state.notif
    .slice(0, 30)
    .map(
      (n) => `<div class="notif-item ${n.type === 'warn' ? 'warn' : ''}">
        <div>${esc(n.message)}</div>
        <div class="t">${new Date(n.time).toLocaleString('id-ID')}</div>
      </div>`
    )
    .join('');
}

function notify(message, type = 'info', action = null) {
  state.notif.unshift({ message, type, time: Date.now(), read: false });
  saveNotif();
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'warn' ? 'warn' : type === 'error' ? 'err' : ''}`;
  toast.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'tb';
    btn.textContent = action.label;
    btn.onclick = () => {
      action.run();
      toast.remove();
    };
    toast.appendChild(btn);
  }
  const close = document.createElement('button');
  close.className = 'tb';
  close.textContent = '✕';
  close.onclick = () => toast.remove();
  toast.appendChild(close);
  $('#toasts').appendChild(toast);
  setTimeout(() => toast.remove(), action ? 12000 : 6000);
}

/* ---------------- riwayat pencarian ---------------- */
function historyList() {
  try {
    return JSON.parse(localStorage.getItem('cb.history') || '[]');
  } catch (e) {
    return [];
  }
}
function pushHistory(q) {
  const list = historyList().filter((h) => h.toLowerCase() !== q.toLowerCase());
  list.unshift(q);
  localStorage.setItem('cb.history', JSON.stringify(list.slice(0, 8)));
}

/* ---------------- saran (autocomplete) ---------------- */
const suggestBoxes = [];
function closeSuggests() {
  suggestBoxes.forEach((s) => s.close());
}

function setupSuggest(input, panel) {
  let items = [];
  let active = -1;

  const close = () => {
    panel.hidden = true;
    active = -1;
  };

  const render = () => {
    if (!items.length) return close();
    panel.innerHTML = items
      .map(
        (it, i) =>
          `<div class="suggest-item ${i === active ? 'is-active' : ''}" data-i="${i}">
            <span class="dot" style="background:${esc(it.accent || '#1a73e8')}"></span>
            <span>${esc(it.name)}</span>
            <span class="kind">${esc(it.kind)}</span>
          </div>`
      )
      .join('');
    panel.hidden = false;
  };

  const move = (delta) => {
    if (!items.length) return;
    active = (active + delta + items.length) % items.length;
    render();
  };

  input.addEventListener('input', async () => {
    const q = input.value.trim();
    if (!q) {
      const hist = historyList().slice(0, 5).map((h) => ({ name: h, kind: 'Riwayat' }));
      if (!hist.length) return close();
      items = hist;
      active = -1;
      return render();
    }
    try {
      const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      items = data.suggestions || [];
      active = -1;
      render();
    } catch (e) {
      close();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (panel.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      input.value = items[active].name;
      close();
      doSearch(input.value);
    } else if (e.key === 'Escape') close();
  });

  panel.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    e.preventDefault();
    input.value = items[Number(item.dataset.i)].name;
    close();
    doSearch(input.value);
  });

  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('focus', () => {
    if (input.value.trim() && items.length) render();
  });
  const controller = { close };
  suggestBoxes.push(controller);
  return controller;
}

/* ---------------- render: notifikasi typo ---------------- */
function handleTypo(data) {
  const banner = $('#typoBanner');
  const typo = data.typo;
  if (!typo || state.typoDismissed) {
    banner.hidden = true;
    return;
  }
  state.lastTypo = typo;
  const suggestion = typo.suggestion || (typo.corrections[0] && typo.corrections[0].suggestion);
  if (!suggestion) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.innerHTML = `
    <span>⚠️</span>
    <span>Sepertinya ada <strong>salah ketik</strong>: “${esc(typo.original)}” (${esc(typo.reason)}).
      Maksud Anda <strong>${esc(suggestion)}</strong>?</span>
    <span class="tb-actions">
      <button class="tb-btn primary" id="fixTypo">Ya, cari ${esc(suggestion)}</button>
      <button class="tb-btn" id="keepTypo">Tetap pakai “${esc(typo.original)}”</button>
    </span>`;
  $('#fixTypo').onclick = () => {
    state.typoDismissed = true;
    doSearch(suggestion);
  };
  $('#keepTypo').onclick = () => {
    state.typoDismissed = true;
    banner.hidden = true;
    notify(`Oke, tetap menampilkan hasil untuk “${typo.original}”.`, 'info');
  };

  notify(
    `Ada salah ketik pada “${typo.original}” — maksud Anda ${suggestion}?`,
    'warn',
    { label: 'Perbaiki', run: () => { state.typoDismissed = true; doSearch(suggestion); } }
  );
  state.notif[0].message = `Salah ketik terdeteksi: “${typo.original}” → ${suggestion}`;
}

/* ---------------- render: hasil bahasa ---------------- */
function renderResults(data) {
  const results = data.results || [];
  if (!results.length) {
    return `<div class="card empty">
      <h3>Tidak ada bahasa yang cocok dengan “${esc(data.query)}”</h3>
      <p>Saran:</p>
      <ul>
        <li>Periksa ejaan kata kunci</li>
        <li>Coba kata kunci topik: <em>web</em>, <em>AI</em>, <em>mobile</em>, <em>game</em>, <em>embedded</em></li>
        <li>Atau cari dengan nama populernya: Python, JavaScript, Go, Rust</li>
      </ul>
    </div>`;
  }
  return results
    .map((lang) => {
      const pills = (lang._matched || [])
        .slice(0, 2)
        .map((m) => `<span class="pill pill--match">${esc(m)}</span>`)
        .join('');
      const tags = (lang.tags || [])
        .slice(0, 5)
        .map((t) => `<span class="pill">${esc(t)}</span>`)
        .join('');
      return `<div class="result-item">
        <div class="url">${esc(lang.site || '')}</div>
        <h2><button data-lang="${esc(lang.id)}">${esc(lang.name)}</button></h2>
        <div>${pills}</div>
        <p class="desc">${esc(lang.desc)}</p>
        <div>${tags}</div>
        <div class="meta">${esc(lang.year)} · dibuat ${esc(lang.creator)} · paradigma ${esc((lang.paradigm || []).join(', '))}</div>
      </div>`;
    })
    .join('');
}

/* ---------------- render: panel pengetahuan ---------------- */
function renderPanel(data) {
  const top = (data.results || [])[0];
  if (!top) return '';
  const wiki = data.wiki;
  const snippet = esc(top.hello || '');
  return `<div class="card kp">
    <div class="kp-head">
      <div class="kp-logo" style="background:${esc(top.accent || '#1a73e8')}">${esc(top.name.slice(0, 2).toUpperCase())}</div>
      <div>
        <h2>${esc(top.name)}</h2>
        <div class="sub">${esc((top.paradigm || []).join(' · '))} · ${esc(top.year)}</div>
      </div>
    </div>
    <div class="kp-body">
      <div class="kp-row"><div class="k">Peringkat</div><div class="v">#${esc(top.rank)} indeks popularitas</div></div>
      <div class="kp-row"><div class="k">Pencipta</div><div class="v">${esc(top.creator)}</div></div>
      <div class="kp-row"><div class="k">Tipe data</div><div class="v">${esc(top.typing)}</div></div>
      <div class="kp-row"><div class="k">Level belajar</div><div class="v">${'●'.repeat(top.level)}${'○'.repeat(5 - top.level)} (${esc(top.level)}/5)</div></div>
      <div class="kp-row"><div class="k">Ekstensi</div><div class="v">${esc((top.ext || []).join(', '))}</div></div>
      <div class="kp-row"><div class="k">Package</div><div class="v">${esc(top.pkg || '-')}</div></div>
      <div class="kp-row"><div class="k">Framework</div><div class="v">${esc((top.frameworks || []).slice(0, 4).join(', '))}</div></div>
      <div class="kp-row"><div class="k">Kisaran gaji</div><div class="v">$${esc(top.salary || '-')}/tahun</div></div>
      ${wiki ? `<div class="kp-row"><div class="k">Ensiklopedia</div><div class="v">${esc((wiki.extract || '').slice(0, 240))}… <a href="${esc(wiki.url)}" target="_blank" rel="noopener">Wikipedia</a></div></div>` : ''}
      <div class="section-title" style="margin-top:14px">Halo dunia</div>
      <code class="snippet">${snippet}</code>
      <div class="kp-actions">
        <button class="btn" data-lang="${esc(top.id)}">Detail lengkap</button>
        <a class="btn btn--ghost" href="${esc(top.docs || top.site)}" target="_blank" rel="noopener">Dokumentasi ↗</a>
        <button class="btn btn--ghost" id="copySnippet">Salin kode</button>
      </div>
    </div>
  </div>`;
}

/* ---------------- render: cuaca ---------------- */
function renderWeather(w) {
  if (!w) return '';
  if (w.error) {
    return `<div class="card"><h3>🌤️ Cuaca</h3><p class="muted">${esc(w.error)}</p></div>`;
  }
  const cur = w.current || {};
  const hourly = (w.hourly || [])
    .slice(0, 10)
    .map((h) => `<div class="wx-hour"><div>${esc(h.time)}</div><div style="font-size:18px">${esc(h.icon)}</div><div class="t">${esc(Math.round(h.temperature))}°</div></div>`)
    .join('');
  const maxs = (w.forecast || []).map((d) => d.max || 0);
  const hi = Math.max(...maxs, 1);
  const lo = Math.min(...(w.forecast || []).map((d) => d.min || 0), hi);
  const daily = (w.forecast || [])
    .map((d) => {
      const width = Math.max(8, Math.round(((d.max - lo) / Math.max(1, hi - lo)) * 100));
      return `<div class="wx-day">
        <div>${esc(d.day || '')}</div>
        <div>${esc(d.icon)}</div>
        <div class="wx-bar" style="width:${width}%" title="${esc(d.label)}"></div>
        <div style="text-align:right">${esc(Math.round(d.min))}° / ${esc(Math.round(d.max))}°</div>
      </div>`;
    })
    .join('');

  return `<div class="card">
    <h3>🌤️ Cuaca ${esc(w.place.name)}${w.place.region ? ', ' + esc(w.place.region) : ''}</h3>
    <div class="wx-now">
      <div class="wx-icon">${esc(cur.icon || '🌡️')}</div>
      <div>
        <div class="wx-temp">${esc(Math.round(cur.temperature))}°C</div>
        <div class="wx-cond">${esc(cur.condition)}</div>
      </div>
      <div class="muted" style="margin-left:auto;text-align:right">
        <div>${esc(w.place.country)} · ${esc(w.place.timezone || '')}</div>
        <div>Terasa ${esc(Math.round(cur.feelsLike))}°C</div>
      </div>
    </div>
    <div class="wx-stats">
      <div class="wx-stat"><div class="k">Kelembapan</div><div class="v">${esc(cur.humidity)}%</div></div>
      <div class="wx-stat"><div class="k">Angin</div><div class="v">${esc(cur.windSpeed)} km/j</div></div>
      <div class="wx-stat"><div class="k">Curah hujan</div><div class="v">${esc(cur.precipitation)} mm</div></div>
      <div class="wx-stat"><div class="k">Tekanan</div><div class="v">${esc(cur.pressure)} hPa</div></div>
    </div>
    <div class="section-title" style="margin-top:18px">Per jam</div>
    <div class="wx-hourly">${hourly}</div>
    <div class="section-title" style="margin-top:14px">Prakiraan 5 hari</div>
    <div class="wx-daily">${daily}</div>
    <div class="muted" style="margin-top:12px">Sumber: ${esc(w.source)} · diperbarui ${new Date(w.updatedAt).toLocaleString('id-ID')}</div>
  </div>`;
}

/* ---------------- render: saham ---------------- */
function renderSparkline(series, up) {
  if (!series || series.length < 2) return '';
  const closes = series.map((s) => s.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const w = 600;
  const h = 90;
  const step = w / (closes.length - 1);
  const points = closes
    .map((c, i) => `${(i * step).toFixed(1)},${(h - ((c - min) / Math.max(1e-9, max - min)) * (h - 12) - 6).toFixed(1)}`)
    .join(' ');
  const color = up ? 'var(--up)' : 'var(--down)';
  return `<div class="stk-spark">
    <svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" />
    </svg>
    <div class="muted">${series.length} hari terakhir · ${esc(Math.min(...closes))} – ${esc(Math.max(...closes))}</div>
  </div>`;
}

function colorScheme() {
  return localStorage.getItem('cb.colors') === 'idx' ? 'idx' : 'asia';
}
function applyColorScheme() {
  document.body.classList.toggle('idx-colors', colorScheme() === 'idx');
}

function renderStock(s) {
  if (!s) return '';
  if (s.error) {
    return `<div class="card"><h3>📈 Saham</h3><p class="muted">${esc(s.error)}</p>
      <p class="muted">Contoh yang bisa dicoba: <code>saham BBCA</code>, <code>saham Apple</code>, <code>NVDA</code>, <code>TLKM.JK</code>, <code>IHSG</code></p></div>`;
  }
  const up = s.direction !== 'down';
  const cls = up ? 'stk-up' : 'stk-down';
  const cells = [
    ['Sebelumnya', s.prevClose],
    ['Rentang hari', s.dayRange],
    ['Rentang 52-mg', s.yearRange],
    ['Volume', s.volume],
    ['Kapitalisasi', s.marketCap],
    ['P/E', s.peRatio],
    ['EPS', s.eps],
    ['Dividen', s.dividen || s.dividend]
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="stk-cell"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`)
    .join('');

  const idxColors = colorScheme() === 'idx';
  return `<div class="card">
    <h3>📈 ${esc(s.name)} <span class="muted">${esc(s.symbol)}</span></h3>
    <div class="stk-head">
      <div>
        <div class="stk-price">${moneyText(s.price, s.currency, s.priceText)}</div>
        <div class="stk-change ${cls}">${esc(pct(s.changePercent))} ${s.changeText ? '(' + esc(s.changeText) + ')' : ''} ${up ? '▲' : '▼'}</div>
      </div>
      <div class="muted" style="margin-left:auto;text-align:right">
        ${s.marketState ? `<div>Pasar <strong>${s.marketState === 'open' ? 'buka' : 'tutup'}</strong></div>` : ''}
        ${s.marketNote ? `<div>${s.marketState ? '' : 'Data per '}${esc(s.marketNote)}</div>` : ''}
        ${s.asOf ? `<div>${new Date(s.asOf).toLocaleString('id-ID')}</div>` : ''}
        <button class="link-btn" id="toggleColors" title="Ganti warna naik/turun">🎨 Naik = ${idxColors ? 'hijau' : 'merah'}</button>
      </div>
    </div>
    <div class="stk-grid">${cells}</div>
    ${renderSparkline(s.series, up)}
    <div class="muted" style="margin-top:10px">Sumber: ${esc(s.source)}${s.nasdaqInfo ? ' · Nasdaq' : ''} · diperbarui ${new Date(s.updatedAt).toLocaleTimeString('id-ID')}</div>
  </div>`;
}

/* ---------------- render: berita ---------------- */
function renderNews(n) {
  if (!n) return '';
  const headline = (n.headlines || [])
    .slice(0, 8)
    .map(
      (a) => `<div class="news-item">
        ${a.image ? `<img class="news-thumb" src="${esc(a.image)}" alt="" loading="lazy" />` : ''}
        <div>
          <h4><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a></h4>
          <div class="src">${esc(a.publisher || a.source)}${a.publishedText ? ' · ' + esc(a.publishedText) : ''}</div>
          ${a.summary ? `<div class="src">${esc(String(a.summary).slice(0, 150))}</div>` : ''}
        </div>
      </div>`
    )
    .join('');

  const dev = (n.developer || [])
    .slice(0, 5)
    .map(
      (a) => `<div class="news-item">
        ${a.image ? `<img class="news-thumb" src="${esc(a.image)}" alt="" loading="lazy" />` : ''}
        <div>
          <h4><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a></h4>
          <div class="src">${esc(a.author ? a.author + ' · ' : '')}dev.to · ${esc(a.publishedText || '')}${a.reactions ? ' · ❤️ ' + esc(a.reactions) : ''}</div>
        </div>
      </div>`
    )
    .join('');

  return `<div class="card">
    <h3>📰 Berita terbaru ${n.query ? '· ' + esc(n.query) : ''}</h3>
    ${headline || '<p class="muted">Berita tidak tersedia untuk topik ini.</p>'}
    ${dev ? `<div class="section-title" style="margin-top:16px">Artikel developer (dev.to)</div>${dev}` : ''}
    <div class="muted" style="margin-top:12px">Sumber: ${esc(n.source || '-')} · diperbarui ${new Date(n.updatedAt).toLocaleTimeString('id-ID')}</div>
  </div>`;
}

/* ---------------- render utama ---------------- */
function renderAll(data) {
  const main = $('#colMain');
  const side = $('#colSide');
  const tab = state.tab;
  const d = data;

  let mainHtml = '';
  if (tab === 'all') {
    if (d.intent === 'stock') mainHtml += renderStock(d.stock) + renderNews(d.news);
    else if (d.intent === 'weather') mainHtml += renderWeather(d.weather) + renderNews(d.news);
    else if (d.intent === 'news') mainHtml += renderNews(d.news) + renderResults(d);
    else mainHtml += renderResults(d) + renderNews(d.news);
  } else if (tab === 'language') {
    mainHtml += renderResults(d);
  } else if (tab === 'weather') {
    mainHtml += renderWeather(d.weather) + weatherSearchBox();
  } else if (tab === 'news') {
    mainHtml += renderNews(d.news) + newsSearchBox();
  } else if (tab === 'stock') {
    mainHtml += renderStock(d.stock) + stockSearchBox();
  }

  main.innerHTML = mainHtml;
  side.innerHTML = tab === 'stock' || tab === 'weather' ? '' : renderPanel(d);

  $$('[data-lang]').forEach((btn) => {
    btn.onclick = () => openLanguage(btn.dataset.lang);
  });
  const colorBtn = $('#toggleColors');
  if (colorBtn) {
    colorBtn.onclick = () => {
      const next = colorScheme() === 'idx' ? 'asia' : 'idx';
      localStorage.setItem('cb.colors', next);
      applyColorScheme();
      if (state.raw) renderAll(state.raw);
    };
  }
  const copyBtn = $('#copySnippet');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const code = (d.results[0] || {}).hello || '';
      navigator.clipboard?.writeText(code);
      notify('Kode contoh disalin ke clipboard.', 'info');
    };
  }
  bindQuickForms();
}

function weatherSearchBox() {
  return `<div class="card">
    <h3>🌤️ Cari cuaca kota lain</h3>
    <form class="quick-form" data-prefix="cuaca " style="display:flex;gap:8px">
      <input type="text" placeholder="Nama kota, misal: Surabaya" style="flex:1;padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
      <button class="btn" type="submit">Cari</button>
    </form>
  </div>`;
}

function newsSearchBox() {
  return `<div class="card">
    <h3>📰 Cari topik berita</h3>
    <form class="quick-form" data-prefix="berita " style="display:flex;gap:8px">
      <input type="text" placeholder="Misal: kecerdasan buatan, Go, saham" style="flex:1;padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
      <button class="btn" type="submit">Cari</button>
    </form>
  </div>`;
}

function stockSearchBox() {
  return `<div class="card">
    <h3>📈 Cari saham lain</h3>
    <form class="quick-form" data-prefix="saham " style="display:flex;gap:8px">
      <input type="text" placeholder="Misal: BBCA, TLKM, Apple, NVDA" style="flex:1;padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
      <button class="btn" type="submit">Cari</button>
    </form>
  </div>`;
}

function bindQuickForms() {
  $$('.quick-form').forEach((form) => {
    form.onsubmit = (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      if (!input.value.trim()) return;
      doSearch(form.dataset.prefix + input.value.trim());
    };
  });
}

/* ---------------- alur pencarian ---------------- */
async function doSearch(q, opts = {}) {
  q = (q || '').trim();
  if (!q) return;
  state.query = q;
  state.typoDismissed = false;
  if (!opts.keepTab) state.tab = 'all';
  closeSuggests();
  $('#inputHome').value = q;
  $('#inputTop').value = q;
  $('#clearHome').hidden = false;
  $('#clearTop').hidden = false;

  showResultsView();
  $('#loading').hidden = false;
  $('#colMain').innerHTML = '';
  $('#colSide').innerHTML = '';
  $('#typoBanner').hidden = true;
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === state.tab));
  location.hash = `q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) {
      $('#loading').hidden = true;
      $('#typoBanner').hidden = true;
      const msg = data && data.blocked
        ? 'Kata kunci tidak diizinkan.'
        : (data && data.error) || 'Terjadi kesalahan pada pencarian.';
      $('#colMain').innerHTML = `<div class="card empty"><h3>${esc(msg)}</h3><p>Coba kata kunci lain, misalnya nama bahasa pemrograman, cuaca kota, atau saham.</p></div>`;
      notify(msg, 'warn');
      return;
    }
    pushHistory(q);
    state.raw = data;
    $('#loading').hidden = true;
    handleTypo(data);
    renderAll(data);

    if (data.intent === 'stock' && data.stock && data.stock.error) {
      notify('Data saham tidak ditemukan untuk permintaan ini.', 'error');
    }
    if (data.intent === 'weather' && data.weather && data.weather.error) {
      notify('Kota tidak ditemukan. Coba nama kota lain.', 'error');
    }
    if (!data.results.length && data.intent === 'language') {
      notify('Tidak ada bahasa yang cocok — coba kata kunci lain.', 'info');
    }
  } catch (err) {
    $('#loading').hidden = true;
    $('#colMain').innerHTML = `<div class="card empty"><h3>Gagal memuat hasil</h3><p>${esc(err.message)}</p></div>`;
    notify('Gagal menghubungi server pencarian.', 'error');
  }
}

function showResultsView() {
  $('#home').hidden = true;
  $('#results').hidden = false;
  $('#brandSmall').style.visibility = 'visible';
  $('#formTop').style.visibility = 'visible';
}

function showHome() {
  $('#home').hidden = false;
  $('#results').hidden = true;
  $('#brandSmall').style.visibility = 'hidden';
  $('#formTop').style.visibility = 'hidden';
  $('#inputTop').value = '';
  $('#clearTop').hidden = true;
}

/* ---------------- detail bahasa (modal) ---------------- */
async function openLanguage(id) {
  const modal = $('#modal');
  const card = $('#modalCard');
  modal.hidden = false;
  card.innerHTML = '<div class="loading"><div class="spinner"></div> Memuat detail…</div>';
  try {
    const res = await fetch(`/api/language/${encodeURIComponent(id)}`);
    const { language: lang, wiki, news } = await res.json();
    card.innerHTML = `
      <div class="modal-head">
        <div class="kp-logo" style="background:${esc(lang.accent)}">${esc(lang.name.slice(0, 2).toUpperCase())}</div>
        <div>
          <h2>${esc(lang.name)}</h2>
          <div class="muted">${esc(lang.year)} · ${esc(lang.creator)}</div>
        </div>
        <button class="modal-close" id="modalClose">✕</button>
      </div>
      <p>${esc(lang.desc)}</p>
      ${wiki ? `<p class="muted">${esc(wiki.extract)} <a href="${esc(wiki.url)}" target="_blank" rel="noopener">selengkapnya ↗</a></p>` : ''}
      <div class="kp-row"><div class="k">Paradigma</div><div class="v">${esc((lang.paradigm || []).join(', '))}</div></div>
      <div class="kp-row"><div class="k">Sistem tipe</div><div class="v">${esc(lang.typing)}</div></div>
      <div class="kp-row"><div class="k">Ekstensi</div><div class="v">${esc((lang.ext || []).join(', '))}</div></div>
      <div class="kp-row"><div class="k">Package manager</div><div class="v">${esc(lang.pkg || '-')}</div></div>
      <div class="kp-row"><div class="k">Framework utama</div><div class="v">${esc((lang.frameworks || []).join(', '))}</div></div>
      <div class="kp-row"><div class="k">Dipakai oleh</div><div class="v">${esc((lang.usedBy || []).join(', '))}</div></div>
      <div class="kp-row"><div class="k">Kisaran gaji</div><div class="v">$${esc(lang.salary)}/tahun</div></div>
      <h4>Kelebihan</h4><ul class="pros">${(lang.pros || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <h4>Kekurangan</h4><ul class="cons">${(lang.cons || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <h4>Contoh kode</h4>
      <code class="snippet">${esc(lang.hello || '')}</code>
      <div class="kp-actions">
        <a class="btn" href="${esc(lang.site)}" target="_blank" rel="noopener">Situs resmi ↗</a>
        <a class="btn btn--ghost" href="${esc(lang.docs)}" target="_blank" rel="noopener">Dokumentasi ↗</a>
        <button class="btn btn--ghost" id="modalCopy">Salin kode</button>
      </div>
      ${news && news.headlines && news.headlines.length ? `<h4>Berita terbaru tentang ${esc(lang.name)}</h4>
        <div>${news.headlines.slice(0, 4).map((a) => `<div class="news-item"><div><h4><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a></h4><div class="src">${esc(a.publisher)} · ${esc(a.publishedText || '')}</div></div></div>`).join('')}</div>` : ''}
    `;
    $('#modalClose').onclick = closeModal;
    $('#modalCopy').onclick = () => {
      navigator.clipboard?.writeText(lang.hello || '');
      notify('Kode disalin.', 'info');
    };
  } catch (err) {
    card.innerHTML = `<div class="empty"><h3>Gagal memuat detail</h3><p>${esc(err.message)}</p></div>
      <button class="btn" id="modalClose">Tutup</button>`;
    $('#modalClose').onclick = closeModal;
  }
}

function closeModal() {
  $('#modal').hidden = true;
}

/* ---------------- trending ---------------- */
async function loadTrending() {
  try {
    const res = await fetch('/api/trending');
    const data = await res.json();
    $('#trendGrid').innerHTML = data.languages
      .map(
        (l) => `<div class="trend-card" data-q="${esc(l.name)}">
          <h3><span class="dot" style="width:10px;height:10px;border-radius:50%;background:${esc(l.accent)};display:inline-block"></span>
            ${esc(l.name)} <span class="rank">#${esc(l.rank)}</span></h3>
          <p>${esc(String(l.desc).slice(0, 110))}…</p>
        </div>`
      )
      .join('');
    $$('#trendGrid .trend-card').forEach((c) => {
      c.onclick = () => doSearch(c.dataset.q);
    });
  } catch (e) {
    $('#trendGrid').innerHTML = '<p class="muted">Gagal memuat daftar bahasa populer.</p>';
  }
}

/* ---------------- event wiring ---------------- */
function init() {
  initTheme();
  applyColorScheme();
  loadNotif();
  loadTrending();

  const homeInput = $('#inputHome');
  const topInput = $('#inputTop');
  setupSuggest(homeInput, $('#suggestHome'));
  setupSuggest(topInput, $('#suggestTop'));

  $('#formHome').addEventListener('submit', (e) => {
    e.preventDefault();
    doSearch(homeInput.value);
  });
  $('#formTop').addEventListener('submit', (e) => {
    e.preventDefault();
    doSearch(topInput.value);
  });
  $('#btnSearchHome').onclick = () => doSearch(homeInput.value);
  $('#btnLucky').onclick = async () => {
    const q = homeInput.value.trim();
    if (q) {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        notify(data.blocked ? 'Kata kunci tidak diizinkan.' : (data.error || 'Pencarian gagal.'), 'warn');
        return;
      }
      if (data.results.length) return openLanguage(data.results[0].id);
    }
    const res = await fetch('/api/trending');
    const data = await res.json();
    const pick = data.languages[Math.floor(Math.random() * data.languages.length)];
    notify(`Feeling lucky: membuka ${pick.name}.`, 'info');
    openLanguage(pick.id);
  };

  $$('.chip').forEach((chip) => {
    chip.onclick = () => {
      homeInput.value = chip.dataset.q;
      doSearch(chip.dataset.q);
    };
  });

  $$('.tab').forEach((tab) => {
    tab.onclick = () => {
      state.tab = tab.dataset.tab;
      $$('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      if (state.raw) renderAll(state.raw);
      else if (state.query) doSearch(state.query, { keepTab: true });
    };
  });

  $('#clearHome').onclick = () => { homeInput.value = ''; $('#clearHome').hidden = true; homeInput.focus(); };
  $('#clearTop').onclick = () => { topInput.value = ''; $('#clearTop').hidden = true; };

  $('#themeBtn').onclick = () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  };

  $('#bellBtn').onclick = () => {
    const panel = $('#notifPanel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      state.notif.forEach((n) => (n.read = true));
      saveNotif();
    }
  };
  $('#clearNotif').onclick = () => {
    state.notif = [];
    saveNotif();
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#notifPanel') && !e.target.closest('#bellBtn')) $('#notifPanel').hidden = true;
  });

  $('#modal').addEventListener('click', (e) => {
    if (e.target === $('#modal')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); $('#notifPanel').hidden = true; }
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      (homeInput.offsetParent ? homeInput : topInput).focus();
    }
  });

  $('#brandSmall').onclick = (e) => {
    e.preventDefault();
    showHome();
    location.hash = '';
  };

  ['#inputHome', '#inputTop'].forEach((sel) => {
    $(sel).addEventListener('input', (e) => {
      const clear = sel === '#inputHome' ? $('#clearHome') : $('#clearTop');
      clear.hidden = !e.target.value;
    });
  });

  // deep-link dari URL
  const hash = location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  if (params.get('q')) {
    doSearch(params.get('q'));
  } else {
    showHome();
  }
}

document.addEventListener('DOMContentLoaded', init);
