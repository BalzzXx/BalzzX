import assert from "node:assert/strict";
import test from "node:test";
import { buildIqcUrl, downloadIqcImage, extractIqcImage } from "../src/iqc.js";

test("IQC URL encodes text and includes display times and API key", () => {
    const url = buildIqcUrl("https://api.neoxr.eu/api/iqc", "test-key", "ayo scroll 😜", "12:40", "10:15");
    assert.equal(url.searchParams.get("text"), "ayo scroll 😜");
    assert.equal(url.searchParams.get("time"), "12:40");
    assert.equal(url.searchParams.get("chat_time"), "10:15");
    assert.equal(url.searchParams.get("apikey"), "test-key");
});

test("IQC response parser accepts NeoXR image links only", () => {
    assert.equal(
        extractIqcImage({ status: true, data: { url: "https://secure-signed.pages.dev/iqc.png", mime: "image/png" } })?.url.hostname,
        "secure-signed.pages.dev"
    );
    assert.equal(extractIqcImage({ status: false, data: { url: "https://secure-signed.pages.dev/iqc.png", mime: "image/png" } }), undefined);
    assert.equal(extractIqcImage({ status: true, data: { url: "https://example.com/image.png", mime: "image/png" } }), undefined);
    assert.equal(extractIqcImage({ status: true, data: { url: "https://secure-signed.pages.dev/file", mime: "application/octet-stream" } }), undefined);
});

test("IQC image downloader returns image bytes and rejects unsafe types and URLs", async () => {
    const image = await downloadIqcImage("https://secure-signed.pages.dev/iqc.png", "image/png", async (url, options) => {
        assert.equal(url.hostname, "secure-signed.pages.dev");
        assert.equal(options.redirect, "manual");
        return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/png", "content-length": "3" }
        });
    });
    assert.equal(image.extension, "png");
    assert.deepEqual([...image.bytes], [1, 2, 3]);
    await assert.rejects(
        downloadIqcImage("https://example.com/image.png", "image/png", async () => {
            throw new Error("fetch should not be called");
        }),
        /trusted HTTPS/
    );
    await assert.rejects(
        downloadIqcImage("https://secure-signed.pages.dev/file", "image/png", async () =>
            new Response("not an image", { headers: { "content-type": "text/html" } })),
        /Unsupported IQC image type/
    );
    const binary = await downloadIqcImage("https://secure-signed.pages.dev/file", "image/png", async () =>
        new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "application/octet-stream", "content-length": "3" }
        }));
    assert.equal(binary.extension, "png");
});
