/**
 * Tests for customForges storage shape + content-script derivation.
 */

import { customForgesByType } from "../../src/content/main.js";

describe("customForgesByType", () => {
    test("prefers customForges array when present", () => {
        const out = customForgesByType({
            customForges: [
                { domain: "framagit.org", type: "gitlab" },
                { domain: "try.gitea.io", type: "gitea" },
                { domain: "gitlab.example.com", type: "gitlab" },
            ],
        });
        expect(out.gitlabs.split("\n").sort()).toEqual(
            ["framagit.org", "gitlab.example.com"].sort()
        );
        expect(out.giteas).toBe("try.gitea.io");
    });

    test("falls back to legacy gitlabs/giteas text when array absent", () => {
        const out = customForgesByType({
            gitlabs: "framagit.org\ngitlab.example.com",
            giteas: "codeberg.org",
        });
        expect(out.gitlabs).toBe("framagit.org\ngitlab.example.com");
        expect(out.giteas).toBe("codeberg.org");
    });

    test("returns empty strings when nothing is configured", () => {
        expect(customForgesByType({})).toEqual({ gitlabs: "", giteas: "" });
    });

    test("empty customForges array beats legacy fallback", () => {
        const out = customForgesByType({
            customForges: [],
            gitlabs: "ignored.com",
            giteas: "ignored2.com",
        });
        expect(out).toEqual({ gitlabs: "", giteas: "" });
    });

    test("forgejo entries route through the Gitea bucket", () => {
        const out = customForgesByType({
            customForges: [
                { domain: "codeberg.org",      type: "gitea"   },
                { domain: "forgejo.example.org", type: "forgejo" },
                { domain: "other-forgejo.org", type: "forgejo" },
            ],
        });
        expect(out.gitlabs).toBe("");
        expect(out.giteas.split("\n").sort()).toEqual(
            ["codeberg.org", "forgejo.example.org", "other-forgejo.org"].sort()
        );
    });
});
