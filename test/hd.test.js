import assert from "node:assert/strict";
import test from "node:test";
import {
    buildImageUpscaleUrl,
    buildVideoToHdArgs,
    convertVideoToHd,
    downloadUpscaledImage,
    extractUpscaledImageUrl
} from "../src/hd.js";

test("image upscale URL includes the source URL and API key", () => {
    const url = buildImageUpscaleUrl("https://api.neoxr.eu/api/upscale", "test-key", "https://kappa.lol/image.jpg");
    assert.equal(url.pathname, "/api/upscale");
    assert.equal(url.searchParams.get("image"), "https://kappa.lol/image.jpg");
    assert.equal(url.searchParams.get("apikey"), "test-key");
});

test("upscale response parser accepts only trusted HTTPS file links", () => {
    assert.equal(
        extractUpscaledImageUrl({ status: true, data: { url: "https://result.pages.dev/image.jpg" } })?.hostname,
        "result.pages.dev"
    );
    assert.equal(extractUpscaledImageUrl({ status: false, data: { url: "https://result.pages.dev/image.jpg" } }), undefined);
    assert.equal(extractUpscaledImageUrl({ status: true, data: { url: "http://result.pages.dev/image.jpg" } }), undefined);
    assert.equal(extractUpscaledImageUrl({ status: true, data: { url: "https://example.com/image.jpg" } }), undefined);
});

test("upscaled image downloader validates hosts and media types", async () => {
    const result = await downloadUpscaledImage("https://result.pages.dev/image.jpg", async (url, options) => {
        assert.equal(url.hostname, "result.pages.dev");
        assert.equal(options.redirect, "manual");
        return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg", "content-length": "3" }
        });
    });
    assert.equal(result.extension, "jpg");
    assert.deepEqual([...result.bytes], [1, 2, 3]);
    await assert.rejects(
        downloadUpscaledImage("https://example.com/image.jpg", async () => {
            throw new Error("fetch should not be called");
        }),
        /trusted HTTPS/
    );
    await assert.rejects(
        downloadUpscaledImage("https://result.pages.dev/image", async () =>
            new Response("html", { headers: { "content-type": "text/html" } })),
        /Unsupported upscaled image type/
    );
});

test("video HD conversion scales to 1080p and rejects oversized input", async () => {
    const args = buildVideoToHdArgs("input.mp4", "output.mp4");
    assert.ok(args.some((arg) => arg.includes("max(iw,1920)")));
    assert.ok(args.some((arg) => arg.includes("max(ih,1080)")));
    assert.ok(args.includes("libx264"));
    assert.ok(args.includes("output.mp4"));
    await assert.rejects(convertVideoToHd(new Uint8Array(20 * 1024 * 1024 + 1)), /exceeds the 20 MB input limit/);
});
