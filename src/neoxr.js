export function extractNeoXrAnswer(payload) {
    if (typeof payload === "string") {
        const text = payload.trim();
        return text || undefined;
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return undefined;
    }
    const record = payload;
    if (record.status === false || record.success === false)
        return undefined;
    for (const key of ["result", "answer", "response", "message", "text", "data"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim())
            return value.trim();
        if (typeof value === "object" && value !== null) {
            const nested = extractNeoXrAnswer(value);
            if (nested)
                return nested;
        }
    }
    return undefined;
}
export function buildNeoXrUrl(apiUrl, apiKey, query) {
    const url = new URL(apiUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("apikey", apiKey);
    return url;
}
