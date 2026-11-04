import assert from "node:assert/strict";
import test from "node:test";
import {
    buildNeoXrEndpointUrl,
    formatNeoXrPayload,
    parseNeoXrArguments,
    parseNeoXrCatalog,
    resolveNeoXrEndpoint
} from "../src/neoxr-catalog.js";

const catalog = parseNeoXrCatalog({
    routers: [
        {
            name: "Cuaca",
            category: "Tools",
            path: "/api/cuaca?subdistrict=batang",
            parameter: ["subdistrict"],
            error: false,
            premium: true,
            raw: { path: "/api/cuaca", example: { subdistrict: "batang", apikey: "YOUR_APIKEY" } }
        },
        {
            name: "Jarak",
            category: "Tools",
            parameter: ["from", "to", "by"],
            error: false,
            raw: { path: "/api/distance", example: { from: "bandung", to: "jakarta", by: "car", apikey: "YOUR_APIKEY" } }
        },
        {
            name: "Batman",
            category: "Image Maker",
            error: false,
            raw: { path: "/api/batman", example: { text: "neoxr", apikey: "YOUR_APIKEY" } }
        },
        {
            name: "Disabled",
            category: "Tools",
            error: true,
            raw: { path: "/api/disabled", example: { apikey: "YOUR_APIKEY" } }
        },
        {
            name: "Unsafe",
            category: "Tools",
            error: false,
            raw: { path: "https://example.com/steal", example: { apikey: "YOUR_APIKEY" } }
        }
    ]
});

test("catalog parser only exposes active documented API routes", () => {
    assert.equal(catalog.length, 3);
    assert.equal(catalog[0].id, "cuaca");
    assert.equal(catalog[0].premium, true);
    assert.deepEqual(catalog[0].required, ["subdistrict"]);
    assert.equal(resolveNeoXrEndpoint(catalog, "cuaca"), catalog[0]);
    assert.equal(resolveNeoXrEndpoint(catalog, "/api/cuaca"), catalog[0]);
    assert.equal(resolveNeoXrEndpoint(catalog, "disabled"), undefined);
    assert.deepEqual(catalog[2].required, ["text"]);
});

test("parameter parser supports free text and quoted parameter values", () => {
    assert.deepEqual(parseNeoXrArguments(catalog[0], "kota baru"), { subdistrict: "kota baru" });
    assert.deepEqual(parseNeoXrArguments(catalog[1], 'from="kota bandung" to=jakarta by=car'), {
        from: "kota bandung",
        to: "jakarta",
        by: "car"
    });
    assert.throws(() => parseNeoXrArguments(catalog[1], "from=bandung to=jakarta"), /belum diisi/);
    assert.throws(() => parseNeoXrArguments(catalog[0], "unknown=value"), /tidak tersedia/);
});

test("endpoint URL encodes parameters and never exposes the key outside query params", () => {
    const url = buildNeoXrEndpointUrl("https://api.neoxr.eu/api/gpt-pro", "test-key", catalog[0], {
        subdistrict: "kota baru"
    });
    assert.equal(url.pathname, "/api/cuaca");
    assert.equal(url.searchParams.get("subdistrict"), "kota baru");
    assert.equal(url.searchParams.get("apikey"), "test-key");
});

test("API response formatter redacts key-shaped fields", () => {
    assert.equal(formatNeoXrPayload({ result: "ok", apikey: "secret", nested: { access_token: "secret" } }),
        '{\n  "result": "ok",\n  "apikey": "[disembunyikan]",\n  "nested": {\n    "access_token": "[disembunyikan]"\n  }\n}');
});
