import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFile = promisify(execFileCallback);
const MAX_SOURCE_SIZE = 25 * 1024 * 1024;
const MAX_GIF_SIZE = 45 * 1024 * 1024;
const imageExtensions = new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/gif", ".gif"],
    ["image/webp", ".webp"]
]);
const imageMimeByExtension = new Map([
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".png", "image/png"],
    [".gif", "image/gif"],
    [".webp", "image/webp"]
]);

export function classifyMenuMedia(contentType, url) {
    const mimeType = contentType.split(";", 1)[0].trim().toLowerCase();
    const extension = extname(new URL(url).pathname).toLowerCase();
    const imageMimeType = imageExtensions.has(mimeType) ? mimeType : imageMimeByExtension.get(extension);
    if (imageMimeType) {
        return { type: imageMimeType === "image/gif" ? "animation" : "photo", extension: imageExtensions.get(imageMimeType) };
    }
    if (mimeType.startsWith("video/") || [".mp4", ".mov", ".m4v", ".webm", ".mpeg", ".mpg"].includes(extension))
        return { type: "video", extension: ".video" };
    throw new Error(`Unsupported menu media type: ${mimeType || extension || "unknown"}`);
}

export function buildVideoToGifArgs(inputPath, outputPath) {
    return [
        "-nostdin",
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", inputPath,
        "-t", "6",
        "-vf", "fps=15,scale=1000:-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a",
        "-an",
        "-loop", "0",
        outputPath
    ];
}

export async function prepareMenuMedia(mediaUrl, cacheDirectory = "./data") {
    const url = new URL(mediaUrl);
    if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Menu media URL must be a public HTTPS URL");
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok)
        throw new Error(`Menu media request returned HTTP ${response.status}`);
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== "https:")
        throw new Error("Menu media redirect must use HTTPS");
    const media = classifyMenuMedia(response.headers.get("content-type") ?? "", finalUrl.toString());
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_SOURCE_SIZE)
        throw new Error("Menu media file exceeds the 25 MB size limit");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_SIZE)
        throw new Error("Menu media response is empty or exceeds the 25 MB size limit");

    const outputDirectory = resolve(process.cwd(), cacheDirectory);
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    if (media.type !== "video") {
        const path = join(outputDirectory, `menu-media${media.extension}`);
        await writeFile(path, bytes, { mode: 0o600 });
        return { type: media.type, path };
    }

    if (!ffmpegPath)
        throw new Error("The bundled FFmpeg binary is unavailable for video menu conversion");
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "balzzx-menu-"));
    const inputPath = join(temporaryDirectory, "menu-source.video");
    const outputPath = join(outputDirectory, "menu-media.gif");
    try {
        await writeFile(inputPath, bytes, { mode: 0o600 });
        await execFile(ffmpegPath, buildVideoToGifArgs(inputPath, outputPath), {
            timeout: 60_000,
            maxBuffer: 2 * 1024 * 1024
        });
        const outputStats = await stat(outputPath);
        if (outputStats.size === 0 || outputStats.size > MAX_GIF_SIZE) {
            throw new Error("Converted menu GIF is empty or exceeds the 45 MB Telegram limit");
        }
        return { type: "animation", path: outputPath };
    }
    finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
}
