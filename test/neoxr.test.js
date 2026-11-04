import assert from "node:assert/strict";
import test from "node:test";
import { buildNeoXrUrl, extractNeoXrAnswer } from "../src/neoxr.js";

test("NeoXR GPT-Pro URL encodes the prompt and API key", () => {
    const url = buildNeoXrUrl("https://api.neoxr.eu/api/gpt-pro", "test-key", "hello world & hi");
    assert.equal(url.pathname, "/api/gpt-pro");
    assert.equal(url.searchParams.get("q"), "hello world & hi");
    assert.equal(url.searchParams.get("apikey"), "test-key");
});

test("NeoXR AI response parser handles common response shapes", () => {
    assert.equal(extractNeoXrAnswer({ result: "answer" }), "answer");
    assert.equal(extractNeoXrAnswer({ data: { response: "nested answer" } }), "nested answer");
    assert.equal(extractNeoXrAnswer(" plain text "), "plain text");
    assert.equal(extractNeoXrAnswer({ status: false, result: "no" }), undefined);
    assert.equal(extractNeoXrAnswer({ unrelated: true }), undefined);
});
