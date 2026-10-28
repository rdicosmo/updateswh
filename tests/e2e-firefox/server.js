/**
 * Forward proxy standing in for the network in the Firefox E2E tests.
 *
 * Firefox sends every request here (see harness.js). Plain-http requests
 * for FORGE_HOST get a fixture: the Gitea repo API answers JSON, any other
 * path a minimal HTML page. Everything else gets 404, and https CONNECTs
 * are refused, so the tests never touch the internet. Requests are logged
 * in `requests` for assertions.
 */

import http from "node:http";

export const FORGE_HOST = "forge.example.org";

export function createProxy() {
    const requests = [];
    const server = http.createServer((req, res) => {
        let url;
        try { url = new URL(req.url); } catch { url = new URL(req.url, "http://invalid"); }
        requests.push({ method: req.method, host: url.host, path: url.pathname });
        if (url.host !== FORGE_HOST) {
            res.writeHead(404, { "content-type": "text/plain" });
            return res.end("not mocked");
        }
        if (url.pathname.startsWith("/api/v1/repos/")) {
            res.writeHead(200, { "content-type": "application/json" });
            return res.end(JSON.stringify({ updated_at: "2026-01-01T00:00:00Z" }));
        }
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<!doctype html><html><head><title>repo</title></head><body><h1>repo</h1></body></html>");
    });
    server.on("connect", (req, socket) => {
        requests.push({ method: "CONNECT", host: req.url, path: "" });
        socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    });

    return {
        requests,
        start: () => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port))),
        stop: () => new Promise((resolve) => server.close(() => resolve())),
    };
}
