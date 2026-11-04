import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFile = promisify(execFileCallback);
const MAX_SOURCE_SIZE = 20 * 1024 * 1024;
const MAX_OUTPUT_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_OUTPUT_VIDEO_SIZE = 45 * 1024 * 1024;
const imageTypes = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
]);

function isNeoXrFileHost(url) {
    return url.hostname === "pages.dev" || url.hostname.endsWith(".pages.dev");
}

export function buildImageUpscaleUrl(apiUrl, apiKey, imageUrl) {
    const url = new URL(apiUrl);
    url.searchParams.set("image", imageUrl);
    url.searchParams.set("apikey", apiKey);
    return url;
}

export function extractUpscaledImageUrl(payload) {
    if (typeof payload !== "object" || payload === null || payload.status === false)
        return undefined;
    const value = payload.data;
    if (typeof value !== "object" || value === null || typeof value.url !== "string")
        return undefined;
    try {
        const url = new URL(value.url);
        return url.protocol === "https:" && isNeoXrFileHost(url) ? url : undefined;
    }
    catch {
        return undefined;
    }
}

export async function downloadUpscaledImage(value, fetchImpl = fetch) {
    let url = new URL(value);
    for (let redirects = 0; redirects <= 3; redirects++) {
        if (url.protocol !== "https:" || !isNeoXrFileHost(url))
            throw new Error("Upscaled image URL must use a trusted HTTPS NeoXR file host");
        const response = await fetchImpl(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(30_000)
        });
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (!location)
                throw new Error("Upscaled image redirect is missing its location");
            url = new URL(location, url);
            continue;
        }
        if (!response.ok)
            throw new Error(`Upscaled image download failed with HTTP ${response.status}`);
        const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
        const extension = imageTypes.get(contentType);
        if (!extension)
            throw new Error(`Unsupported upscaled image type: ${contentType || "unknown"}`);
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_OUTPUT_IMAGE_SIZE)
            throw new Error("Upscaled image exceeds the 20 MB limit");
        if (!response.body)
            throw new Error("Upscaled image response has no body");

        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
            while (true) {
                const { done, value: chunk } = await reader.read();
                if (done)
                    break;
                size += chunk.byteLength;
                if (size > MAX_OUTPUT_IMAGE_SIZE) {
                    await reader.cancel();
                    throw new Error("Upscaled image exceeds the 20 MB limit");
                }
                chunks.push(chunk);
            }
        }
        finally {
            reader.releaseLock();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return { bytes, extension };
    }
    throw new Error("Upscaled image redirected too many times");
}

export function buildVideoToHdArgs(inputPath, outputPath) {
    return [
        "-nostdin",
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", inputPath,
        "-map", "0:v:0",
        "-map", "0:a?",
        "-vf", "scale=w='if(gte(iw,ih),max(iw,1920),max(iw,1080))':h='if(gte(iw,ih),max(ih,1080),max(ih,1920))':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-fs", String(MAX_OUTPUT_VIDEO_SIZE),
        outputPath
    ];
}

export async function convertVideoToHd(bytes) {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_SIZE)
        throw new Error("Video is empty or exceeds the 20 MB input limit");
    if (!ffmpegPath)
        throw new Error("The bundled FFmpeg binary is unavailable");
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "balzzx-hd-"));
    const inputPath = join(temporaryDirectory, "source.video");
    const outputPath = join(temporaryDirectory, "video-hd.mp4");
    try {
        await writeFile(inputPath, bytes, { mode: 0o600 });
        await execFile(ffmpegPath, buildVideoToHdArgs(inputPath, outputPath), {
            timeout: 120_000,
            maxBuffer: 2 * 1024 * 1024
        });
        const outputStats = await stat(outputPath);
        if (outputStats.size === 0 || outputStats.size >= MAX_OUTPUT_VIDEO_SIZE)
            throw new Error("HD video is empty or exceeds the 45 MB output limit");
        return new Uint8Array(await readFile(outputPath));
    }
    finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
}
