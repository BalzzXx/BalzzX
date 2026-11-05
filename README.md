# BalzzX-MD Telegram Bot

Bot Telegram multi-user dengan autentikasi identitas Telegram, tools praktis, kontrol admin, dan broadcast yang hanya dikirim kepada pengguna yang berlangganan.

## Fitur

- Pengguna wajib mendaftar melalui `/daftar` sebelum memakai bot; akun dikenali dari Telegram ID.
- Menu visual memakai media dari `MENU_MEDIA_URL` dengan tombol inline; gambar dan GIF dikirim langsung, video otomatis dikonversi ke GIF saat bot mulai.
- Pencarian gambar Pinterest lewat `/pin`; pencarian video lewat `/pinvid`, maksimal 10 hasil per pencarian.
- Gambar iPhone quoted lewat `/iqc teks` atau alias `/quoted`; format waktu dapat diatur dengan `/iqc teks | 12:40 | 10:15`.
- Tingkatkan foto/video melalui `/hd` khusus akun premium; balas media dengan perintah tersebut.
- Pencarian lagu SoundCloud lewat `/soundcloud <kata kunci>`, menampilkan hingga 5 hasil dan tautan resmi.
- Balasan AI otomatis memakai NeoXR GPT-Pro untuk pesan teks di chat pribadi.
- `/tourl` untuk mengunggah media yang di-reply ke Kappa dan menerima tautannya (maksimum 20 MB).
- Profil, ID, ping, waktu Jakarta, kalkulator aman, generator angka acak, dan kutipan.
- `/subscribe` dan `/unsubscribe` untuk persetujuan menerima atau berhenti dari broadcast.
- Perintah admin `/stats`, `/users`, `/broadcast`, `/ban`, dan `/unban`.
- Owner yang dikonfigurasi lewat `BOT_OWNER_IDS` dapat memberi premium dengan `/addprem <telegram_id> <hari>` dan mencabutnya dengan `/delprem <telegram_id>`. Pengguna dapat memeriksa masa aktif lewat `/premium`.
- Broadcast perlu konfirmasi admin dan dikirim hanya ke subscriber aktif; penerima yang memblokir bot otomatis dikeluarkan.
- Data pengguna, status langganan, dan blokir tersimpan di file SQLite lokal.
- Pesan masuk dicatat secara realtime di console; teks dan caption pesan akan tampil di log.

## Keamanan token

Token bot yang pernah dibagikan harus dicabut melalui **@BotFather**. Buat token baru dan masukkan sendiri ke `.env`; jangan kirim token melalui chat atau commit ke Git.

## Menjalankan

Persyaratan: Node.js 25 (minimum Node.js 22.5; project tidak membutuhkan server database).

```bash
npm install
cp .env.example .env
```

Isi `BOT_TOKEN` di `.env` dengan token baru dari BotFather. `BOT_ADMIN_IDS` mengatur admin, sedangkan `BOT_OWNER_IDS` mengatur owner/pengelola premium. Database otomatis dibuat di `./data/balzzx.sqlite`; ubah lokasinya lewat `DATABASE_PATH` jika diperlukan. Media menu diambil dari `MENU_MEDIA_URL` saat startup. Folder `data/` diabaikan oleh Git.

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

Pengguna: `/start`, `/daftar`, `/help`, `/profile`, `/premium`, `/id`, `/ping`, `/time`, `/calc`, `/random`, `/pin`, `/pinvid`, `/iqc`, `/quoted`, `/hd` (premium), `/soundcloud`, `/tourl`, `/quote`, `/subscribe`, `/unsubscribe`.

Pemrosesan `/hd` untuk foto mengunggah foto ke Kappa agar NeoXR dapat mengaksesnya; video diproses lokal dengan FFmpeg. Batas ukuran media masukan 20 MB dan hasil video 45 MB. Video di-upscale secara spasial, sehingga resolusi naik tetapi detail yang tidak ada pada sumber tidak dapat dipulihkan.

`/tourl` mengunggah file ke layanan pihak ketiga Kappa. Gunakan hanya untuk file yang berhak Anda bagikan; jangan unggah materi privat atau sensitif.

Owner: `/addprem <telegram_id> <hari>`, `/delprem <telegram_id>`. Premium berlaku sesuai jumlah hari dan penambahan durasi memperpanjang masa aktif yang masih berjalan.

Admin: `/stats`, `/users`, `/broadcast <pesan>`, `/ban <telegram_id>`, `/unban <telegram_id>`. Admin diverifikasi berdasarkan Telegram ID pada `BOT_ADMIN_IDS`; owner didefinisikan secara terpisah melalui `BOT_OWNER_IDS`.
