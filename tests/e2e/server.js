/**
 * Mock HTTP server used by the E2E harness.
 *
 * Serves three families of requests, all configurable per test via
 * `setScenario(scenario)`:
 *
 *   - Forge HTML fixtures (the pages the content script matches against):
 *       GET /fixtures/github/<user>/<repo>  → minimal GitHub-like HTML
 *       GET /fixtures/gitlab/<path...>      → minimal GitLab-like HTML
 *   - Forge API stubs:
 *       GET /forge/github/repos/<user>/<repo> → JSON { pushed_at }
 *   - SWH API stubs:
 *       GET  /swh/origin/<origin_url>/visit/latest/ → JSON { status, date, ... }
 *       POST /swh/origin/save/git/url/<origin>/     → JSON { save_request_status }
 *
 * The scenario object controls response behaviour:
 *
 *   {
 *     forge: { pushed_at: "2026-01-01T00:00:00Z" },
 *     swhVisit: { status: 200, body: { status:"full", date:"2026-04-01T..." } },
 *     swhSave:  { status: 200, body: { save_request_status:"accepted", ... } },
 *   }
 *
 * Each leaf can be overridden with `{ status, contentType, body, delayMs }`
 * to reproduce Anubis (text/html challenge), 4xx, 5xx, or SW-suspension-like
 * long delays. See scenarios/* for concrete shapes.
 */

import http from "node:http";

export function createMockServer() {
    let scenario = defaultScenario();

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, "http://localhost");
        const path = url.pathname;

        if (path.startsWith("/fixtures/github/")) {
            return serveGithubFixture(req, res, path);
        }
        if (path.startsWith("/forge/github/repos/")) {
            return serveForgeGithub(res, scenario.forge);
        }
        if (path.startsWith("/swh/origin/") && path.endsWith("/visit/latest/")) {
            return serveSwh(res, scenario.swhVisit);
        }
        if (path.startsWith("/swh/origin/save/")) {
            return serveSwh(res, scenario.swhSave);
        }
        res.writeHead(404, { "content-type": "text/plain" });
        res.end(`no mock for ${path}`);
    });

    return {
        start() {
            return new Promise((resolve) => {
                server.listen(0, "127.0.0.1", () => resolve(server.address().port));
            });
        },
        stop() {
            return new Promise((resolve) => server.close(resolve));
        },
        setScenario(next) {
            scenario = { ...defaultScenario(), ...next };
        },
    };
}

function defaultScenario() {
    return {
        forge: { status: 200, body: { pushed_at: "2026-01-01T00:00:00Z" } },
        swhVisit: {
            status: 200,
            body: {
                origin: "https://github.com/u/r",
                visit: 1,
                date: "2026-04-22T12:00:00+00:00",
                status: "full",
                snapshot: "a".repeat(40),
                type: "git-checkout",
            },
        },
        swhSave: {
            status: 200,
            body: {
                id: 1,
                origin_url: "https://github.com/u/r",
                save_request_status: "accepted",
                save_task_status: "pending",
            },
        },
    };
}

async function serveWith(res, spec) {
    const status = spec?.status ?? 200;
    const contentType = spec?.contentType ?? "application/json";
    let body = spec?.body;
    if (body != null && contentType.includes("json") && typeof body !== "string") {
        body = JSON.stringify(body);
    }
    if (spec?.delayMs) await new Promise((r) => setTimeout(r, spec.delayMs));
    res.writeHead(status, { "content-type": contentType });
    res.end(body ?? "");
}

function serveGithubFixture(_req, res, path) {
    // /fixtures/github/:user/:repo  → pretend to be a GitHub repo page.
    // The content script matches on URL pattern, so the body just has to be a
    // valid HTML doc; the URL the page is navigated to is what matters.
    const parts = path.split("/").filter(Boolean); // fixtures github user repo
    const user = parts[2] || "user";
    const repo = parts[3] || "repo";
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${user}/${repo}</title></head>
<body><h1>${user}/${repo}</h1><p>mock github repo page</p></body></html>`;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
}

function serveForgeGithub(res, spec) {
    serveWith(res, spec);
}

function serveSwh(res, spec) {
    serveWith(res, spec);
}
