function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getRouterList(payload) {
    if (Array.isArray(payload))
        return payload;
    if (!isRecord(payload))
        return [];
    if (Array.isArray(payload.routers))
        return payload.routers;
    if (isRecord(payload.data))
        return Array.isArray(payload.data.routers) ? payload.data.routers : [];
    if (Array.isArray(payload.data))
        return payload.data;
    return [];
}
function slugify(value) {
    return value.toLowerCase().replace(/^\/api\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function parseNeoXrCatalog(payload) {
    const ids = new Map();
    return getRouterList(payload).flatMap((item) => {
        if (!isRecord(item) || item.error === true || typeof item.name !== "string" ||
            typeof item.category !== "string" || !isRecord(item.raw) ||
            typeof item.raw.path !== "string" || !/^\/api\/[a-zA-Z0-9_-]+$/.test(item.raw.path) ||
            !isRecord(item.raw.example)) {
            return [];
        }
        const name = item.name.trim();
        const category = item.category.trim();
        if (!name || !category)
            return [];
        const baseId = slugify(name) || slugify(item.raw.path);
        const duplicateCount = ids.get(baseId) ?? 0;
        ids.set(baseId, duplicateCount + 1);
        const id = duplicateCount ? `${baseId}-${duplicateCount + 1}` : baseId;
        const parameters = Object.keys(item.raw.example).filter((key) => key !== "apikey");
        const required = Array.isArray(item.parameter)
            ? item.parameter.filter((key) => typeof key === "string" && parameters.includes(key))
            : parameters;
        return [{
                id,
                name,
                category,
                path: item.raw.path,
                premium: item.premium === true,
                parameters,
                required,
                example: item.raw.example
            }];
    });
}
export function resolveNeoXrEndpoint(catalog, idOrPath) {
    const normalized = idOrPath.trim().toLowerCase();
    if (!normalized)
        return undefined;
    const path = normalized.startsWith("/api/") ? normalized : `/api/${normalized}`;
    return catalog.find((endpoint) => endpoint.id === normalized ||
        endpoint.path.toLowerCase() === path ||
        endpoint.name.toLowerCase() === normalized);
}
export function buildNeoXrEndpointUrl(baseUrl, apiKey, endpoint, parameters) {
    const url = new URL(endpoint.path, new URL(baseUrl).origin);
    for (const [key, value] of Object.entries(parameters))
        url.searchParams.set(key, value);
    if (apiKey)
        url.searchParams.set("apikey", apiKey);
    return url;
}
export function parseNeoXrArguments(endpoint, rawArguments) {
    const input = rawArguments.trim();
    const params = {};
    if (input && endpoint.required.length === 1 && !/\s[a-zA-Z][\w-]*=/.test(input) && !/^[\w-]+=/.test(input)) {
        params[endpoint.required[0]] = input;
    }
    else if (input) {
        const tokens = input.match(/[^\s"]+="[^"]*"|[^\s]+/g) ?? [];
        for (const token of tokens) {
            const separator = token.indexOf("=");
            if (separator <= 0)
                throw new Error("Gunakan format parameter key=value; bungkus nilai yang memiliki spasi dengan tanda kutip.");
            const key = token.slice(0, separator);
            let value = token.slice(separator + 1);
            if (value.startsWith('"') && value.endsWith('"'))
                value = value.slice(1, -1);
            if (!endpoint.parameters.includes(key))
                throw new Error(`Parameter "${key}" tidak tersedia untuk endpoint ini. Parameter: ${endpoint.parameters.join(", ") || "tidak ada"}.`);
            if (!value)
                throw new Error(`Nilai untuk parameter "${key}" tidak boleh kosong.`);
            params[key] = value;
        }
    }
    const missing = endpoint.required.filter((key) => !params[key]);
    if (missing.length)
        throw new Error(`Parameter wajib belum diisi: ${missing.join(", ")}.`);
    return params;
}
export function formatNeoXrPayload(payload) {
    const redact = (value) => {
        if (Array.isArray(value))
            return value.map(redact);
        if (!isRecord(value))
            return value;
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [
            key,
            /^(api[_-]?key|access[_-]?token|secret)$/i.test(key) ? "[disembunyikan]" : redact(item)
        ]));
    };
    if (typeof payload === "string")
        return payload.trim() || "(Respons kosong)";
    return JSON.stringify(redact(payload), null, 2) ?? "(Respons kosong)";
}
