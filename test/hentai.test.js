import assert from "node:assert/strict";
import test from "node:test";
import { buildHentaiUrl, fetchHentaiImage } from "../src/hentai.js";

test("hentai API URL contains the API key without exposing it in bot output", () => {
    const url = buildHentaiUrl("https://free-restapi.biz.id/api/hentai", "test-key");
    assert.equal(url.pathname, "/api/hentai");
    assert.equal(url.searchParams.get("apikey"), "test-key");
});

test("hentai API image downloader accepts bounded supported images", async () => {
    const image = await fetchHentaiImage("https://free-restapi.biz.id/api/hentai", "test-key", async (url) => {
        assert.equal(url.searchParams.get("apikey"), "test-key");
        return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
            headers: { "content-type": "image/jpeg", "content-length": "3" }
        });
    });
    assert.equal(image.extension, "jpg");
    assert.deepEqual([...image.bytes], [0xff, 0xd8, 0xff]);
});

test("hentai API downloader rejects errors, JSON responses, and oversized images", async () => {
    await assert.rejects(
        fetchHentaiImage("https://free-restapi.biz.id/api/hentai", "test-key", async () =>
            new Response("error", { status: 500 })),
        /HTTP 500/
    );
    await assert.rejects(
        fetchHentaiImage("https://free-restapi.biz.id/api/hentai", "test-key", async () =>
            Response.json({ error: "bad key" })),
        /Unsupported hentai API response type/
    );
    await assert.rejects(
        fetchHentaiImage("https://free-restapi.biz.id/api/hentai", "test-key", async () =>
            new Response(null, {
                headers: { "content-type": "image/jpeg", "content-length": String(10 * 1024 * 1024 + 1) }
            })),
        /10 MB photo limit/
    );
});
