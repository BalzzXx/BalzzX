import { dirname } from "node:path";
import { createBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { createDatabase, initializeDatabase } from "./db.js";
import { prepareMenuMedia } from "./menu-media.js";

const config = loadConfig();
const database = createDatabase(config.databasePath);
let store;

try {
    store = initializeDatabase(database);
    const menuMedia = await prepareMenuMedia(config.menuMediaUrl, dirname(config.databasePath));
    const bot = createBot(config, store, menuMedia);
    try {
        await bot.api.setMyCommands([
            { command: "start", description: "Buka menu bot" },
            { command: "help", description: "Buka bantuan bot" },
            { command: "daftar", description: "Daftarkan akun bot" },
            { command: "premium", description: "Cek status premium" },
            { command: "limit", description: "Cek kuota harian" },
            { command: "h", description: "Gambar acak (18+)" },
            { command: "addprem", description: "Owner: beri premium" },
            { command: "delprem", description: "Owner: cabut premium" },
            { command: "pin", description: "Cari gambar Pinterest" },
            { command: "pinvid", description: "Cari video Pinterest" },
            { command: "iqc", description: "Buat iPhone quoted" },
            { command: "quoted", description: "Buat iPhone quoted" },
            { command: "hd", description: "Premium: tingkatkan resolusi media" },
            { command: "soundcloud", description: "Cari lagu di SoundCloud" },
            { command: "tourl", description: "Ubah media reply menjadi tautan" },
            { command: "profile", description: "Lihat profil Telegram" },
            { command: "id", description: "Lihat ID Telegram" },
            { command: "ping", description: "Cek status bot" },
            { command: "time", description: "Lihat waktu Jakarta" },
            { command: "calc", description: "Kalkulator" },
            { command: "random", description: "Angka acak" },
            { command: "quote", description: "Kutipan acak" },
            { command: "subscribe", description: "Langganan pengumuman" },
            { command: "unsubscribe", description: "Berhenti dari pengumuman" },
            { command: "stats", description: "Statistik admin" },
            { command: "users", description: "Jumlah subscriber admin" },
            { command: "broadcast", description: "Kirim pengumuman admin" },
            { command: "ban", description: "Blokir pengguna (admin)" },
            { command: "unban", description: "Pulihkan pengguna (admin)" }
        ]);
    }
    catch (error) {
        console.error("Could not register Telegram bot commands:", error);
    }
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
            bot.stop();
        });
    }
    await bot.start({
        onStart: (botInfo) => {
            console.log(`BalzzX-MD @${botInfo.username} is running (long polling).`);
        }
    });
}
catch (error) {
    console.error("Bot startup failed:", error);
    process.exitCode = 1;
}
finally {
    if (store)
        store.close();
    else
        database.close();
}
