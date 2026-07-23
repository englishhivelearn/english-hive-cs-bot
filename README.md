# English Hive — WhatsApp CS Bot (Tanpa AI)

Bot Customer Service WhatsApp berbasis Baileys + Knowledge Base similarity search,
dengan dashboard admin Next.js dan database PostgreSQL via Prisma.

Struktur project ini sudah dibuat lengkap: tinggal ikuti tahapan di bawah untuk
menjalankannya di lokal, lalu deploy ke Railway.

---

## 0. Struktur Folder

```
english-hive-cs-bot/
├── bot/index.js              # Entry point bot Baileys (message processor)
├── lib/
│   ├── prisma.js              # Prisma client singleton
│   ├── knowledgeEngine.js     # Similarity search knowledge base
│   ├── sessionManager.js      # CRUD conversation_sessions
│   └── conversationFlow.js    # Multi-step flow (trial booking, dll)
├── pages/
│   ├── index.js               # Dashboard admin (CRUD knowledge)
│   └── api/knowledge/         # REST API knowledge base
├── prisma/
│   ├── schema.prisma           # Model DB sesuai dokumen arsitektur
│   └── seed.js                 # Data contoh
├── railway.json                 # Config deploy service Next.js
└── .env.example
```

---

## TAHAP 1 — Setup Lokal

```bash
cd english-hive-cs-bot
npm install
```

Buat file `.env` dari contoh:

```bash
cp .env.example .env
```

Isi `DATABASE_URL` dengan PostgreSQL lokal (atau langsung pakai yang dari Railway
di Tahap 3 kalau malas install Postgres lokal).

Contoh kalau kamu punya Postgres lokal:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/english_hive"
```

## TAHAP 2 — Migrasi & Seed Database

```bash
npx prisma migrate dev --name init
npm run seed
```

Ini akan membuat semua tabel (`knowledge_categories`, `knowledge`,
`knowledge_keywords`, `conversation_sessions`) sekaligus mengisi 2 contoh data
(jam operasional & trial class).

## TAHAP 3 — Jalankan Dashboard Admin

```bash
npm run dev
```

Buka `http://localhost:3000` → kamu akan melihat dashboard untuk
menambah/edit/hapus knowledge base tanpa sentuh kode sama sekali.

## TAHAP 4 — Jalankan Bot WhatsApp (Baileys)

Di terminal terpisah:

```bash
npm run bot
```

- QR code akan muncul di terminal.
- Scan pakai WhatsApp di HP: **Setelan → Perangkat Tertaut → Tautkan Perangkat**.
- Setelah tersambung, coba kirim pesan ke nomor tersebut, misalnya:
  - `"jam buka"` → bot balas dari knowledge base
  - `"trial"` → bot mulai flow tanya nama, level, jadwal
  - Pesan random yang tidak dikenal → bot bilang diteruskan ke admin

Kalau berhasil sampai sini, **secara fungsional bot sudah berjalan penuh secara lokal.**

---

## TAHAP 5 — Deploy ke Railway (Hobby Plan)

Kamu akan membuat **2 service** dari repo yang sama dalam 1 project Railway:
1. `web` — Next.js admin dashboard
2. `bot` — proses Baileys (long-running worker)

Plus 1 **PostgreSQL** database.

### 5.1 Push ke GitHub

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin <url-repo-github-kamu>
git push -u origin main
```

### 5.2 Buat Project di Railway

1. Buka [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pilih repo ini.
2. Railway otomatis mendeteksi Next.js dan membuat service pertama (`web`).

### 5.3 Tambah PostgreSQL

1. Di dalam project, klik **+ New** → **Database** → **PostgreSQL**.
2. Railway otomatis membuat variable `DATABASE_URL`.
3. Di service `web`, buka tab **Variables** → klik **Add Reference Variable** →
   pilih `DATABASE_URL` dari service Postgres, supaya otomatis ter-link.

### 5.4 Setting Service `web` (Next.js)

Tab **Settings**:
- **Build Command**: `npm install && npx prisma generate && npm run build`
- **Start Command**: `npx prisma migrate deploy && npm start`

(Sudah otomatis terbaca dari `railway.json`, tapi cek ulang di tab Settings.)

Setelah deploy sukses, buka domain yang diberikan Railway → dashboard admin
kamu sudah live. Jalankan seed sekali via **Railway CLI**:

```bash
railway run npm run seed
```

### 5.5 Tambah Service Kedua untuk Bot (`bot`)

1. Di project yang sama, klik **+ New** → **GitHub Repo** → pilih repo yang **sama** lagi.
2. Ini akan membuat service baru. Beri nama `bot`.
3. Di tab **Settings** service `bot`:
   - **Build Command**: `npm install && npx prisma generate`
   - **Start Command**: `npm run bot`
4. Di tab **Variables** service `bot`: tambahkan reference `DATABASE_URL` (sama seperti service `web`).
5. Tambahkan variable `BAILEYS_AUTH_DIR` = `/data/auth_info`

### 5.6 Pasang Volume untuk Sesi WhatsApp (WAJIB)

Tanpa ini, setiap kali service `bot` restart/redeploy, kamu harus scan QR ulang.

1. Di service `bot` → tab **Volumes** → **+ New Volume**.
2. Mount path: `/data`
3. Redeploy service `bot`.

Sekarang folder `auth_info` Baileys akan tersimpan permanen di `/data/auth_info`.

### 5.7 Scan QR di Production

1. Buka tab **Deployments** → **View Logs** pada service `bot`.
2. QR code akan tercetak di log (dalam bentuk ASCII).
3. Scan dengan WhatsApp seperti biasa. Setelah tersambung, log akan menampilkan
   `✅ Bot WhatsApp English Hive tersambung!`

### 5.8 Atur Spending Limit (Penting untuk Hobby Plan)

Railway tidak membatasi biaya secara default. Di **Project Settings → Usage**,
aktifkan **Spending Limit** supaya tidak kena tagihan tak terduga di luar
paket $5/bulan.

---

## TAHAP 6 — Uji Coba End-to-End

1. Kirim WhatsApp ke nomor bot: `"jam buka"` → harus dapat balasan otomatis.
2. Ketik `"trial"` → ikuti alur tanya nama → level → jadwal.
3. Buka dashboard admin (`https://<domain-web>.up.railway.app`) → tambah
   knowledge baru → langsung tanya hal itu di WhatsApp → bot harus bisa jawab
   tanpa restart apapun (real-time query ke DB).

Kalau ketiga hal ini jalan, sistem sudah **fully functional** sesuai dokumen arsitektur.

---

## Roadmap Selanjutnya (dari dokumen asli)

- [ ] Registrasi siswa (perluas `conversationFlow.js`)
- [ ] Cek status SPP (butuh tabel siswa/pembayaran baru — tambahkan model Prisma)
- [ ] Human handover terstruktur (mis. kirim notifikasi ke grup admin saat confidence rendah)
- [ ] Analytics (log semua pertanyaan yang tidak terjawab untuk isi knowledge base)

## Catatan Teknis

- **Tidak pakai AI generatif** — similarity search murni pakai `string-similarity`
  (algoritma Dice's Coefficient), sesuai spesifikasi dokumen "Without AI".
- Threshold confidence ada di `lib/knowledgeEngine.js` (`CONFIDENCE_THRESHOLD = 0.35`),
  bisa disesuaikan kalau bot terlalu sering/jarang handover ke admin.
- Kalau nomor WhatsApp bot logout (misal ganti device), hapus isi Volume `/data/auth_info`
  lalu redeploy service `bot` untuk scan QR baru.
