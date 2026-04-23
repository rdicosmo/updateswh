/**
 * Shape a fetch Response from the SWH API into the `{success, data|error, status, kind?}`
 * envelope that the content script expects.
 *
 * Kept as a pure function so the same logic is unit-testable and mirrored
 * inside extension/background.js (which is not an ES module and cannot import).
 *
 * Recognised kinds:
 *   - "challenge"   : ok response whose body is not JSON — typically an Anubis
 *                     or Cloudflare JS challenge page returned with 200 + text/html.
 *   - "parse_error" : content-type said JSON but body did not parse.
 */
export async function shapeSwhResponse(response) {
    if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}`, status: response.status };
    }
    const ct = response.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
        return {
            success: false,
            status: response.status,
            error: "Non-JSON response from SWH (possibly bot-challenge page)",
            kind: "challenge",
        };
    }
    try {
        const data = await response.json();
        return { success: true, data };
    } catch (e) {
        return {
            success: false,
            status: response.status,
            error: e.message || "JSON parse error",
            kind: "parse_error",
        };
    }
}
