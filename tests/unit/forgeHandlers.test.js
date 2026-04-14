import {
    DEFAULT_FORGES,
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

    describe("Gitea (codeberg.org as known instance)", () => {
        test("matches codeberg via known-list row", () => {
            const forge = findMatchingForge("https://codeberg.org/alice/repo");
            expect(forge).not.toBeNull();
            expect(forge.name).toBe("Gitea instance");
        });

        test("rejects non-repository codeberg URLs", () => {
            expect(findMatchingForge("https://codeberg.org/alice")).toBeNull();
            expect(findMatchingForge("https://codeberg.org/explore/")).toBeNull();
            expect(findMatchingForge("https://codeberg.org/user/foo")).toBeNull();
        });

        test("setup builds codeberg API url", () => {
            const forge = findMatchingForge("https://codeberg.org/alice/repo");
            const r = setupForge("https://codeberg.org/alice/repo", forge);
            expect(r.forgeapiurl).toBe("https://codeberg.org/api/v1/repos/alice/repo");
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
});
