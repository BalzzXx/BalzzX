import { Bot, GrammyError, InlineKeyboard, InputFile } from "grammy";
import { resolve } from "node:path";
import { calculate, formatJakartaTime, formatRuntime, randomInteger } from "./features.js";
import { buildNeoXrUrl, extractNeoXrAnswer } from "./neoxr.js";
import {
    buildNeoXrEndpointUrl,
    formatNeoXrPayload,
    parseNeoXrArguments,
    parseNeoXrCatalog,
    resolveNeoXrEndpoint
} from "./neoxr-catalog.js";
import { buildPinterestUrl, extractPinterestMedia } from "./pinterest.js";
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
            .text("🤖 AI", "menu:ai").text("📣 Updates", "menu:updates");
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
    if (page === "ai") {
        return keyboard
            .text("✨ Cara pakai AI", "action:ai-help").text("🧹 Reset konteks", "action:ai-reset").row()
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
            "🌐 NEOXR API",
            "/apis — daftar kategori dan endpoint",
            "/apis nama — cari API di katalog resmi",
            '/neoxr <endpoint> key="nilai" — jalankan API',
            '/neoxr cuaca subdistrict="batang"',
            '/neoxr gpt-pro q="halo"',
            "",
            "🧰 PERINTAH LAIN",
            "/ping — cek bot",
            "/time — waktu Jakarta",
            "/random 1 100 — angka acak",
            "/calc 12 * 3 — kalkulator",
            "/pinterest kucing (alias /pin) — cari gambar",
            "/pinvid kucing (alias /pv) — cari video",
            "/tourl — reply media untuk membuat tautan"
        ].join("\n");
    }
    if (page === "account")
        return "👤 AKUN\n\nInfo akun Telegram kamu.";
    if (page === "ai")
        return "🤖 AI ASSISTANT\n\nTanya AI dengan mengirim:\n/ai pertanyaan kamu\n\nAI tersedia jika layanan NeoXR dikonfigurasi admin.";
    if (page === "updates") {
        return `📣 PENGUMUMAN\n\nStatus: ${subscribed ? "✅ berlangganan" : "tidak berlangganan"}\n\nLangganan bersifat opsional dan bisa dihentikan kapan saja.`;
    }
    if (page === "admin")
        return "⚙️ ADMIN PANEL\n\nAkses admin terverifikasi untuk akun ini.";
    return "🧮 KALKULATOR\n\nKirim contoh perintah berikut, ganti angka dan operator sesuai kebutuhan:\n/calc 12 * 3";
}
export function createBot(config, pool) {
    const bot = new Bot(config.token);
    const startedAt = Date.now();
    const pendingBroadcasts = new Map();
    const aiHistory = new Map();
    let apiCatalog;
    let apiCatalogFetchedAt = 0;
    let apiCatalogRequest;
    const landscapePath = resolve(process.cwd(), "assets/balzzx-landscape.png");
    async function getNeoXrCatalog() {
        if (apiCatalog && Date.now() - apiCatalogFetchedAt < 60 * 60 * 1000)
            return apiCatalog;
        if (!apiCatalogRequest) {
            apiCatalogRequest = (async () => {
                const catalogUrl = new URL("/data/collections", new URL(config.aiApiUrl).origin);
                const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(20_000) });
                if (!response.ok)
                    throw new Error(`NeoXR catalog returned HTTP ${response.status}`);
                const catalog = parseNeoXrCatalog(await response.json());
                if (catalog.length === 0)
                    throw new Error("NeoXR catalog did not contain usable endpoints");
                apiCatalog = catalog;
                apiCatalogFetchedAt = Date.now();
                return catalog;
            })().finally(() => {
                apiCatalogRequest = undefined;
            });
        }
        return apiCatalogRequest;
    }
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
        const subscription = await pool.query("SELECT subscribed FROM telegram_users WHERE telegram_id = $1", [String(user.id)]);
        const subscribed = subscription.rows[0]?.subscribed === true;
        const status = await getBotStatus();
        await ctx.replyWithPhoto(new InputFile(landscapePath), {
            caption: menuCaption("home", user.first_name, subscribed, status),
            reply_markup: menuKeyboard("home", config.adminIds.has(String(user.id)), subscribed)
        });
    }
    async function saveUser(from) {
        const id = String(from.id);
        await pool.query(`INSERT INTO telegram_users (telegram_id, username, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_id) DO UPDATE SET
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         last_seen_at = NOW()`, [id, from.username ?? null, from.first_name, from.last_name ?? null]);
        const result = await pool.query("SELECT banned FROM telegram_users WHERE telegram_id = $1", [id]);
        return result.rows[0]?.banned === true;
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
        return next();
    });
    bot.command("start", async (ctx) => {
        await sendMainMenu(ctx);
    });
    bot.command("help", async (ctx) => {
        await sendMainMenu(ctx);
    });
    bot.callbackQuery(/^menu:(home|tools|account|ai|updates|admin|calc)$/, async (ctx) => {
        const user = getSender(ctx);
        const page = ctx.match[1];
        if (page === "admin" && !config.adminIds.has(String(user.id))) {
            await ctx.answerCallbackQuery({ text: "Menu khusus admin.", show_alert: true });
            return;
        }
        const subscription = await pool.query("SELECT subscribed FROM telegram_users WHERE telegram_id = $1", [String(user.id)]);
        const subscribed = subscription.rows[0]?.subscribed === true;
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
            return ctx.reply("Cari gambar dengan /pinterest cat atau /pin cat.\nCari video dengan /pinvid cat atau /pv cat.");
        }
        if (action === "pinvid") {
            return ctx.reply("Cari video dengan format:\n/pinvid cat\nAlias: /pv cat");
        }
        if (action === "tourl") {
            return ctx.reply("Balas (reply) foto, video, audio, atau dokumen dengan /tourl untuk membuat tautan Kappa.");
        }
        if (action === "ai-help")
            return ctx.reply("Kirim pertanyaan dengan format:\n/ai tuliskan pertanyaanmu");
        if (action === "ai-reset") {
            aiHistory.delete(String(user.id));
            return ctx.reply("Konteks percakapan AI sudah dihapus.");
        }
        if (action === "subscribe" || action === "unsubscribe") {
            const subscribed = action === "subscribe";
            await pool.query("UPDATE telegram_users SET subscribed = $1 WHERE telegram_id = $2", [subscribed, String(user.id)]);
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
                const result = await pool.query("SELECT COUNT(*)::int AS count FROM telegram_users WHERE subscribed AND NOT banned");
                return ctx.reply(`📨 Penerima broadcast aktif: ${result.rows[0].count}`);
            }
            const result = await pool.query(`SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE subscribed AND NOT banned)::int AS subscribers,
                COUNT(*) FILTER (WHERE banned)::int AS banned
         FROM telegram_users`);
            const stats = result.rows[0];
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
    bot.command("apis", async (ctx) => {
        const query = ctx.match.trim().toLowerCase();
        try {
            const catalog = await getNeoXrCatalog();
            if (!query) {
                const categories = new Map();
                for (const endpoint of catalog)
                    categories.set(endpoint.category, (categories.get(endpoint.category) ?? 0) + 1);
                const list = [...categories.entries()]
                    .sort(([first], [second]) => first.localeCompare(second))
                    .map(([category, count]) => `• ${category} (${count})`);
                await ctx.reply(`📚 Katalog NeoXR (${catalog.length} endpoint aktif)\n\n${list.join("\n")}\n\nCari: /apis <nama atau kategori>`);
                return;
            }
            const results = catalog.filter((endpoint) => endpoint.name.toLowerCase().includes(query) ||
                endpoint.category.toLowerCase().includes(query) ||
                endpoint.id.includes(query) ||
                endpoint.path.toLowerCase().includes(query)).slice(0, 18);
            if (results.length === 0) {
                await ctx.reply("Tidak ada endpoint yang cocok. Gunakan /apis untuk melihat kategori.");
                return;
            }
            const lines = results.map((endpoint) => {
                const usage = endpoint.required.length === 1
                    ? `<${endpoint.required[0]}>`
                    : endpoint.required.map((key) => `${key}=<nilai>`).join(" ");
                const plan = endpoint.premium ? " · Premium" : "";
                return `• ${endpoint.name} [${endpoint.category}${plan}]\n  /neoxr ${endpoint.id}${usage ? ` ${usage}` : ""}`;
            });
            await ctx.reply(`🔎 Hasil katalog NeoXR (${results.length} ditampilkan)\n\n${lines.join("\n")}`);
        }
        catch (error) {
            console.error("NeoXR catalog request failed:", error instanceof Error ? error.message : "Unknown error");
            await ctx.reply("Tidak dapat memuat katalog NeoXR sekarang. Coba lagi nanti.");
        }
    });
    bot.command("neoxr", async (ctx) => {
        const input = ctx.match.trim();
        const separator = input.search(/\s/);
        const id = separator === -1 ? input : input.slice(0, separator);
        const rawArguments = separator === -1 ? "" : input.slice(separator + 1);
        if (!id) {
            await ctx.reply("Format: /neoxr <endpoint> key=value\nCari endpoint dengan /apis atau /apis <nama>.");
            return;
        }
        if (!config.aiApiKey) {
            await ctx.reply("NEOXR_API_KEY belum dikonfigurasi di .env.");
            return;
        }
        try {
            const catalog = await getNeoXrCatalog();
            const endpoint = resolveNeoXrEndpoint(catalog, id);
            if (!endpoint) {
                await ctx.reply(`Endpoint "${id}" tidak ditemukan atau tidak aktif. Cari dengan /apis ${id}.`);
                return;
            }
            let parameters;
            try {
                parameters = parseNeoXrArguments(endpoint, rawArguments);
            }
            catch (error) {
                await ctx.reply(`${error instanceof Error ? error.message : "Parameter tidak valid"}\n\nContoh: /neoxr ${endpoint.id} ${endpoint.required.map((key) => `${key}=<nilai>`).join(" ") || "(tanpa parameter)"}`);
                return;
            }
            await ctx.replyWithChatAction("typing");
            const url = buildNeoXrEndpointUrl(config.aiApiUrl, config.aiApiKey, endpoint, parameters);
            const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
            if (!response.ok) {
                console.error(`NeoXR endpoint ${endpoint.path} returned HTTP ${response.status}`);
                await ctx.reply(`NeoXR mengembalikan HTTP ${response.status}. Periksa parameter, status endpoint, dan kuota API.`);
                return;
            }
            const contentLength = Number(response.headers.get("content-length"));
            if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
                await ctx.reply("Respons NeoXR terlalu besar untuk ditampilkan.");
                return;
            }
            const text = await response.text();
            if (text.length > 1_000_000) {
                await ctx.reply("Respons NeoXR terlalu besar untuk ditampilkan.");
                return;
            }
            let payload;
            try {
                payload = JSON.parse(text);
            }
            catch {
                payload = text;
            }
            const fullOutput = formatNeoXrPayload(payload);
            const output = fullOutput.length > 11_400
                ? `${fullOutput.slice(0, 11_400)}\n\n[Respons dipotong agar tidak terlalu panjang.]`
                : fullOutput;
            for (let offset = 0; offset < output.length; offset += 3800)
                await ctx.reply(output.slice(offset, offset + 3800));
        }
        catch (error) {
            console.error("NeoXR documented endpoint request failed:", error instanceof Error ? error.name : "Unknown error");
            await ctx.reply("Tidak dapat menjalankan endpoint NeoXR sekarang. Coba lagi nanti.");
        }
    });
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
                await ctx.api.sendMediaGroup(chatId, media.map((item, index) => ({
                    type: "video",
                    media: item.url,
                    ...(caption(item, index) ? { caption: caption(item, index) } : {})
                })));
            }
        }
        catch (error) {
            console.error(`Pinterest ${type} search failed:`, error);
            await ctx.reply(`Tidak dapat mengambil ${type === "image" ? "gambar" : "video"} sekarang. Coba lagi nanti.`);
        }
    }
    bot.command(["pinterest", "pin"], (ctx) => searchPinterest(ctx, ctx.match, "image"));
    bot.command(["pinvid", "pv"], (ctx) => searchPinterest(ctx, ctx.match, "video"));
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
        await pool.query("UPDATE telegram_users SET subscribed = TRUE WHERE telegram_id = $1", [String(user.id)]);
        await ctx.reply("✅ Kamu berlangganan pengumuman admin. Kirim /unsubscribe kapan saja untuk berhenti.");
    });
    bot.command("unsubscribe", async (ctx) => {
        const user = getSender(ctx);
        await pool.query("UPDATE telegram_users SET subscribed = FALSE WHERE telegram_id = $1", [String(user.id)]);
        await ctx.reply("Kamu berhenti berlangganan pengumuman. Gunakan /subscribe untuk bergabung lagi.");
    });
    bot.command("ai", async (ctx) => {
        const prompt = ctx.match.trim();
        if (!prompt) {
            await ctx.reply("Format: /ai tuliskan pertanyaanmu");
            return;
        }
        if (!config.aiApiKey) {
            await ctx.reply("Fitur AI belum diaktifkan oleh admin.");
            return;
        }
        if (prompt.length > 3000) {
            await ctx.reply("Pesan terlalu panjang (maksimal 3.000 karakter).");
            return;
        }
        const userId = String(getSender(ctx).id);
        const history = aiHistory.get(userId) ?? [];
        const userMessage = { role: "user", content: prompt };
        const messages = [
            ...history,
            userMessage
        ].slice(-10);
        const query = messages.map((message) => `${message.role}: ${message.content}`).join("\n");
        await ctx.replyWithChatAction("typing");
        try {
            const response = await fetch(buildNeoXrUrl(config.aiApiUrl, config.aiApiKey, query), { signal: AbortSignal.timeout(30_000) });
            if (!response.ok) {
                console.error(`NeoXR request failed with HTTP ${response.status}`);
                await ctx.reply("Layanan AI sedang bermasalah. Coba lagi nanti.");
                return;
            }
            const payload = await response.json();
            const answer = extractNeoXrAnswer(payload);
            if (!answer) {
                console.error("NeoXR returned an unrecognized response.");
                await ctx.reply("Layanan AI mengirim respons kosong.");
                return;
            }
            const updatedHistory = [
                ...messages,
                { role: "assistant", content: answer }
            ];
            aiHistory.set(userId, updatedHistory.slice(-10));
            for (let offset = 0; offset < answer.length; offset += 4000) {
                await ctx.reply(answer.slice(offset, offset + 4000));
            }
        }
        catch (error) {
            console.error("AI request failed:", error);
            await ctx.reply("Tidak dapat menghubungi layanan AI saat ini.");
        }
    });
    bot.command("resetai", async (ctx) => {
        aiHistory.delete(String(getSender(ctx).id));
        await ctx.reply("Konteks percakapan AI sudah dihapus.");
    });
    const isAdmin = (id) => config.adminIds.has(String(id));
    bot.command("stats", async (ctx) => {
        if (!isAdmin(getSender(ctx).id))
            return ctx.reply("Perintah khusus admin.");
        const result = await pool.query(`SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE subscribed AND NOT banned)::int AS subscribers,
              COUNT(*) FILTER (WHERE banned)::int AS banned
       FROM telegram_users`);
        const stats = result.rows[0];
        await ctx.reply(`📊 Statistik\nPengguna terdaftar: ${stats.total}\nSubscriber broadcast: ${stats.subscribers}\nDiblokir: ${stats.banned}`);
    });
    bot.command("users", async (ctx) => {
        if (!isAdmin(getSender(ctx).id))
            return ctx.reply("Perintah khusus admin.");
        const result = await pool.query("SELECT COUNT(*)::int AS count FROM telegram_users WHERE subscribed AND NOT banned");
        await ctx.reply(`📨 Penerima broadcast aktif: ${result.rows[0].count}`);
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
        const subscribers = await pool.query("SELECT telegram_id FROM telegram_users WHERE subscribed AND NOT banned");
        let sent = 0;
        let failed = 0;
        for (const row of subscribers.rows) {
            try {
                await bot.api.sendMessage(row.telegram_id, text);
                sent += 1;
            }
            catch (error) {
                failed += 1;
                if (error instanceof GrammyError && error.error_code === 403) {
                    await pool.query("UPDATE telegram_users SET subscribed = FALSE WHERE telegram_id = $1", [row.telegram_id]);
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
        const result = await pool.query("UPDATE telegram_users SET banned = TRUE WHERE telegram_id = $1", [target]);
        await ctx.reply(result.rowCount ? `Pengguna ${target} diblokir.` : "Pengguna tidak ditemukan.");
    });
    bot.command("unban", async (ctx) => {
        if (!isAdmin(getSender(ctx).id))
            return ctx.reply("Perintah khusus admin.");
        const target = ctx.match.trim();
        if (!/^\d+$/.test(target))
            return ctx.reply("Format: /unban ID");
        const result = await pool.query("UPDATE telegram_users SET banned = FALSE WHERE telegram_id = $1", [target]);
        await ctx.reply(result.rowCount ? `Akses pengguna ${target} dipulihkan.` : "Pengguna tidak ditemukan.");
    });
    bot.catch((error) => {
        console.error(`Telegram update failed (${error.ctx.update.update_id}):`, error.error);
    });
    return bot;
}
