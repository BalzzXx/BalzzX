# BalzzX-MD Telegram Bot

Bot Telegram multi-user dengan autentikasi identitas Telegram, tools praktis, AI opsional, kontrol admin, dan broadcast yang hanya dikirim kepada pengguna yang berlangganan.

## Fitur

- Pendaftaran otomatis saat pengguna mengirim `/start`; akun dikenali dari Telegram ID.
- Menu visual dengan tombol inline dan ilustrasi landscape orisinal; gunakan `/start` atau `/help` untuk membukanya.
- Pencarian gambar Pinterest lewat `/pinterest` atau `/pin`; pencarian video lewat `/pinvid` atau `/pv`, maksimal 10 hasil per pencarian.
- Katalog API NeoXR resmi melalui `/apis`; jalankan endpoint aktif yang tercantum di katalog dengan `/neoxr`.
- `/tourl` untuk mengunggah media yang di-reply ke Kappa dan menerima tautannya (maksimum 20 MB).
- Profil, ID, ping, waktu Jakarta, kalkulator aman, generator angka acak, dan kutipan.
- `/subscribe` dan `/unsubscribe` untuk persetujuan menerima atau berhenti dari broadcast.
- AI percakapan opsional dengan konteks terbatas; dapat dihapus menggunakan `/resetai`.
- Perintah admin `/stats`, `/users`, `/broadcast`, `/ban`, dan `/unban`.
- Broadcast perlu konfirmasi admin dan dikirim hanya ke subscriber aktif; penerima yang memblokir bot otomatis dikeluarkan.
- Data pengguna tersimpan di PostgreSQL.

## Keamanan token

Token bot yang pernah dibagikan harus dicabut melalui **@BotFather**. Buat token baru dan masukkan sendiri ke `.env`; jangan kirim token melalui chat atau commit ke Git.

## Menjalankan

Persyaratan: Node.js 25 dan PostgreSQL (project tetap kompatibel dengan Node.js 20+).

```bash
npm install
cp .env.example .env
```

Isi `BOT_TOKEN` di `.env` dengan token baru dari BotFather. `BOT_ADMIN_IDS` sudah menyiapkan ID admin yang diminta. Atur `DATABASE_URL` ke PostgreSQL yang dapat dijangkau dari mesin bot, lalu jalankan:

```bash
npm run dev
```

Atau untuk mode production, jalankan langsung dengan Node.js:

```bash
npm start
```

Source bot menggunakan JavaScript ESM dan Node.js tanpa proses build. Untuk development dengan restart otomatis gunakan `npm run dev`. Bot menggunakan long polling; proses harus tetap berjalan agar dapat menerima update. Fitur `/ai` menggunakan endpoint NeoXR `gpt-pro`, pencarian Pinterest memakai `pinterest-v2`, dan `/apis` mengambil daftar endpoint dari katalog NeoXR. `/neoxr` hanya menjalankan endpoint aktif yang tercatat di katalog, dengan parameter yang divalidasi terhadap dokumentasinya. Atur `NEOXR_API_KEY` di `.env`; endpoint AI dan Pinterest dapat diubah lewat `NEOXR_API_URL` dan `NEOXR_PINTEREST_URL`.

## Perintah

Pengguna: `/start`, `/help`, `/profile`, `/id`, `/ping`, `/time`, `/calc`, `/random`, `/pinterest` (`/pin`), `/pinvid` (`/pv`), `/tourl`, `/quote`, `/subscribe`, `/unsubscribe`, `/ai`, `/resetai`, `/apis [kata kunci]`, dan `/neoxr <endpoint> [parameter=value]`.

Contoh NeoXR: `/apis searching`, `/neoxr cuaca subdistrict=batang`, `/neoxr google q="node.js"`. Daftar endpoint dapat berubah mengikuti dokumentasi NeoXR; endpoint premium tetap memerlukan paket/kuota yang sesuai dengan akun API.

`/tourl` mengunggah file ke layanan pihak ketiga Kappa. Gunakan hanya untuk file yang berhak Anda bagikan; jangan unggah materi privat atau sensitif.

Admin: `/stats`, `/users`, `/broadcast <pesan>`, `/ban <telegram_id>`, `/unban <telegram_id>`. Admin diverifikasi berdasarkan Telegram ID pada `BOT_ADMIN_IDS`.
