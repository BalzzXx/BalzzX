import assert from "node:assert/strict";
import test from "node:test";
import {
    buildPinterestUrl,
    downloadPinterestImage,
    downloadPinterestVideo,
    extractPinterestImages,
    extractPinterestMedia,
    MAX_PINTEREST_VIDEO_SIZE
} from "../src/pinterest.js";
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

test("Pinterest v2 parser extracts content URLs and skips author avatars and other media types", () => {
    const payload = {
        status: true,
        data: [
            {
                title: "Video pin",
                is_video: true,
                author: { image_large_url: "https://i.pinimg.com/avatar.jpg" },
                content: [{ url: "https://v1.pinimg.com/video.mp4" }]
            },
            {
                title: "Image pin",
                is_video: false,
                author: { image_large_url: "https://i.pinimg.com/other-avatar.jpg" },
                content: [{ width: 800, height: 600, url: "https://i.pinimg.com/image.png" }]
            }
        ]
    };
    const images = extractPinterestMedia(payload, "image", 10);
    const videos = extractPinterestMedia(payload, "video", 10);
    assert.deepEqual(images, [{ url: "https://i.pinimg.com/image.png", title: "Image pin" }]);
    assert.deepEqual(videos, [{ url: "https://v1.pinimg.com/video.mp4", title: "Video pin" }]);
});

test("Pinterest v2 parser does not fall back to profile images when media type is absent", () => {
    const payload = {
        data: [{
            is_video: false,
            author: { image_large_url: "https://i.pinimg.com/avatar.jpg" },
            content: [{ url: "https://i.pinimg.com/image.jpg" }]
        }]
    };
    assert.deepEqual(extractPinterestMedia(payload, "video", 10), []);
});

test("Pinterest image downloader reads image bytes from the Pinterest CDN", async () => {
    const image = await downloadPinterestImage("https://i.pinimg.com/images/cat.png", async (url, options) => {
        assert.equal(url.hostname, "i.pinimg.com");
        assert.equal(options.redirect, "manual");
        return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/png", "content-length": "3" }
        });
    });
    assert.equal(image.extension, "png");
    assert.deepEqual([...image.bytes], [1, 2, 3]);
});

test("Pinterest image downloader rejects untrusted hosts, HTML, and oversized images", async () => {
    await assert.rejects(
        downloadPinterestImage("https://example.com/image.jpg", async () => {
            throw new Error("fetch should not be called");
        }),
        /HTTPS pinimg\.com host/
    );
    await assert.rejects(
        downloadPinterestImage("https://i.pinimg.com/image.jpg", async () =>
            new Response("html", { headers: { "content-type": "text/html" } })),
        /Unsupported Pinterest image type/
    );
    await assert.rejects(
        downloadPinterestImage("https://i.pinimg.com/image.jpg", async () =>
            new Response(null, {
                headers: { "content-type": "image/jpeg", "content-length": String(10 * 1024 * 1024 + 1) }
            })),
        /10 MB size limit/
    );
});

test("Pinterest video downloader reads bytes from a Pinterest CDN URL", async () => {
    const bytes = await downloadPinterestVideo("https://v1.pinimg.com/videos/cat.mp4", async (url, options) => {
        assert.equal(url.hostname, "v1.pinimg.com");
        assert.equal(options.redirect, "manual");
        return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "video/mp4", "content-length": "3" }
        });
    });
    assert.deepEqual([...bytes], [1, 2, 3]);
});

test("Pinterest video downloader rejects non-Pinterest URLs and oversized responses", async () => {
    await assert.rejects(
        downloadPinterestVideo("https://example.com/video.mp4", async () => {
            throw new Error("fetch should not be called");
        }),
        /HTTPS pinimg\.com host/
    );
    await assert.rejects(
        downloadPinterestVideo("https://v1.pinimg.com/videos/cat.mp4", async () =>
            new Response(null, { headers: { "content-type": "video/mp4", "content-length": String(MAX_PINTEREST_VIDEO_SIZE + 1) } })),
        /50 MB size limit/
    );
});
