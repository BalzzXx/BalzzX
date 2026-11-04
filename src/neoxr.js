function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function buildNeoXrUrl(apiUrl, apiKey, query) {
    const url = new URL(apiUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("apikey", apiKey);
    return url;
}
export function extractNeoXrAnswer(payload) {
    if (typeof payload === "string")
        return payload.trim() || undefined;
    if (!isRecord(payload) || payload.status === false || payload.success === false)
        return undefined;
    for (const key of ["result", "answer", "response", "message", "text", "data"]) {
        const value = payload[key];
        if (typeof value === "string" && value.trim())
            return value.trim();
        if (isRecord(value)) {
            const nested = extractNeoXrAnswer(value);
            if (nested)
                return nested;
        }
    }
    return undefined;
}
