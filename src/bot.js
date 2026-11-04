import { Bot, GrammyError, InlineKeyboard, InputFile } from "grammy";
import { resolve } from "node:path";
import { calculate, formatJakartaTime, formatRuntime, randomInteger } from "./features.js";
import { buildNeoXrUrl, extractNeoXrAnswer } from "./neoxr.js";
import { buildPinterestUrl, downloadPinterestVideo, extractPinterestMedia } from "./pinterest.js";
import { buildIqcUrl, downloadIqcImage, extractIqcImage } from "./iqc.js";
import { buildImageUpscaleUrl, convertVideoToHd, downloadUpscaledImage, extractUpscaledImageUrl } from "./hd.js";
import { buildSoundCloudSearchUrl, extractSoundCloudTracks, formatSoundCloudTrack } from "./soundcloud.js";
import { extractKappaLink, KAPPA_UPLOAD_URL, MAX_TELEGRAM_FILE_SIZE, safeFileName } from "./tourl.js";
function getSender(ctx) {
    if (!ctx.from)
        throw new Error("Telegram update is missing its sender");
    return ctx.from;
}
function menuKeyboard(page, isAdmin, subscribed = false) {
    const keyboard = new InlineKeyboard();
    if (page === "home") {
        keyboard
            .text("🛠️ Tools", "menu:tools").text("👤 Akun", "menu:account").row()
            .text("📣 Updates", "menu:updates");
        if (isAdmin)
            keyboard.row().text("⚙️ Admin", "menu:admin");
        return keyboard;
    }
    if (page === "tools") {
        return keyboard.text("⬅️ Menu utama", "menu:home");
    }
    if (page === "account") {
        return keyboard
            .text("👤 Profil saya", "action:profile").text("🪪 ID saya", "action:id").row()
            .text("⬅️ Menu utama", "menu:home");
    }
    if (page === "updates") {
        return keyboard
            .text(subscribed ? "🔕 Berhenti berlangganan" : "🔔 Aktifkan pengumuman", subscribed ? "action:unsubscribe" : "action:subscribe")
            .row()
            .text("⬅️ Menu utama", "menu:home");
    }
    if (page === "admin") {
        return keyboard
            .text("📊 Statistik", "action:stats").text("📨 Penerima", "action:users").row()
            .text("ℹ️ Broadcast: /broadcast pesan", "action:broadcast-help").row()
            .text("⬅️ Menu utama", "menu:home");
    }
    return keyboard
        .text("➕ Tambah", "action:calc:add").text("➖ Kurang", "action:calc:subtract").row()
        .text("✖️ Kali", "action:calc:multiply").text("➗ Bagi", "action:calc:divide").row()
        .text("Contoh: /calc 12 * 3", "action:calc-example").row()
        .text("⬅️ Tools", "menu:tools");
}
function menuCaption(page, name, subscribed, status) {
    if (page === "home") {
        return [
            "╭─ ✦ BALZZX-MD ✦ ─",
            `│ Runtime : ${status?.runtime ?? "memuat..."}`,
            `│ Ping    : ${status?.ping ?? "memuat..."}`,
            "╰─────────────────",
            "",
            `Halo ${name}! Pilih menu di bawah untuk mulai.`,
            "🔐 Akun Telegram terverifikasi"
        ].join("\n");
    }
    if (page === "tools") {
        return [
            "╭─ ✦ BALZZX-MD · TOOLS ✦ ─",
            `│ Runtime : ${status?.runtime ?? "memuat..."}`,
            `│ Ping    : ${status?.ping ?? "memuat..."}`,
            "╰────────────────────────",
            "",
            "🧰 PERINTAH LAIN",
            "/ping — cek bot",
            "/time — waktu Jakarta",
            "/random 1 100 — angka acak",
            "/calc 12 * 3 — kalkulator",
            "/pinterest kucing (alias /pin) — cari gambar",
            "/pinvid kucing (alias /pv) — cari video",
            "/iqc teks — buat iPhone quoted (alias /quoted)",
            "/hd — balas foto/video untuk meningkatkan resolusi",
            "/soundcloud du ka — cari lagu di SoundCloud",
            "/tourl — reply media untuk membuat tautan"
        ].join("\n");
    }
    if (page === "account")
        return "👤 AKUN\n\nInfo akun Telegram kamu.";
    if (page === "updates") {
        return `📣 PENGUMUMAN\n\nStatus: ${subscribed ? "✅ berlangganan" : "tidak berlangganan"}\n\nLangganan bersifat opsional dan bisa dihentikan kapan saja.`;
    }
    if (page === "admin")
        return "⚙️ ADMIN PANEL\n\nAkses admin terverifikasi untuk akun ini.";
    return "🧮 KALKULATOR\n\nKirim contoh perintah berikut, ganti angka dan operator sesuai kebutuhan:\n/calc 12 * 3";
}
export function createBot(config, store, menuMedia) {
    const bot = new Bot(config.token);
    const startedAt = Date.now();
    const pendingBroadcasts = new Map();
    const configuredCommandChats = new Set();
    const aiInFlight = new Set();
    async function getBotStatus() {
        const before = Date.now();
        try {
            await bot.api.getMe();
            return {
                runtime: formatRuntime(Date.now() - startedAt),
                ping: `${Date.now() - before} ms`
            };
        }
        catch (error) {
            console.error("Could not measure Telegram Bot API ping:", error);
            return {
                runtime: formatRuntime(Date.now() - startedAt),
                ping: "tidak tersedia"
            };
        }
    }
    async function sendMainMenu(ctx) {
        const user = getSender(ctx);
        const subscribed = store.isSubscribed(user.id);
        const status = await getBotStatus();
        const options = {
            caption: menuCaption("home", user.first_name, subscribed, status),
            reply_markup: menuKeyboard("home", config.adminIds.has(String(user.id)), subscribed)
        };
        const media = new InputFile(menuMedia.path);
        if (menuMedia.type === "photo")
            await ctx.replyWithPhoto(media, options);
        else
            await ctx.replyWithAnimation(media, options);
    }
    async function saveUser(from) {
        return store.saveUser(from);
    }
    bot.use(async (ctx, next) => {
        if (!ctx.from)
            return next();
        const banned = await saveUser(ctx.from);
        if (banned) {
            if (ctx.callbackQuery)
                await ctx.answerCallbackQuery({ text: "Akses bot Anda dibatasi." });
            else if (ctx.chat)
                await ctx.reply("Akses bot Anda dibatasi oleh admin.");
            return;
        }
        const chatId = ctx.chat?.id;
        if (chatId !== undefined && !configuredCommandChats.has(chatId)) {
            try {
                await bot.api.setMyCommands([
                    { command: "start", description: "Buka menu bot" },
                    { command: "help", description: "Buka bantuan bot" },
                    { command: "pin", description: "Cari gambar Pinterest" },
                    { command: "pinvid", description: "Cari video Pinterest" },
                    { command: "iqc", description: "Buat iPhone quoted" },
                    { command: "quoted", description: "Buat iPhone quoted" },
                    { command: "hd", description: "Tingkatkan resolusi foto/video" },
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
                ], { scope: { type: "chat", chat_id: chatId } });
                configuredCommandChats.add(chatId);
            }
            catch (error) {
                console.error("Could not update Telegram chat commands:", error);
            }
        }
        return next();
    });
    bot.command("start", async (ctx) => {
        await sendMainMenu(ctx);
    });
    bot.command("help", async (ctx) => {
        await sendMainMenu(ctx);
    });
    bot.callbackQuery(/^menu:(home|tools|account|updates|admin|calc)$/, async (ctx) => {
        const user = getSender(ctx);
        const page = ctx.match[1];
        if (page === "admin" && !config.adminIds.has(String(user.id))) {
            await ctx.answerCallbackQuery({ text: "Menu khusus admin.", show_alert: true });
            return;
        }
        const subscribed = store.isSubscribed(user.id);
        const status = page === "home" || page === "tools"
            ? await getBotStatus()
            : undefined;
        await ctx.answerCallbackQuery();
        await ctx.editMessageCaption({
            caption: menuCaption(page, user.first_name, subscribed, status),
            reply_markup: menuKeyboard(page, config.adminIds.has(String(user.id)), subscribed)
        });
    });
    bot.callbackQuery(/^action:(.+)$/, async (ctx) => {
        const user = getSender(ctx);
        const action = ctx.match[1];
        await ctx.answerCallbackQuery();
        if (!action)
            return;
        if (action === "ping")
            return ctx.reply("🏓 Pong! Bot aktif.");
        if (action === "time")
            return ctx.reply(`🕒 ${formatJakartaTime()}`);
        if (action === "random") {
            return ctx.reply(`🎲 Angka acak: ${randomInteger(1, 100)}`);
        }
        if (action === "profile") {
            return ctx.reply(`Nama: ${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}\n` +
                `Username: ${user.username ? `@${user.username}` : "belum diatur"}\nID: ${user.id}`);
        }
        if (action === "id")
            return ctx.reply(`Telegram ID: ${user.id}`);
        if (action === "pinterest") {
            return ctx.reply("Cari gambar dengan /pin cat.\nCari video dengan /pinvid cat.");
        }
        if (action === "pinvid") {
            return ctx.reply("Cari video dengan format:\n/pinvid cat");
        }
        if (action === "tourl") {
            return ctx.reply("Balas (reply) foto, video, audio, atau dokumen dengan /tourl untuk membuat tautan Kappa.");
        }
        if (action === "subscribe" || action === "unsubscribe") {
            const subscribed = action === "subscribe";
            store.setSubscribed(user.id, subscribed);
            await ctx.editMessageCaption({
                caption: menuCaption("updates", user.first_name, subscribed),
                reply_markup: menuKeyboard("updates", config.adminIds.has(String(user.id)), subscribed)
            });
            return ctx.reply(subscribed
                ? "✅ Berhasil berlangganan pengumuman admin."
                : "Kamu berhenti berlangganan pengumuman.");
        }
        if (action === "broadcast-help") {
            return ctx.reply("Format broadcast: /broadcast pesan\nPengiriman perlu konfirmasi tombol.");
        }
        if (action === "stats" || action === "users") {
            if (!config.adminIds.has(String(user.id))) {
                return ctx.reply("Perintah khusus admin.");
            }
            if (action === "users") {
                return ctx.reply(`📨 Penerima broadcast aktif: ${store.countSubscribers()}`);
            }
            const stats = store.getStats();
            return ctx.reply(`📊 Statistik\nPengguna terdaftar: ${stats.total}\nSubscriber broadcast: ${stats.subscribers}\nDiblokir: ${stats.banned}`);
        }
        if (action.startsWith("calc:")) {
            const operation = action.slice("calc:".length);
            if (operation === "example") {
                return ctx.reply("Contoh: /calc 12 * 3\nGanti angka atau operator (+, -, *, /) sesuai kebutuhan.");
            }
            const examples = {
                add: "/calc 12 + 3",
                subtract: "/calc 12 - 3",
                multiply: "/calc 12 * 3",
                divide: "/calc 12 / 3"
            };
            if (examples[operation])
                return ctx.reply(`Kirim: ${examples[operation]}`);
        }
        return ctx.reply("Aksi tidak dikenali. Ketik /start untuk membuka menu.");
    });
    bot.command("profile", async (ctx) => {
        const user = getSender(ctx);
        await ctx.reply(`Nama: ${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}\n` +
            `Username: ${user.username ? `@${user.username}` : "belum diatur"}\n` +
            `ID: ${user.id}`);
    });
    bot.command("id", (ctx) => ctx.reply(`Telegram ID: ${getSender(ctx).id}`));
    bot.command("ping", (ctx) => ctx.reply("🏓 Pong! Bot aktif."));
    bot.command("time", (ctx) => ctx.reply(`🕒 ${formatJakartaTime()}`));
    bot.command("calc", async (ctx) => {
        const result = calculate(ctx.match);
        if (result === undefined) {
            await ctx.reply("Format: /calc 12 * 3\nOperator: + - * / (pembagian dengan nol tidak diperbolehkan)");
            return;
        }
        await ctx.reply(`🧮 Hasil: ${result}`);
    });
    bot.command("random", async (ctx) => {
        const [minText, maxText] = ctx.match.trim().split(/\s+/);
        const minimum = Number(minText);
        const maximum = Number(maxText);
        const result = randomInteger(minimum, maximum);
        if (result === undefined) {
            await ctx.reply("Format: /random 1 100 (bilangan bulat, rentang maksimal 1.000.000)");
            return;
        }
        await ctx.reply(`🎲 Angka acak: ${result}`);
    });
    async function searchPinterest(ctx, rawQuery, type) {
        const query = rawQuery.trim();
        const command = type === "image" ? "/pinterest" : "/pinvid";
        if (!query) {
            await ctx.reply(`Format: ${command} kata kunci\nContoh: ${command} cat` +
                (type === "image" ? "\nAlias: /pin" : "\nAlias: /pv"));
            return;
        }
        if (query.length > 150) {
            await ctx.reply("Kata kunci terlalu panjang (maksimal 150 karakter).");
            return;
        }
        if (!config.aiApiKey) {
            await ctx.reply("Layanan pencarian belum dikonfigurasi.");
            return;
        }
        await ctx.replyWithChatAction("typing");
        try {
            const response = await fetch(buildPinterestUrl(config.pinterestApiUrl, config.aiApiKey, query, 10, type), { signal: AbortSignal.timeout(30_000) });
            if (!response.ok) {
                console.error(`NeoXR Pinterest request failed with HTTP ${response.status}`);
                await ctx.reply("Pencarian Pinterest sedang bermasalah. Coba lagi nanti.");
                return;
            }
            const payload = await response.json();
            const media = extractPinterestMedia(payload, type, 10);
            if (media.length === 0) {
                await ctx.reply(`Tidak ada ${type === "image" ? "gambar" : "video"} yang ditemukan. Coba kata kunci lain.`);
                return;
            }
            const chatId = ctx.chat?.id;
            if (chatId === undefined) {
                await ctx.reply("Pencarian ini hanya tersedia di chat Telegram.");
                return;
            }
            const caption = (item, index) => index === 0
                ? `📌 Hasil ${type === "image" ? "gambar" : "video"} Pinterest: ${query}${item.title ? `\n${item.title}` : ""}`
                : undefined;
            if (media.length === 1) {
                const item = media[0];
                if (type === "image") {
                    await ctx.api.sendPhoto(chatId, item.url, {
                        caption: caption(item, 0)
                    });
                }
                else {
                    await ctx.api.sendVideo(chatId, item.url, {
                        caption: caption(item, 0)
                    });
                }
                return;
            }
            if (type === "image") {
                await ctx.api.sendMediaGroup(chatId, media.map((item, index) => ({
                    type: "photo",
                    media: item.url,
                    ...(caption(item, index) ? { caption: caption(item, index) } : {})
                })));
            }
            else {
                for (const [index, item] of media.entries()) {
                    const video = await downloadPinterestVideo(item.url);
                    await ctx.api.sendVideo(chatId, new InputFile(video, "pinterest-video.mp4"), {
                        ...(caption(item, index) ? { caption: caption(item, index) } : {})
                    });
                }
            }
        }
        catch (error) {
            console.error(`Pinterest ${type} search failed:`, error);
            await ctx.reply(`Tidak dapat mengambil ${type === "image" ? "gambar" : "video"} sekarang. Coba lagi nanti.`);
        }
    }
    bot.command("pin", (ctx) => searchPinterest(ctx, ctx.match, "image"));
    bot.command("pinvid", (ctx) => searchPinterest(ctx, ctx.match, "video"));
    async function createIqc(ctx) {
        const parts = ctx.match.split("|").map((part) => part.trim());
        const text = parts[0] ?? "";
        const time = parts[1] || "12:40";
        const chatTime = parts[2] || "10:15";
        const validTime = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
        if (!text || parts.length > 3 || !validTime.test(time) || !validTime.test(chatTime)) {
            await ctx.reply("Format: /iqc teks | waktu | waktu_chat\nContoh: /iqc ayo scroll fesnuk 😜 | 12:40 | 10:15\nAlias: /quoted");
            return;
        }
        if (text.length > 500) {
            await ctx.reply("Teks terlalu panjang (maksimal 500 karakter).");
            return;
        }
        if (!config.aiApiKey) {
            await ctx.reply("NeoXR belum dikonfigurasi. Admin perlu mengisi NEOXR_API_KEY di .env.");
            return;
        }
        await ctx.replyWithChatAction("upload_photo");
        try {
            const response = await fetch(buildIqcUrl(config.iqcApiUrl, config.aiApiKey, text, time, chatTime), {
                signal: AbortSignal.timeout(30_000)
            });
            if (!response.ok) {
                console.error(`NeoXR IQC request failed with HTTP ${response.status}`);
                await ctx.reply("Pembuatan IQC sedang bermasalah. Coba lagi nanti.");
                return;
            }
            const imageSource = extractIqcImage(await response.json());
            if (!imageSource) {
                await ctx.reply("NeoXR tidak mengembalikan gambar IQC. Coba lagi nanti.");
                return;
            }
            const image = await downloadIqcImage(imageSource.url, imageSource.mime);
            await ctx.replyWithPhoto(new InputFile(image.bytes, `iqc.${image.extension}`));
        }
        catch (error) {
            console.error("NeoXR IQC generation failed:", error);
            await ctx.reply("Tidak dapat membuat gambar IQC sekarang. Coba lagi nanti.");
        }
    }
    bot.command("iqc", createIqc);
    bot.command("quoted", createIqc);
    bot.command("hd", async (ctx) => {
        const source = ctx.msg.reply_to_message;
        if (!source) {
            await ctx.reply("Balas foto atau video dengan /hd untuk meningkatkan resolusinya.\nFoto diunggah ke Kappa lalu diproses NeoXR; video di-upscale lokal ke HD 1080.");
            return;
        }
        const photo = source.photo?.at(-1);
        const video = source.video ?? source.animation;
        const media = photo
            ? { fileId: photo.file_id, size: photo.file_size, type: "photo" }
            : video
                ? { fileId: video.file_id, size: video.file_size, type: "video" }
                : undefined;
        if (!media) {
            await ctx.reply("Balas foto atau video dengan /hd. Tipe media ini belum didukung.");
            return;
        }
        if (media.size !== undefined && media.size > MAX_TELEGRAM_FILE_SIZE) {
            await ctx.reply("Media melebihi batas ukuran 20 MB.");
            return;
        }
        if (media.type === "photo" && !config.aiApiKey) {
            await ctx.reply("NeoXR belum dikonfigurasi. Admin perlu mengisi NEOXR_API_KEY di .env.");
            return;
        }
        await ctx.replyWithChatAction(media.type === "photo" ? "upload_document" : "upload_video");
        try {
            const telegramFile = await ctx.api.getFile(media.fileId);
            if (!telegramFile.file_path) {
                await ctx.reply("Telegram tidak menyediakan file untuk diunduh.");
                return;
            }
            const telegramUrl = `https://api.telegram.org/file/bot${config.token}/` +
                telegramFile.file_path.split("/").map(encodeURIComponent).join("/");
            const download = await fetch(telegramUrl, { signal: AbortSignal.timeout(30_000) });
            if (!download.ok)
                throw new Error(`Telegram file download failed with HTTP ${download.status}`);
            const contentLength = Number(download.headers.get("content-length"));
            if (Number.isFinite(contentLength) && contentLength > MAX_TELEGRAM_FILE_SIZE)
                throw new Error("Media exceeds Telegram's 20 MB download limit");
            const bytes = new Uint8Array(await download.arrayBuffer());
            if (bytes.byteLength === 0 || bytes.byteLength > MAX_TELEGRAM_FILE_SIZE)
                throw new Error("Media is empty or exceeds Telegram's 20 MB download limit");

            if (media.type === "photo") {
                const form = new FormData();
                form.append("file", new Blob([bytes], { type: "image/jpeg" }), "photo.jpg");
                const upload = await fetch(KAPPA_UPLOAD_URL, {
                    method: "POST",
                    body: form,
                    signal: AbortSignal.timeout(60_000)
                });
                if (!upload.ok)
                    throw new Error(`Kappa upload failed with HTTP ${upload.status}`);
                const sourceUrl = extractKappaLink(await upload.json());
                if (!sourceUrl)
                    throw new Error("Kappa returned an invalid or unrecognized upload link");
                const response = await fetch(buildImageUpscaleUrl(config.upscaleApiUrl, config.aiApiKey, sourceUrl), {
                    signal: AbortSignal.timeout(60_000)
                });
                if (!response.ok)
                    throw new Error(`NeoXR upscale request failed with HTTP ${response.status}`);
                const imageUrl = extractUpscaledImageUrl(await response.json());
                if (!imageUrl)
                    throw new Error("NeoXR did not return a valid upscaled image link");
                const image = await downloadUpscaledImage(imageUrl);
                await ctx.replyWithDocument(new InputFile(image.bytes, `foto-hd.${image.extension}`), {
                    caption: "✅ Foto ditingkatkan oleh NeoXR."
                });
                return;
            }

            const hdVideo = await convertVideoToHd(bytes);
            await ctx.replyWithVideo(new InputFile(hdVideo, "video-hd.mp4"), {
                caption: "✅ Video di-upscale lokal ke HD 1080.",
                supports_streaming: true
            });
        }
        catch (error) {
            console.error("HD media processing failed:", error instanceof Error ? error.name : "Unknown error");
            await ctx.reply("Tidak dapat memproses media. Pastikan ukuran maksimal 20 MB dan coba lagi.");
        }
    });
    bot.command("soundcloud", async (ctx) => {
        const query = ctx.match.trim();
        if (!query) {
            await ctx.reply("Format: /soundcloud kata kunci\nContoh: /soundcloud duka");
            return;
        }
        if (query.length > 150) {
            await ctx.reply("Kata kunci terlalu panjang (maksimal 150 karakter).");
            return;
        }
        await ctx.replyWithChatAction("typing");
        try {
            const response = await fetch(buildSoundCloudSearchUrl(query), {
                signal: AbortSignal.timeout(30_000)
            });
            if (!response.ok) {
                console.error(`SoundCloud search API returned HTTP ${response.status}`);
                await ctx.reply("Pencarian SoundCloud sedang bermasalah. Coba lagi nanti.");
                return;
            }
            const tracks = extractSoundCloudTracks(await response.json(), 5);
            if (tracks.length === 0) {
                await ctx.reply("Tidak ada lagu SoundCloud yang ditemukan. Coba kata kunci lain.");
                return;
            }
            await ctx.reply(`🔎 Hasil SoundCloud untuk “${query}”\n\n${tracks.map(formatSoundCloudTrack).join("\n\n")}`);
        }
        catch (error) {
            console.error("SoundCloud search failed:", error instanceof Error ? error.name : "Unknown error");
            await ctx.reply("Tidak dapat mencari SoundCloud sekarang. Coba lagi nanti.");
        }
    });
    bot.command("tourl", async (ctx) => {
        const source = ctx.msg.reply_to_message;
        if (!source) {
            await ctx.reply("Balas (reply) foto, video, audio, atau dokumen dengan /tourl.\nMaksimum ukuran file 20 MB.");
            return;
        }
        const photo = source.photo?.at(-1);
        const media = photo
            ? { fileId: photo.file_id, size: photo.file_size, name: "photo.jpg", mime: "image/jpeg" }
            : source.video
                ? {
                    fileId: source.video.file_id,
                    size: source.video.file_size,
                    name: source.video.file_name ?? "video.mp4",
                    mime: source.video.mime_type ?? "video/mp4"
                }
                : source.animation
                    ? {
                        fileId: source.animation.file_id,
                        size: source.animation.file_size,
                        name: source.animation.file_name ?? "animation.mp4",
                        mime: source.animation.mime_type ?? "video/mp4"
                    }
                    : source.document
                        ? {
                            fileId: source.document.file_id,
                            size: source.document.file_size,
                            name: source.document.file_name ?? "document",
                            mime: source.document.mime_type ?? "application/octet-stream"
                        }
                        : source.audio
                            ? {
                                fileId: source.audio.file_id,
                                size: source.audio.file_size,
                                name: source.audio.file_name ?? "audio.mp3",
                                mime: source.audio.mime_type ?? "audio/mpeg"
                            }
                            : source.voice
                                ? {
                                    fileId: source.voice.file_id,
                                    size: source.voice.file_size,
                                    name: "voice.ogg",
                                    mime: source.voice.mime_type ?? "audio/ogg"
                                }
                                : undefined;
        if (!media) {
            await ctx.reply("Tipe media ini belum didukung. Coba foto, video, audio, atau dokumen.");
            return;
        }
        if (media.size !== undefined && media.size > MAX_TELEGRAM_FILE_SIZE) {
            await ctx.reply("Ukuran file melebihi batas 20 MB.");
            return;
        }
        await ctx.replyWithChatAction("upload_document");
        try {
            const telegramFile = await ctx.api.getFile(media.fileId);
            if (!telegramFile.file_path) {
                await ctx.reply("Telegram tidak menyediakan file untuk diunduh.");
                return;
            }
            const telegramUrl = `https://api.telegram.org/file/bot${config.token}/` +
                telegramFile.file_path.split("/").map(encodeURIComponent).join("/");
            const download = await fetch(telegramUrl, {
                signal: AbortSignal.timeout(30_000)
            });
            if (!download.ok) {
                console.error(`Telegram file download failed with HTTP ${download.status}`);
                await ctx.reply("Gagal mengunduh file dari Telegram.");
                return;
            }
            const contentLength = Number(download.headers.get("content-length"));
            if (Number.isFinite(contentLength) && contentLength > MAX_TELEGRAM_FILE_SIZE) {
                await ctx.reply("Ukuran file melebihi batas 20 MB.");
                return;
            }
            const bytes = new Uint8Array(await download.arrayBuffer());
            if (bytes.byteLength > MAX_TELEGRAM_FILE_SIZE) {
                await ctx.reply("Ukuran file melebihi batas 20 MB.");
                return;
            }
            const form = new FormData();
            form.append("file", new Blob([bytes], { type: media.mime }), safeFileName(media.name));
            const upload = await fetch(KAPPA_UPLOAD_URL, {
                method: "POST",
                body: form,
                signal: AbortSignal.timeout(60_000)
            });
            if (!upload.ok) {
                console.error(`Kappa upload failed with HTTP ${upload.status}`);
                await ctx.reply("Upload ke Kappa gagal. Coba lagi nanti.");
                return;
            }
            const payload = await upload.json();
            const link = extractKappaLink(payload);
            if (!link) {
                console.error("Kappa returned an invalid or unrecognized upload response.");
                await ctx.reply("Kappa tidak mengirim tautan yang valid.");
                return;
            }
            await ctx.reply(`✅ File berhasil diunggah:\n${link}\n\nFile disimpan di layanan pihak ketiga Kappa.`);
        }
        catch (error) {
            console.error("Kappa upload failed:", error);
            await ctx.reply("Tidak dapat mengunggah file sekarang. Coba lagi nanti.");
        }
    });
    const quotes = [
        "Perjalanan seribu langkah dimulai dari satu langkah.",
        "Kesalahan adalah bukti bahwa kamu sedang mencoba.",
        "Konsistensi kecil hari ini membangun perubahan besar esok hari."
    ];
    bot.command("quote", (ctx) => ctx.reply(`💡 ${quotes[randomInteger(0, quotes.length - 1) ?? 0]}`));
    bot.command("subscribe", async (ctx) => {
        const user = getSender(ctx);
        store.setSubscribed(user.id, true);
        await ctx.reply("✅ Kamu berlangganan pengumuman admin. Kirim /unsubscribe kapan saja untuk berhenti.");
    });
    bot.command("unsubscribe", async (ctx) => {
        const user = getSender(ctx);
        store.setSubscribed(user.id, false);
        await ctx.reply("Kamu berhenti berlangganan pengumuman. Gunakan /subscribe untuk bergabung lagi.");
    });
    const isAdmin = (id) => config.adminIds.has(String(id));
    bot.command("stats", async (ctx) => {
        if (!isAdmin(getSender(ctx).id))
            return ctx.reply("Perintah khusus admin.");
        const stats = store.getStats();
        await ctx.reply(`📊 Statistik\nPengguna terdaftar: ${stats.total}\nSubscriber broadcast: ${stats.subscribers}\nDiblokir: ${stats.banned}`);
    });
    bot.command("users", async (ctx) => {
        if (!isAdmin(getSender(ctx).id))
            return ctx.reply("Perintah khusus admin.");
        await ctx.reply(`📨 Penerima broadcast aktif: ${store.countSubscribers()}`);
    });
    bot.command("broadcast", async (ctx) => {
        const user = getSender(ctx);
        if (!isAdmin(user.id))
            return ctx.reply("Perintah khusus admin.");
        const text = ctx.match.trim();
        if (!text || text.length > 3500) {
            return ctx.reply("Format: /broadcast isi pengumuman (maksimal 3.500 karakter)");
        }
        const key = `${user.id}:${ctx.chat.id}`;
        pendingBroadcasts.set(key, text);
        const keyboard = new InlineKeyboard()
            .text("✅ Kirim ke subscriber", "broadcast:confirm")
            .text("✖️ Batal", "broadcast:cancel");
        await ctx.reply(`Konfirmasi broadcast ke semua subscriber aktif?\n\n${text}`, { reply_markup: keyboard });
    });
    bot.callbackQuery(/^broadcast:(confirm|cancel)$/, async (ctx) => {
        const user = getSender(ctx);
        if (!isAdmin(user.id)) {
            await ctx.answerCallbackQuery({ text: "Khusus admin", show_alert: true });
            return;
        }
        const key = `${user.id}:${ctx.chat?.id ?? user.id}`;
        const text = pendingBroadcasts.get(key);
        if (ctx.match[1] === "cancel") {
            pendingBroadcasts.delete(key);
            await ctx.answerCallbackQuery({ text: "Broadcast dibatalkan." });
            await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
            return;
        }
        if (!text) {
            await ctx.answerCallbackQuery({ text: "Broadcast tidak ditemukan atau sudah diproses." });
            return;
        }
        pendingBroadcasts.delete(key);
        await ctx.answerCallbackQuery({ text: "Broadcast dimulai." });
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
        const subscribers = store.listSubscribers();
        let sent = 0;
        let failed = 0;
        for (const row of subscribers) {
            try {
                await bot.api.sendMessage(row.telegram_id, text);
                sent += 1;
            }
            catch (error) {
                failed += 1;
                if (error instanceof GrammyError && error.error_code === 403) {
                    store.setSubscribed(row.telegram_id, false);
                }
                else {
                    console.error(`Broadcast delivery failed for Telegram ID ${row.telegram_id}:`, error);
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 40));
        }
        await ctx.reply(`Broadcast selesai.\nTerkirim: ${sent}\nGagal: ${failed}`);
    });
    bot.command("ban", async (ctx) => {
        if (!isAdmin(getSender(ctx).id))
            return ctx.reply("Perintah khusus admin.");
        const target = ctx.match.trim();
        if (!/^\d+$/.test(target) || config.adminIds.has(target)) {
            return ctx.reply("Format: /ban ID (admin tidak dapat diblokir)");
        }
        await ctx.reply(store.setBanned(target, true) ? `Pengguna ${target} diblokir.` : "Pengguna tidak ditemukan.");
    });
    bot.command("unban", async (ctx) => {
        if (!isAdmin(getSender(ctx).id))
            return ctx.reply("Perintah khusus admin.");
        const target = ctx.match.trim();
        if (!/^\d+$/.test(target))
            return ctx.reply("Format: /unban ID");
        await ctx.reply(store.setBanned(target, false) ? `Akses pengguna ${target} dipulihkan.` : "Pengguna tidak ditemukan.");
    });
    bot.on("message:text", async (ctx) => {
        if (ctx.chat.type !== "private" ||
            ctx.msg.entities?.some((entity) => entity.type === "bot_command" && entity.offset === 0)) {
            return;
        }
        const prompt = ctx.msg.text.trim();
        if (!prompt)
            return;
        if (prompt.length > 3000) {
            await ctx.reply("Pesan terlalu panjang untuk AI (maksimal 3.000 karakter).");
            return;
        }
        if (!config.aiApiKey) {
            await ctx.reply("AI belum dikonfigurasi. Admin perlu mengisi NEOXR_API_KEY di .env.");
            return;
        }
        const userId = String(getSender(ctx).id);
        if (aiInFlight.has(userId)) {
            await ctx.reply("AI masih memproses pesanmu. Tunggu sebentar lalu kirim lagi.");
            return;
        }
        aiInFlight.add(userId);
        try {
            await ctx.replyWithChatAction("typing");
            const response = await fetch(buildNeoXrUrl(config.aiApiUrl, config.aiApiKey, prompt), {
                signal: AbortSignal.timeout(30_000)
            });
            if (!response.ok) {
                console.error(`NeoXR automatic AI request failed with HTTP ${response.status}`);
                await ctx.reply("Layanan AI sedang bermasalah. Coba lagi nanti.");
                return;
            }
            const payload = await response.json();
            const answer = extractNeoXrAnswer(payload);
            if (!answer) {
                console.error("NeoXR automatic AI returned an empty or unrecognized response.");
                await ctx.reply("AI tidak mengirim jawaban. Coba tulis ulang pesanmu.");
                return;
            }
            for (let offset = 0; offset < answer.length; offset += 4000)
                await ctx.reply(answer.slice(offset, offset + 4000));
        }
        catch (error) {
            console.error("NeoXR automatic AI request failed:", error instanceof Error ? error.name : "Unknown error");
            await ctx.reply("Tidak dapat menghubungi AI sekarang. Coba lagi nanti.");
        }
        finally {
            aiInFlight.delete(userId);
        }
    });
    bot.catch((error) => {
        console.error(`Telegram update failed (${error.ctx.update.update_id}):`, error.error);
    });
    return bot;
}
