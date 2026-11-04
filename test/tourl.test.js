import assert from "node:assert/strict";
import test from "node:test";
import { extractKappaLink, safeFileName } from "../src/tourl.js";
test("Kappa link parser only accepts HTTPS links from the service hosts", () => {
    assert.equal(extractKappaLink({ link: "https://segs.lol/abc123" }), "https://segs.lol/abc123");
    assert.equal(extractKappaLink({ link: "http://segs.lol/abc123" }), undefined);
    assert.equal(extractKappaLink({ link: "https://evil.example/abc123" }), undefined);
    assert.equal(extractKappaLink({ link: "not a URL" }), undefined);
});
test("file names are sanitized before multipart upload", () => {
    assert.equal(safeFileName("../../my file?.png"), "my_file_.png");
    assert.equal(safeFileName(""), "upload");
});
