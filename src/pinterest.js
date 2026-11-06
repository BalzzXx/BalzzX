const imageKeys = new Set([
    "image", "imageurl", "image_url", "images", "img", "thumbnail", "thumb",
    "src", "original", "media", "photo", "photourl", "photo_url"
]);
const videoKeys = new Set([
    "video", "videourl", "video_url", "videos", "video_src", "videosrc",
    "video_media", "videomedia", "mp4", "playable_url"
]);
const imageContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const videoContentTypes = new Set(["video/mp4", "video/webm", "video/quicktime", "application/octet-stream"]);
const MAX_PINTEREST_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_PINTEREST_VIDEO_SIZE = 50 * 1024 * 1024;

export async function downloadPinterestVideo(value, fetchImpl = fetch) {
    const media = await downloadPinterestMedia(value, "video", fetchImpl);
    return media.bytes;
}

function isPinterestHost(url) {
    return url.hostname === "pinimg.com" || url.hostname.endsWith(".pinimg.com");
}

async function downloadPinterestMedia(value, type, fetchImpl) {
    let url = new URL(value);
    const maxSize = type === "image" ? MAX_PINTEREST_IMAGE_SIZE : MAX_PINTEREST_VIDEO_SIZE;
    for (let redirects = 0; redirects <= 5; redirects++) {
        if (url.protocol !== "https:" || !isPinterestHost(url))
            throw new Error(`Pinterest ${type} URL must use an HTTPS pinimg.com host`);
        const response = await fetchImpl(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(30_000)
        });
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (!location)
                throw new Error(`Pinterest ${type} redirect is missing its location`);
            url = new URL(location, url);
            continue;
        }
        if (!response.ok)
            throw new Error(`Pinterest ${type} download failed with HTTP ${response.status}`);
        const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
        const acceptedTypes = type === "image" ? imageContentTypes : videoContentTypes;
        if (!acceptedTypes.has(contentType))
            throw new Error(`Unsupported Pinterest ${type} type: ${contentType || "unknown"}`);
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > maxSize)
            throw new Error(`Pinterest ${type} exceeds the ${maxSize / (1024 * 1024)} MB size limit`);
        if (!response.body)
            throw new Error(`Pinterest ${type} response has no body`);

        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
            while (true) {
                const { done, value: chunk } = await reader.read();
                if (done)
                    break;
                size += chunk.byteLength;
                if (size > maxSize) {
                    await reader.cancel();
                    throw new Error(`Pinterest ${type} exceeds the ${maxSize / (1024 * 1024)} MB size limit`);
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
        return { bytes, contentType };
    }
    throw new Error(`Pinterest ${type} redirected too many times`);
}

export async function downloadPinterestImage(value, fetchImpl = fetch) {
    const media = await downloadPinterestMedia(value, "image", fetchImpl);
    return {
        ...media,
        extension: media.contentType === "image/jpeg" ? "jpg" : media.contentType.slice(6)
    };
}

function isMediaUrl(value, key, type) {
    if (typeof value !== "string")
        return false;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:")
            return false;
        const normalizedKey = key.toLowerCase();
        if (type === "video") {
            return videoKeys.has(normalizedKey) || /\.(?:mp4|mov|m4v|webm)(?:$|[?#])/i.test(value);
        }
        return imageKeys.has(normalizedKey) ||
            /(?:^|\.)pinimg\.com$/i.test(url.hostname) ||
            /\.(?:jpe?g|png|webp|gif)(?:$|[?#])/i.test(value);
    }
    catch {
        return false;
    }
}
export function extractPinterestMedia(payload, type, limit = 10) {
    if (!Number.isInteger(limit) || limit < 1)
        return [];
    const found = [];
    const seen = new Set();
    const records = typeof payload === "object" && payload !== null &&
        Array.isArray(payload.data) ? payload.data : undefined;
    if (records) {
        let hasStructuredRecords = false;
        for (const record of records.slice(0, 30)) {
            if (record === null || typeof record !== "object" || Array.isArray(record))
                continue;
            if (Array.isArray(record.content))
                hasStructuredRecords = true;
            if (typeof record.is_video === "boolean" && record.is_video !== (type === "video"))
                continue;
            if (!Array.isArray(record.content))
                continue;
            const titleValue = record.title ?? record.name ?? record.description;
            const title = typeof titleValue === "string" ? titleValue.trim().slice(0, 180) : undefined;
            for (const content of record.content) {
                if (content === null || typeof content !== "object" || Array.isArray(content))
                    continue;
                for (const [key, candidate] of Object.entries(content)) {
                    if (isMediaUrl(candidate, key, type) && !seen.has(candidate)) {
                        seen.add(candidate);
                        found.push({ url: candidate, ...(title ? { title } : {}) });
                        if (found.length >= limit)
                            return found;
                    }
                }
            }
        }
        if (hasStructuredRecords)
            return found;
    }
    function visit(value, depth) {
        if (depth > 6 || found.length >= limit || value === null || typeof value !== "object")
            return;
        if (Array.isArray(value)) {
            for (const entry of value.slice(0, 30))
                visit(entry, depth + 1);
            return;
        }
        const record = value;
        const titleValue = record.title ?? record.name ?? record.description;
        const title = typeof titleValue === "string" ? titleValue.trim().slice(0, 180) : undefined;
        for (const [key, candidate] of Object.entries(record)) {
            if (isMediaUrl(candidate, key, type) && !seen.has(candidate)) {
                seen.add(candidate);
                found.push({ url: candidate, ...(title ? { title } : {}) });
                if (found.length >= limit)
                    return;
            }
        }
        for (const candidate of Object.values(record)) {
            visit(candidate, depth + 1);
            if (found.length >= limit)
                return;
        }
    }
    visit(payload, 0);
    return found;
}
export function extractPinterestImages(payload, limit = 10) {
    return extractPinterestMedia(payload, "image", limit);
}
export function buildPinterestUrl(apiUrl, apiKey, query, show = 10, type = "image") {
    const url = new URL(apiUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("show", String(show));
    url.searchParams.set("type", type);
    url.searchParams.set("apikey", apiKey);
    return url;
}
