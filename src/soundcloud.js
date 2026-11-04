const SOUNDCLOUD_SEARCH_URL = "https://api.siputzx.my.id/api/s/soundcloud";

function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeTrackUrl(value) {
    if (typeof value !== "string")
        return undefined;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.hostname !== "soundcloud.com" ||
            url.pathname.split("/").filter(Boolean).length < 2)
            return undefined;
        return url.toString();
    }
    catch {
        return undefined;
    }
}
export function buildSoundCloudSearchUrl(query) {
    const url = new URL(SOUNDCLOUD_SEARCH_URL);
    url.searchParams.set("query", query);
    return url;
}
export function extractSoundCloudTracks(payload, limit = 5) {
    if (!Number.isInteger(limit) || limit < 1 || !isRecord(payload) || payload.status === false)
        return [];
    const results = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.result)
            ? payload.result
            : [];
    const seen = new Set();
    const tracks = [];
    for (const result of results) {
        if (!isRecord(result))
            continue;
        const url = normalizeTrackUrl(result.permalink_url);
        if (!url || seen.has(url))
            continue;
        const titleValue = result.title ?? result.permalink;
        if (typeof titleValue !== "string" || !titleValue.trim())
            continue;
        seen.add(url);
        tracks.push({
            title: titleValue.trim().slice(0, 180),
            url,
            ...(typeof result.genre === "string" && result.genre.trim() ? { genre: result.genre.trim().slice(0, 80) } : {}),
            ...(typeof result.duration === "number" && Number.isFinite(result.duration) && result.duration >= 0
                ? { duration: result.duration }
                : {}),
            ...(typeof result.playback_count === "number" && Number.isFinite(result.playback_count) && result.playback_count >= 0
                ? { plays: result.playback_count }
                : {})
        });
        if (tracks.length >= limit)
            break;
    }
    return tracks;
}
export function formatSoundCloudTrack(track) {
    const details = [];
    if (track.genre)
        details.push(track.genre);
    if (track.duration !== undefined) {
        const totalSeconds = Math.floor(track.duration / 1000);
        details.push(`${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`);
    }
    if (track.plays !== undefined)
        details.push(`${track.plays.toLocaleString("id-ID")} pemutaran`);
    return [`🎵 ${track.title}`, ...(details.length ? [details.join(" · ")] : []), track.url].join("\n");
}
