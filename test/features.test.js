import assert from "node:assert/strict";
import test from "node:test";
import { calculate, formatJakartaTime, formatRuntime, randomInteger } from "../src/features.js";
test("calculator safely handles basic operations", () => {
    assert.equal(calculate("12 * 3"), 36);
    assert.equal(calculate("-4 + 1.5"), -2.5);
    assert.equal(calculate("1 / 0"), undefined);
    assert.equal(calculate("process.exit()"), undefined);
});
test("random integers include the requested bounds and reject invalid ranges", () => {
    for (let index = 0; index < 30; index += 1) {
        const value = randomInteger(3, 5);
        assert.ok(value !== undefined && value >= 3 && value <= 5);
    }
    assert.equal(randomInteger(5, 3), undefined);
    assert.equal(randomInteger(1, 1_000_002), undefined);
});
test("Jakarta time formatter returns a readable string", () => {
    assert.match(formatJakartaTime(new Date("2025-01-01T00:00:00Z")), /2025/);
});
test("runtime formatter shows seconds and expands to days", () => {
    assert.equal(formatRuntime(12_000), "12s");
    assert.equal(formatRuntime(3_723_000), "1h 2m 3s");
    assert.equal(formatRuntime(176_461_000), "2d 1h 1m 1s");
    assert.equal(formatRuntime(-1000), "0s");
});
