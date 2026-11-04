# BalzzX-MD Telegram Bot

Bot Telegram multi-user dengan autentikasi identitas Telegram, tools praktis, kontrol admin, dan broadcast yang hanya dikirim kepada pengguna yang berlangganan.

## Fitur

- Pendaftaran otomatis saat pengguna mengirim `/start`; akun dikenali dari Telegram ID.
- Menu visual dengan GIF animasi BalzzX-MD dan tombol inline; gunakan `/start` atau `/help` untuk membukanya.
- Pencarian gambar Pinterest lewat `/pin`; pencarian video lewat `/pinvid`, maksimal 10 hasil per pencarian.
- Pencarian lagu SoundCloud lewat `/soundcloud <kata kunci>`, menampilkan hingga 5 hasil dan tautan resmi.
- Balasan AI otomatis memakai NeoXR GPT-Pro untuk pesan teks di chat pribadi.
- `/tourl` untuk mengunggah media yang di-reply ke Kappa dan menerima tautannya (maksimum 20 MB).
- Profil, ID, ping, waktu Jakarta, kalkulator aman, generator angka acak, dan kutipan.
- `/subscribe` dan `/unsubscribe` untuk persetujuan menerima atau berhenti dari broadcast.
- Perintah admin `/stats`, `/users`, `/broadcast`, `/ban`, dan `/unban`.
- Broadcast perlu konfirmasi admin dan dikirim hanya ke subscriber aktif; penerima yang memblokir bot otomatis dikeluarkan.
- Data pengguna, status langganan, dan blokir tersimpan di file SQLite lokal.

## Keamanan token

Token bot yang pernah dibagikan harus dicabut melalui **@BotFather**. Buat token baru dan masukkan sendiri ke `.env`; jangan kirim token melalui chat atau commit ke Git.

## Menjalankan

Persyaratan: Node.js 25 (minimum Node.js 22.5; project tidak membutuhkan server database).

```bash
npm install
cp .env.example .env
```

Isi `BOT_TOKEN` di `.env` dengan token baru dari BotFather. `BOT_ADMIN_IDS` sudah menyiapkan ID admin yang diminta. Database otomatis dibuat di `./data/balzzx.sqlite`; ubah lokasinya lewat `DATABASE_PATH` jika diperlukan. Folder `data/` diabaikan oleh Git.

```bash
npm run dev
```

Atau untuk mode production, jalankan langsung dengan Node.js:

```bash
npm start
```

Source bot menggunakan JavaScript ESM dan Node.js tanpa proses build. Untuk development dengan restart otomatis gunakan `npm run dev`. Bot menggunakan long polling; proses harus tetap berjalan agar dapat menerima update. Pesan teks biasa di chat pribadi otomatis dikirim ke NeoXR GPT-Pro untuk diproses; command dan pesan grup tidak dikirim. Fitur `/pin` dan `/pinvid` tetap memakai NeoXR `pinterest-v2`. Atur `NEOXR_API_KEY` di `.env`; endpoint dapat diubah lewat `NEOXR_API_URL` dan `NEOXR_PINTEREST_URL`.

Pengguna dan status dari database PostgreSQL lama tidak diimpor otomatis; SQLite lokal akan mulai menyimpan data bot sejak dijalankan.

## Perintah

Pengguna: `/start`, `/help`, `/profile`, `/id`, `/ping`, `/time`, `/calc`, `/random`, `/pin`, `/pinvid`, `/soundcloud`, `/tourl`, `/quote`, `/subscribe`, `/unsubscribe`.

`/tourl` mengunggah file ke layanan pihak ketiga Kappa. Gunakan hanya untuk file yang berhak Anda bagikan; jangan unggah materi privat atau sensitif.

Admin: `/stats`, `/users`, `/broadcast <pesan>`, `/ban <telegram_id>`, `/unban <telegram_id>`. Admin diverifikasi berdasarkan Telegram ID pada `BOT_ADMIN_IDS`.
