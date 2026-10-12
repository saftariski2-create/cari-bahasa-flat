

Mesin pencari **bahasa pemrograman** ala Google, dengan panel cuaca, berita terbaru, data saham,
dan **notifikasi salah ketik (typo)** bawaan.

## Menjalankan

```bash
cd cari-bahasa
npm install     # hanya butuh express
npm start       # http://localhost:3000
```

Butuh koneksi internet karena data cuaca/berita/saham diambil live. Tanpa API key apa pun.

## Fitur

| Fitur | Keterangan |
|---|---|
| Pencarian bahasa | 45+ bahasa pemrograman dengan deskripsi, paradigma, sistem tipe, ekstensi, framework, kisaran gaji, contoh kode |
| Deteksi salah ketik | Levenshtein–Damerau + bobot keyboard. `javasript` → **JavaScript**, `piton` → **Python**, `kotlen` → **Kotlin** |
| Notifikasi typo | Banner koreksi + toast dengan tombol **Perbaiki** + pusat notifikasi (ikon 🔔) tersimpan di localStorage |
| Cuaca | Ketik `cuaca Bandung` → suhu, terasa seperti, kelembapan, angin, per jam, prakiraan 5 hari (Open-Meteo) |
| Berita | `berita teknologi`, atau otomatis menampilkan berita tentang bahasa yang dicari (Google News RSS + dev.to) |
| Saham | `saham BBCA`, `AAPL`, `TLKM.JK`, `IHSG`, `bitcoin` → harga, perubahan, rentang hari/52 minggu, volume, P/E, EPS, grafik 60 hari (Google Finance + Nasdaq) |
| Panel pengetahuan | Panel kanan ala Google: ringkasan Wikipedia, level belajar, package manager, "Halo dunia" + tombol salin |
| Lainnya | Autocomplete, riwayat pencarian, tab (Semua/Bahasa/Cuaca/Berita/Saham), tema gelap/terang, deep-link `#q=…`, tombol *Saya Lagi Beruntung* |

## Contoh query

```
rust                    → hasil bahasa + panel + berita Rust
javasript               → typo terdeteksi, notifikasi + saran JavaScript
bahasa untuk AI         → pencarian semantik berbasis tag
bahasa paling mudah dipelajari
cuaca Surabaya
berita kecerdasan buatan
saham Apple / saham BBCA / IHSG / NVDA / bitcoin
```

## Endpoint API

| Endpoint | Contoh |
|---|---|
| `GET /api/search?q=` | Hasil gabungan: intent, hasil bahasa, typo, cuaca, berita, saham, wiki |
| `GET /api/suggest?q=` | Saran autocomplete |
| `GET /api/weather?q=` | `/api/weather?q=Bandung` |
| `GET /api/news?q=` | `/api/news?q=rust` |
| `GET /api/stock?q=` | `/api/stock?q=BBCA` |
| `GET /api/language/:id` | `/api/language/go` |
| `GET /api/spellcheck?q=` | Hanya pengecekan ejaan |
| `GET /api/trending` | 12 bahasa terpopuler |
| `GET /api/health` | Status server |

## Struktur

```
server.js                 Express + route API (cache in-memory, TTL 2–10 menit)
src/data/languages.js     Dataset bahasa pemrograman
src/lib/fuzzy.js          Normalisasi, jarak edit Damerau-Levenshtein, kemiripan
src/lib/search.js         Skoring, deteksi typo, saran, sortir berbasis niat
src/lib/http.js           fetch dengan timeout + UA
src/services/weather.js   Open-Meteo (geocoding + prakiraan)
src/services/news.js      Google News RSS + dev.to
src/services/stocks.js    Google Finance (scraping terarah) + Nasdaq (riwayat)
src/services/wiki.js      Wikipedia (ID → EN)
public/                   index.html, styles.css, app.js (tanpa framework)
```

## Sumber data

- Cuaca: [Open-Meteo](https://open-meteo.com) (gratis, tanpa key)
- Berita: Google News RSS (`hl=id&gl=ID`) + [dev.to API](https://developers.forem.com/api)
- Saham: Google Finance + [Nasdaq API](https://api.nasdaq.com) (riwayat harga)
- Ensiklopedia: Wikipedia API (id → en)

> Data saham bersifat informasi, bukan rekomendasi investasi.
