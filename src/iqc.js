const MAX_IQC_IMAGE_SIZE = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function isNeoXrImageHost(url) {
    return url.hostname === "pages.dev" || url.hostname.endsWith(".pages.dev");
}

export function buildIqcUrl(apiUrl, apiKey, text, time, chatTime) {
    const url = new URL(apiUrl);
    url.searchParams.set("text", text);
    url.searchParams.set("time", time);
    url.searchParams.set("chat_time", chatTime);
    url.searchParams.set("apikey", apiKey);
    return url;
}

export function extractIqcImage(payload) {
    if (typeof payload !== "object" || payload === null || payload.status === false)
        return undefined;
    const value = payload.data;
    if (typeof value !== "object" || value === null || typeof value.url !== "string" ||
        typeof value.mime !== "string" || !allowedImageTypes.has(value.mime.toLowerCase()))
        return undefined;
    try {
        const url = new URL(value.url);
        return url.protocol === "https:" && isNeoXrImageHost(url)
            ? { url, mime: value.mime.toLowerCase() }
            : undefined;
    }
    catch {
        return undefined;
    }
}

export async function downloadIqcImage(value, expectedMime, fetchImpl = fetch) {
    let url = new URL(value);
    for (let redirects = 0; redirects <= 3; redirects++) {
        if (url.protocol !== "https:" || !isNeoXrImageHost(url))
            throw new Error("IQC image URL must use a trusted HTTPS NeoXR image host");
        const response = await fetchImpl(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(30_000)
        });
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (!location)
                throw new Error("IQC image redirect is missing its location");
            url = new URL(location, url);
            continue;
        }
        if (!response.ok)
            throw new Error(`IQC image download failed with HTTP ${response.status}`);
        const responseType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
        const contentType = responseType === "application/octet-stream" ? expectedMime : responseType;
        if (!contentType || !allowedImageTypes.has(contentType) || (expectedMime && expectedMime !== contentType))
            throw new Error(`Unsupported IQC image type: ${responseType || "unknown"}`);
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_IQC_IMAGE_SIZE)
            throw new Error("IQC image exceeds the 10 MB limit");
        if (!response.body)
            throw new Error("IQC image response has no body");

        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
            while (true) {
                const { done, value: chunk } = await reader.read();
                if (done)
                    break;
                size += chunk.byteLength;
                if (size > MAX_IQC_IMAGE_SIZE) {
                    await reader.cancel();
                    throw new Error("IQC image exceeds the 10 MB limit");
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
        return { bytes, extension: contentType === "image/jpeg" ? "jpg" : contentType.slice(6) };
    }
    throw new Error("IQC image redirected too many times");
}
