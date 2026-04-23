import { COLOR_CODES } from "../../src/constants.js";
import { sendMessageWithTimeout, fetchSwhLatestVisit, requestSwhSave } from "../../src/api/swh.js";

function stubRuntime({ response, lastError = null, delayMs = 0, throws = null, dropResponse = false } = {}) {
    const sendMessage = jest.fn((_msg, cb) => {
        if (throws) throw throws;
        if (dropResponse) return;
        if (delayMs > 0) {
            setTimeout(() => {
                global.chrome.runtime.lastError = lastError;
                cb(response);
                global.chrome.runtime.lastError = null;
            }, delayMs);
        } else {
            global.chrome.runtime.lastError = lastError;
            cb(response);
            global.chrome.runtime.lastError = null;
        }
    });
    global.chrome = { runtime: { sendMessage, lastError: null } };
}

afterEach(() => {
    delete global.chrome;
    jest.useRealTimers();
});

describe("sendMessageWithTimeout", () => {
    test("resolves with the background response", async () => {
        stubRuntime({ response: { success: true, data: { k: "v" } } });
        await expect(sendMessageWithTimeout({ type: "X" })).resolves.toEqual({
            success: true,
            data: { k: "v" },
        });
    });

    test("rejects when runtime.lastError is set", async () => {
        stubRuntime({ response: undefined, lastError: { message: "receiving end does not exist" } });
        await expect(sendMessageWithTimeout({ type: "X" })).rejects.toThrow("receiving end does not exist");
    });

    test("rejects when background never responds (SW suspended)", async () => {
        jest.useFakeTimers();
        stubRuntime({ dropResponse: true });
        const promise = sendMessageWithTimeout({ type: "X" }, { timeoutMs: 50 });
        jest.advanceTimersByTime(50);
        await expect(promise).rejects.toThrow(/did not respond/);
    });

    test("rejects when sendMessage throws synchronously", async () => {
        stubRuntime({ throws: new Error("no context") });
        await expect(sendMessageWithTimeout({ type: "X" }, { timeoutMs: 50 })).rejects.toThrow("no context");
    });
});

describe("fetchSwhLatestVisit — challenge detection", () => {
    test("success response → ok:true with data", async () => {
        stubRuntime({ response: { success: true, data: { date: "2026-01-01", status: "full" } } });
        const out = await fetchSwhLatestVisit("https://github.com/a/b");
        expect(out).toEqual({ ok: true, data: { date: "2026-01-01", status: "full" } });
    });

    test("challenge kind → errorType SWH_UNREACHABLE", async () => {
        stubRuntime({ response: { success: false, kind: "challenge", status: 200, error: "Non-JSON response" } });
        const out = await fetchSwhLatestVisit("https://github.com/a/b");
        expect(out.ok).toBe(false);
        expect(out.errorType).toBe(COLOR_CODES.SWH_UNREACHABLE);
    });

    test("404 → NOT_ARCHIVED (existing behavior)", async () => {
        stubRuntime({ response: { success: false, status: 404, error: "HTTP 404" } });
        const out = await fetchSwhLatestVisit("https://github.com/a/b");
        expect(out.errorType).toBe(COLOR_CODES.NOT_ARCHIVED);
    });

    test("403 → API_LIMIT (existing behavior)", async () => {
        stubRuntime({ response: { success: false, status: 403, error: "HTTP 403" } });
        const out = await fetchSwhLatestVisit("https://github.com/a/b");
        expect(out.errorType).toBe(COLOR_CODES.API_LIMIT);
    });

    test("timeout / port closed → SWH_UNREACHABLE (not NOT_ARCHIVED)", async () => {
        jest.useFakeTimers();
        stubRuntime({ dropResponse: true });
        const promise = fetchSwhLatestVisit("https://github.com/a/b");
        jest.advanceTimersByTime(20_000);
        const out = await promise;
        expect(out.ok).toBe(false);
        expect(out.errorType).toBe(COLOR_CODES.SWH_UNREACHABLE);
    });
});

describe("requestSwhSave — challenge propagation", () => {
    test("success → ok:true with data", async () => {
        stubRuntime({ response: { success: true, data: { save_request_status: "accepted" } } });
        const out = await requestSwhSave("https://github.com/a/b");
        expect(out.ok).toBe(true);
    });

    test("challenge → kind:'challenge' on failure envelope", async () => {
        stubRuntime({ response: { success: false, kind: "challenge", status: 200, error: "Non-JSON response" } });
        const out = await requestSwhSave("https://github.com/a/b");
        expect(out).toEqual({
            ok: false,
            kind: "challenge",
            status: 200,
            error: "Non-JSON response",
        });
    });

    test("timeout → kind:'timeout'", async () => {
        jest.useFakeTimers();
        stubRuntime({ dropResponse: true });
        const promise = requestSwhSave("https://github.com/a/b");
        jest.advanceTimersByTime(20_000);
        const out = await promise;
        expect(out.ok).toBe(false);
        expect(out.kind).toBe("timeout");
    });

    test("plain failure → no kind", async () => {
        stubRuntime({ response: { success: false, status: 500, error: "HTTP 500" } });
        const out = await requestSwhSave("https://github.com/a/b");
        expect(out.ok).toBe(false);
        expect(out.kind).toBeUndefined();
        expect(out.status).toBe(500);
    });
});
