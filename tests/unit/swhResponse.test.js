import { shapeSwhResponse } from "../../src/api/swhResponse.js";

function mockResponse({ ok = true, status = 200, contentType = "application/json", body = null, bodyThrows = false } = {}) {
    return {
        ok,
        status,
        headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
        json: async () => {
            if (bodyThrows) throw new SyntaxError("Unexpected token < in JSON at position 0");
            return body;
        },
    };
}

describe("shapeSwhResponse", () => {
    test("200 + application/json → success", async () => {
        const r = mockResponse({ body: { origin: "x", status: "full" } });
        await expect(shapeSwhResponse(r)).resolves.toEqual({
            success: true,
            data: { origin: "x", status: "full" },
        });
    });

    test("200 + application/json; charset=utf-8 → success", async () => {
        const r = mockResponse({ contentType: "application/json; charset=utf-8", body: { ok: 1 } });
        const out = await shapeSwhResponse(r);
        expect(out.success).toBe(true);
        expect(out.data).toEqual({ ok: 1 });
    });

    test("200 + text/html → challenge (Anubis case)", async () => {
        const r = mockResponse({ contentType: "text/html; charset=utf-8", body: "<html>…</html>" });
        const out = await shapeSwhResponse(r);
        expect(out).toEqual({
            success: false,
            status: 200,
            error: expect.stringMatching(/non-json|bot-challenge/i),
            kind: "challenge",
        });
    });

    test("200 + no content-type header → challenge", async () => {
        const r = mockResponse({ contentType: null });
        const out = await shapeSwhResponse(r);
        expect(out.success).toBe(false);
        expect(out.kind).toBe("challenge");
    });

    test("404 → plain HTTP error, no kind", async () => {
        const r = mockResponse({ ok: false, status: 404 });
        const out = await shapeSwhResponse(r);
        expect(out).toEqual({ success: false, status: 404, error: "HTTP 404" });
        expect(out.kind).toBeUndefined();
    });

    test("403 → plain HTTP error, no kind", async () => {
        const r = mockResponse({ ok: false, status: 403 });
        const out = await shapeSwhResponse(r);
        expect(out).toEqual({ success: false, status: 403, error: "HTTP 403" });
    });

    test("200 + JSON content-type but body parse throws → parse_error", async () => {
        const r = mockResponse({ bodyThrows: true });
        const out = await shapeSwhResponse(r);
        expect(out.success).toBe(false);
        expect(out.kind).toBe("parse_error");
        expect(out.status).toBe(200);
    });
});
