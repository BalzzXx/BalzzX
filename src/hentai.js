const MAX_HENTAI_IMAGE_SIZE = 10 * 1024 * 1024;
const extensionsByMime = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
]);

export function buildHentaiUrl(apiUrl, apiKey) {
    const url = new URL(apiUrl);
    url.searchParams.set("apikey", apiKey);
    return url;
}

export async function fetchHentaiImage(apiUrl, apiKey, fetchImpl = fetch) {
    const response = await fetchImpl(buildHentaiUrl(apiUrl, apiKey), {
        signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok)
        throw new Error(`Hentai API request failed with HTTP ${response.status}`);
    const mimeType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
    const extension = extensionsByMime.get(mimeType);
    if (!extension)
        throw new Error(`Unsupported hentai API response type: ${mimeType || "unknown"}`);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_HENTAI_IMAGE_SIZE)
        throw new Error("Hentai image exceeds Telegram's 10 MB photo limit");
    if (!response.body)
        throw new Error("Hentai API response has no image body");

    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { done, value: chunk } = await reader.read();
            if (done)
                break;
            size += chunk.byteLength;
            if (size > MAX_HENTAI_IMAGE_SIZE) {
                await reader.cancel();
                throw new Error("Hentai image exceeds Telegram's 10 MB photo limit");
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
    if (bytes.byteLength === 0)
        throw new Error("Hentai API returned an empty image");
    return { bytes, extension };
}
