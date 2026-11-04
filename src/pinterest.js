const imageKeys = new Set([
    "image", "imageurl", "image_url", "images", "img", "thumbnail", "thumb",
    "src", "original", "media", "photo", "photourl", "photo_url"
]);
const videoKeys = new Set([
    "video", "videourl", "video_url", "videos", "video_src", "videosrc",
    "video_media", "videomedia", "mp4", "playable_url"
]);
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
