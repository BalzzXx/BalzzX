import assert from "node:assert/strict";
import test from "node:test";
import { buildPinterestUrl, extractPinterestImages, extractPinterestMedia } from "../src/pinterest.js";
test("Pinterest URL sets query, image type, and result limit", () => {
    const url = buildPinterestUrl("https://api.neoxr.eu/api/pinterest-v2", "test-key", "cat & kitten", 10);
    assert.equal(url.searchParams.get("q"), "cat & kitten");
    assert.equal(url.searchParams.get("show"), "10");
    assert.equal(url.searchParams.get("type"), "image");
    assert.equal(url.searchParams.get("apikey"), "test-key");
});
test("Pinterest parser extracts unique HTTPS image URLs and caps results", () => {
    const payload = {
        status: true,
        result: [
            { title: "Cat", image: "https://i.pinimg.com/originals/cat.jpg" },
            { title: "Not an image link", url: "https://pinterest.com/pin/123" },
            { image: "http://example.com/insecure.png" },
            { image: "https://cdn.example.com/one.webp" },
            { image: "https://cdn.example.com/one.webp" },
            { image: "https://cdn.example.com/two.png" }
        ]
    };
    const images = extractPinterestImages(payload, 2);
    assert.equal(images.length, 2);
    assert.equal(images[0]?.title, "Cat");
    assert.equal(images[1]?.url, "https://cdn.example.com/one.webp");
});
test("Pinterest parser rejects invalid limits", () => {
    assert.deepEqual(extractPinterestImages({ image: "https://i.pinimg.com/a.jpg" }, 0), []);
});
test("Pinterest video URL uses the video type", () => {
    const url = buildPinterestUrl("https://api.neoxr.eu/api/pinterest-v2", "test-key", "cat", 10, "video");
    assert.equal(url.searchParams.get("type"), "video");
});
test("Pinterest video parser extracts unique secure video URLs", () => {
    const payload = {
        result: [
            { title: "Video one", video: "https://v1.pinimg.com/videos/mc/720p/cat.mp4" },
            { video_url: "http://example.com/insecure.mp4" },
            { video: "https://cdn.example.com/cat.webm" },
            { video: "https://cdn.example.com/cat.webm" },
            { image: "https://i.pinimg.com/cat.jpg" }
        ]
    };
    const videos = extractPinterestMedia(payload, "video", 10);
    assert.equal(videos.length, 2);
    assert.equal(videos[0]?.title, "Video one");
    assert.equal(videos[1]?.url, "https://cdn.example.com/cat.webm");
});
