/** @jest-environment node */
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeJwt, run, send } from "../../build/amo-metadata.js";

const ISSUER = "user:12345:67";
const SECRET = "test-secret-not-a-real-one";
const GUID = "{157eb9f0-9814-4fcc-b0b7-586b3093c641}";
const ADDON_URL = "https://addons.mozilla.org/api/v5/addons/addon/%7B157eb9f0-9814-4fcc-b0b7-586b3093c641%7D/";

const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString());

describe("makeJwt", () => {
    const token = makeJwt(ISSUER, SECRET, 1_700_000_000_500, "nonce-1");
    const [header, payload, signature] = token.split(".");

    test("header declares HS256", () => {
        expect(decode(header)).toEqual({ alg: "HS256", typ: "JWT" });
    });

    test("claims carry iss, jti, iat and an exp at most five minutes later", () => {
        const claims = decode(payload);
        expect(claims).toEqual({ iss: ISSUER, jti: "nonce-1", iat: 1_700_000_000, exp: expect.any(Number) });
        expect(claims.exp).toBeGreaterThan(claims.iat);
        expect(claims.exp - claims.iat).toBeLessThanOrEqual(300);
    });

    test("signature verifies with the secret, and only with it", () => {
        const expected = (key) => createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url");
        expect(signature).toBe(expected(SECRET));
        expect(signature).not.toBe(expected("another-secret"));
    });

    test("jti differs between tokens by default", () => {
        const jti = (t) => decode(t.split(".")[1]).jti;
        expect(jti(makeJwt(ISSUER, SECRET))).not.toBe(jti(makeJwt(ISSUER, SECRET)));
    });
});

describe("run --dry-run", () => {
    let root;
    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "updateswh-amo-"));
        mkdirSync(join(root, "store/notes"), { recursive: true });
        writeFileSync(join(root, "store/description.txt"), "Long text.\n\nSecond paragraph.\n");
        writeFileSync(join(root, "store/summary.txt"), "Short text.\n");
        writeFileSync(join(root, "store/notes/1.2.3.txt"), "Fixed things.\n");
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    test("builds the listing and release-notes PATCHes, prints them, calls nothing", async () => {
        const fetchImpl = jest.fn();
        const lines = [];
        const requests = await run({
            root, version: "1.2.3", guid: GUID, dryRun: true,
            env: { FIREFOX_JWT_ISSUER: ISSUER, FIREFOX_JWT_SECRET: SECRET },
            fetchImpl, log: (l) => lines.push(l),
        });
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(requests.map(({ method, url, body }) => ({ method, url, body }))).toEqual([
            {
                method: "PATCH",
                url: ADDON_URL,
                body: {
                    description: { "en-US": "Long text.\n\nSecond paragraph." },
                    summary: { "en-US": "Short text." },
                },
            },
            {
                method: "PATCH",
                url: `${ADDON_URL}versions/v1.2.3/`,
                body: { release_notes: { "en-US": "Fixed things." } },
            },
        ]);
        const printed = lines.join("\n");
        expect(printed).toContain(`PATCH ${ADDON_URL}versions/v1.2.3/`);
        expect(printed).toContain("Authorization: JWT <redacted>");
        expect(printed).not.toContain(SECRET);
        expect(printed).not.toMatch(/eyJ/);
    });

    test("refuses to run without release notes for the version", async () => {
        await expect(run({ root, version: "1.2.4", guid: GUID, dryRun: true, log: () => {} }))
            .rejects.toThrow("store/notes/1.2.4.txt");
    });

    test("a real run without credentials fails before any request", async () => {
        const fetchImpl = jest.fn();
        await expect(run({ root, version: "1.2.3", guid: GUID, dryRun: false, env: {}, fetchImpl, log: () => {} }))
            .rejects.toThrow("FIREFOX_JWT_ISSUER");
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe("send", () => {
    const req = { method: "PATCH", url: "https://example.invalid/v/", body: { a: 1 }, attempts: 3 };
    const response = (status) => ({ ok: status < 300, status, text: async () => "body" });
    const options = (fetchImpl) => ({ issuer: ISSUER, secret: SECRET, fetchImpl, sleep: jest.fn(async () => {}), retryMs: 1, log: () => {} });

    test("sends a JWT Authorization header and a JSON body", async () => {
        const fetchImpl = jest.fn(async () => response(200));
        await send(req, options(fetchImpl));
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(req.url);
        expect(init.method).toBe("PATCH");
        expect(init.headers.Authorization).toMatch(/^JWT [\w-]+\.[\w-]+\.[\w-]+$/);
        expect(init.headers["Content-Type"]).toBe("application/json");
        expect(JSON.parse(init.body)).toEqual({ a: 1 });
    });

    test("retries a 404 until the version exists", async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(response(404))
            .mockResolvedValueOnce(response(404))
            .mockResolvedValueOnce(response(200));
        await send(req, options(fetchImpl));
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    test("gives up after the bounded number of attempts", async () => {
        const fetchImpl = jest.fn(async () => response(404));
        await expect(send(req, options(fetchImpl))).rejects.toThrow("HTTP 404");
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    test("does not retry other errors, nor a request without attempts", async () => {
        const fetchImpl = jest.fn(async () => response(401));
        await expect(send(req, options(fetchImpl))).rejects.toThrow("HTTP 401");
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const once = jest.fn(async () => response(404));
        await expect(send({ ...req, attempts: undefined }, options(once))).rejects.toThrow("HTTP 404");
        expect(once).toHaveBeenCalledTimes(1);
    });
});
