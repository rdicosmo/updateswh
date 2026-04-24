import {
    DEFAULT_FORGES,
    BUILTIN_FORGE_DOMAINS,
    matches,
    findMatchingForge,
    setupForge,
    buildForges,
    gitlabInstanceHandler,
    giteaInstanceHandler,
} from "../../src/forges.js";

function byName(name) {
    return DEFAULT_FORGES.find((f) => f.name === name);
}

describe("forges — flat table", () => {
    describe("GitHub", () => {
        const forge = byName("GitHub");

        test("matches repository URLs", () => {
            expect(matches(forge, "https://github.com/user/repo")).toBe(true);
            expect(matches(forge, "https://github.com/user/repo/issues")).toBe(true);
            expect(matches(forge, "http://github.com/user/repo")).toBe(true);
        });

        test("rejects non-repository URLs", () => {
            expect(matches(forge, "https://github.com/features")).toBe(false);
            expect(matches(forge, "https://github.com/marketplace")).toBe(false);
            expect(matches(forge, "https://github.com/user/repo/search?q=test")).toBe(false);
        });

        test("setup extracts project info", () => {
            const r = setupForge("https://github.com/user/repo", forge);
            expect(r.projecturl).toBe("https://github.com/user/repo");
            expect(r.userproject).toBe("user/repo");
            expect(r.forgeapiurl).toBe("https://api.github.com/repos/user/repo");
            expect(r.forgename).toBe("GitHub");
        });
    });

    describe("GitLab (gitlab.com)", () => {
        const forge = byName("GitLab");

        test("matches repository URLs", () => {
            expect(matches(forge, "https://gitlab.com/user/repo")).toBe(true);
            expect(matches(forge, "https://gitlab.com/user/repo/-/issues")).toBe(true);
        });

        test("matches subgroup URLs", () => {
            expect(matches(forge, "https://gitlab.com/org/subgroup/project")).toBe(true);
            expect(matches(forge, "https://gitlab.com/org/sub1/sub2/project")).toBe(true);
        });

        test("rejects explore", () => {
            expect(matches(forge, "https://gitlab.com/explore")).toBe(false);
        });

        test("setup path-encodes subgroups", () => {
            const r = setupForge("https://gitlab.com/org/subgroup/project", forge);
            expect(r.userproject).toBe(encodeURIComponent("org/subgroup/project"));
        });
    });

    describe("Bitbucket", () => {
        const forge = byName("Bitbucket");

        test("matches repository URLs", () => {
            expect(matches(forge, "https://bitbucket.org/user/repo")).toBe(true);
        });

        test("rejects non-repository URLs", () => {
            expect(matches(forge, "https://bitbucket.org/dashboard")).toBe(false);
            expect(matches(forge, "https://bitbucket.org/product")).toBe(false);
        });
    });

    describe("Forgejo (codeberg.org as known instance)", () => {
        test("matches codeberg via known-list row", () => {
            const forge = findMatchingForge("https://codeberg.org/alice/repo");
            expect(forge).not.toBeNull();
            expect(forge.name).toBe("Forgejo instance");
        });

        test("rejects non-repository codeberg URLs", () => {
            expect(findMatchingForge("https://codeberg.org/alice")).toBeNull();
            expect(findMatchingForge("https://codeberg.org/explore/")).toBeNull();
            expect(findMatchingForge("https://codeberg.org/user/foo")).toBeNull();
        });

        test("setup builds codeberg API url (Forgejo preserves Gitea /api/v1)", () => {
            const forge = findMatchingForge("https://codeberg.org/alice/repo");
            const r = setupForge("https://codeberg.org/alice/repo", forge);
            expect(r.forgeapiurl).toBe("https://codeberg.org/api/v1/repos/alice/repo");
        });
    });

    describe("Pagure", () => {
        test("matches simple /<repo> URLs", () => {
            const forge = findMatchingForge("https://pagure.io/pagure");
            expect(forge).not.toBeNull();
            expect(forge.name).toBe("Pagure");
        });

        test("matches namespaced /<namespace>/<repo> URLs", () => {
            const forge = findMatchingForge("https://pagure.io/SSSD/sssd");
            expect(forge).not.toBeNull();
            expect(forge.name).toBe("Pagure");
        });

        test("rejects meta-paths and repo sub-paths", () => {
            expect(findMatchingForge("https://pagure.io/user/foo")).toBeNull();
            expect(findMatchingForge("https://pagure.io/users")).toBeNull();
            expect(findMatchingForge("https://pagure.io/new")).toBeNull();
            expect(findMatchingForge("https://pagure.io/dashboard/")).toBeNull();
            expect(findMatchingForge("https://pagure.io/login")).toBeNull();
            expect(findMatchingForge("https://pagure.io/api/0/foo")).toBeNull();
            expect(findMatchingForge("https://pagure.io/pagure/issues")).toBeNull();
            expect(findMatchingForge("https://pagure.io/pagure/pull-requests")).toBeNull();
            expect(findMatchingForge("https://pagure.io/pagure/settings")).toBeNull();
        });

        test("setup builds Pagure API url and converts unix-seconds to ISO", () => {
            const forge = findMatchingForge("https://pagure.io/pagure");
            const r = setupForge("https://pagure.io/pagure", forge);
            expect(r.forgeapiurl).toBe("https://pagure.io/api/0/pagure");
            // 1736760285 = 2025-01-13T09:24:45Z
            const iso = r.lastupdate({ date_modified: 1736760285 });
            expect(iso).toBe("2025-01-13T09:24:45.000Z");
        });

        test("setup returns null lastupdate when date_modified is missing", () => {
            const forge = findMatchingForge("https://pagure.io/pagure");
            const r = setupForge("https://pagure.io/pagure", forge);
            expect(r.lastupdate({})).toBeNull();
        });

        test("setup supports namespaced repos in the API path", () => {
            const forge = findMatchingForge("https://pagure.io/SSSD/sssd");
            const r = setupForge("https://pagure.io/SSSD/sssd", forge);
            expect(r.forgeapiurl).toBe("https://pagure.io/api/0/SSSD/sssd");
        });
    });

    describe("findMatchingForge", () => {
        test("finds GitHub", () => {
            expect(findMatchingForge("https://github.com/user/repo").name).toBe("GitHub");
        });

        test("finds GitLab", () => {
            expect(findMatchingForge("https://gitlab.com/user/repo").name).toBe("GitLab");
        });

        test("finds Bitbucket", () => {
            expect(findMatchingForge("https://bitbucket.org/user/repo").name).toBe("Bitbucket");
        });

        test("returns null for unmatched URLs", () => {
            expect(findMatchingForge("https://example.com/repo")).toBeNull();
        });
    });

    describe("user-defined instances", () => {
        test("gitlabInstanceHandler matches a custom domain", () => {
            const custom = gitlabInstanceHandler("gitlab.example.test");
            expect(matches(custom, "https://gitlab.example.test/user/repo")).toBe(true);
            expect(matches(custom, "https://gitlab.example.test/users/sign_in")).toBe(false);
        });

        test("giteaInstanceHandler matches a custom domain", () => {
            const custom = giteaInstanceHandler("git.example.test");
            expect(matches(custom, "https://git.example.test/alice/repo")).toBe(true);
            expect(matches(custom, "https://git.example.test/explore/")).toBe(false);
            expect(matches(custom, "https://git.example.test/user/alice")).toBe(false);
        });

        test("buildForges appends user-defined gitlabs and giteas", () => {
            const list = buildForges({ gitlabs: "gl.example.test", giteas: "g.example.test" });
            expect(list.length).toBe(DEFAULT_FORGES.length + 2);
            expect(findMatchingForge("https://gl.example.test/alice/repo", list).name).toBe("GitLab instance");
            expect(findMatchingForge("https://g.example.test/alice/repo",  list).name).toBe("Gitea instance");
        });
    });

    describe("BUILTIN_FORGE_DOMAINS", () => {
        test("contains expected domains", () => {
            expect(BUILTIN_FORGE_DOMAINS).toContain("github.com");
            expect(BUILTIN_FORGE_DOMAINS).toContain("bitbucket.org");
            expect(BUILTIN_FORGE_DOMAINS).toContain("gitlab.com");
            expect(BUILTIN_FORGE_DOMAINS).toContain("pagure.io");
            expect(BUILTIN_FORGE_DOMAINS).toContain("codeberg.org");
            expect(BUILTIN_FORGE_DOMAINS).toContain("git.disroot.org");
            expect(BUILTIN_FORGE_DOMAINS).toContain("git.fsfe.org");
        });

        test("codeberg / disroot / minetest.land resolve to the Forgejo instance row", () => {
            // Verified against /api/v1/version: these hosts advertise the
            // Forgejo "+gitea-X.Y.Z" compat suffix.
            expect(findMatchingForge("https://codeberg.org/alice/repo").name).toBe("Forgejo instance");
            expect(findMatchingForge("https://git.disroot.org/alice/repo").name).toBe("Forgejo instance");
            expect(findMatchingForge("https://git.minetest.land/alice/repo").name).toBe("Forgejo instance");
        });

        test("remaining known Gitea domains still resolve to the Gitea row", () => {
            // /api/v1/version returns bare 1.x.x (no Forgejo compat suffix).
            expect(findMatchingForge("https://git.rampin.org/alice/repo").name).toBe("Gitea instance");
            expect(findMatchingForge("https://repo.radio/alice/repo").name).toBe("Gitea instance");
            expect(findMatchingForge("https://git.fsfe.org/alice/repo").name).toBe("Gitea instance");
        });

        test("every domain matches at least one DEFAULT_FORGES entry", () => {
            for (const domain of BUILTIN_FORGE_DOMAINS) {
                // Use /alice/repo — /user/ is rejected by Gitea patterns
                const url = `https://${domain}/alice/repo`;
                const forge = findMatchingForge(url);
                expect(forge).not.toBeNull();
            }
        });

        test("is frozen", () => {
            expect(Object.isFrozen(BUILTIN_FORGE_DOMAINS)).toBe(true);
        });
    });
});
