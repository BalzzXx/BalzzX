const allowedHosts = new Set(["kappa.lol", "segs.lol"]);
export function extractKappaLink(payload) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return undefined;
    }
    const record = payload;
    for (const key of ["link", "url"]) {
        const value = record[key];
        if (typeof value !== "string")
            continue;
        try {
            const url = new URL(value);
            if (url.protocol === "https:" && allowedHosts.has(url.hostname.toLowerCase())) {
                return url.toString();
            }
        }
        catch {
            continue;
        }
    }
    return undefined;
}
export function safeFileName(name) {
    const basename = name.split(/[\\/]/).at(-1) ?? "";
    const cleaned = basename
        .normalize("NFKC")
        .replace(/[^\w.-]+/g, "_")
        .replace(/^\.+/, "")
        .slice(0, 120);
    return cleaned || "upload";
}
export const MAX_TELEGRAM_FILE_SIZE = 20 * 1024 * 1024;
export const KAPPA_UPLOAD_URL = "https://kappa.lol/api/upload";
