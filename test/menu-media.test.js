import assert from "node:assert/strict";
import test from "node:test";
import { buildVideoToGifArgs, classifyMenuMedia } from "../src/menu-media.js";

test("menu media is classified from response content type", () => {
    assert.deepEqual(classifyMenuMedia("image/jpeg", "https://kappa.lol/5VJjsi"), {
        type: "photo",
        extension: ".jpg"
    });
    assert.deepEqual(classifyMenuMedia("image/gif", "https://example.com/menu"), {
        type: "animation",
        extension: ".gif"
    });
    assert.deepEqual(classifyMenuMedia("video/mp4", "https://example.com/menu"), {
        type: "video",
        extension: ".video"
    });
});

test("menu media classification falls back to safe file extensions", () => {
    assert.deepEqual(classifyMenuMedia("application/octet-stream", "https://kappa.lol/menu.webp"), {
        type: "photo",
        extension: ".webp"
    });
    assert.deepEqual(classifyMenuMedia("", "https://kappa.lol/menu.mp4"), {
        type: "video",
        extension: ".video"
    });
    assert.throws(() => classifyMenuMedia("text/html", "https://kappa.lol/menu"), /Unsupported/);
});

test("video conversion generates a short silent looping GIF", () => {
    const args = buildVideoToGifArgs("input.mp4", "output.gif");
    assert.ok(args.includes("-t") && args[args.indexOf("-t") + 1] === "6");
    assert.ok(args.includes("-loop") && args[args.indexOf("-loop") + 1] === "0");
    assert.ok(args.includes("-an"));
    assert.ok(args.some((arg) => arg.includes("fps=15,scale=1000:-2:flags=lanczos")));
    assert.ok(args.some((arg) => arg.includes("paletteuse=dither=sierra2_4a")));
    assert.equal(args.at(-1), "output.gif");
});
