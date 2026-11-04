import assert from "node:assert/strict";
import test from "node:test";
import {
    buildSoundCloudSearchUrl,
    extractSoundCloudTracks,
    formatSoundCloudTrack
} from "../src/soundcloud.js";

test("SoundCloud search URL encodes the query", () => {
    const url = buildSoundCloudSearchUrl("duka & rindu");
    assert.equal(url.origin, "https://api.siputzx.my.id");
    assert.equal(url.pathname, "/api/s/soundcloud");
    assert.equal(url.searchParams.get("query"), "duka & rindu");
});

test("SoundCloud result parser extracts unique official track links", () => {
    const tracks = extractSoundCloudTracks({
        status: true,
        data: [
            {
                permalink: "Last Child Duka",
                permalink_url: "https://soundcloud.com/artist/duka",
                genre: "Pop",
                duration: 320255,
                playback_count: 15523203
            },
            { permalink: "Duplicate", permalink_url: "https://soundcloud.com/artist/duka" },
            { permalink: "Bad host", permalink_url: "https://evil.example/track" },
            { permalink: "Insecure", permalink_url: "http://soundcloud.com/artist/duka" },
            { permalink: "Profile", permalink_url: "https://soundcloud.com/artist" }
        ]
    });
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].title, "Last Child Duka");
    assert.equal(tracks[0].duration, 320255);
    assert.equal(formatSoundCloudTrack(tracks[0]), [
        "🎵 Last Child Duka",
        "Pop · 5:20 · 15.523.203 pemutaran",
        "https://soundcloud.com/artist/duka"
    ].join("\n"));
});

test("SoundCloud parser handles empty, failed, and capped results", () => {
    assert.deepEqual(extractSoundCloudTracks({ status: false, data: [{ permalink_url: "https://soundcloud.com/a/b" }] }), []);
    assert.deepEqual(extractSoundCloudTracks({ data: [] }), []);
    const tracks = extractSoundCloudTracks({
        data: Array.from({ length: 7 }, (_, index) => ({
            permalink: `Track ${index}`,
            permalink_url: `https://soundcloud.com/artist/track-${index}`
        }))
    }, 3);
    assert.equal(tracks.length, 3);
});
