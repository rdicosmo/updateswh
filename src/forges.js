function pathFrom(projecturl) {
    return new URL(projecturl).pathname.substring(1);
}

function githubSetup(projecturl) {
    const userproject = pathFrom(projecturl);
    return {
        userproject,
        forgeapiurl: `https://api.github.com/repos/${userproject}`,
        lastupdate: (resp) => resp.pushed_at,
    };
}

function bitbucketSetup(projecturl) {
    const userproject = pathFrom(projecturl);
    return {
        userproject,
        forgeapiurl: `https://api.bitbucket.org/2.0/repositories/${userproject}`,
        lastupdate: (resp) => resp.updated_on,
    };
}

function gitlabDotComSetup(projecturl) {
    const userproject = encodeURIComponent(pathFrom(projecturl));
    return {
        userproject,
        forgeapiurl: `https://gitlab.com/api/v4/projects/${userproject}`,
        lastupdate: (resp) => resp.last_activity_at,
    };
}

function gitlabInstanceSetup(projecturl) {
    const origin = new URL(projecturl).origin;
    const userproject = encodeURIComponent(pathFrom(projecturl));
    return {
        userproject,
        forgeapiurl: `${origin}/api/v4/projects/${userproject}`,
        lastupdate: (resp) => resp.last_activity_at,
    };
}

function giteaInstanceSetup(projecturl) {
    const origin = new URL(projecturl).origin;
    const userproject = pathFrom(projecturl);
    return {
        userproject,
        forgeapiurl: `${origin}/api/v1/repos/${userproject}`,
        lastupdate: (resp) => resp.updated_at,
    };
}

// Gitee (gitee.com): GitHub-shaped URLs (/<owner>/<repo>), v5 REST API.
// Anonymous access is rate-limited but fine for per-page use; the
// response is same-origin from a content script running on gitee.com,
// so no CORS gymnastics. `pushed_at` is already an ISO timestamp.
function giteeSetup(projecturl) {
    const userproject = pathFrom(projecturl);
    return {
        userproject,
        forgeapiurl: `https://gitee.com/api/v5/repos/${userproject}`,
        lastupdate: (resp) => resp.pushed_at,
    };
}

// Pagure: https://pagure.io/<repo> (simple) or /<namespace>/<repo>
// (namespaced). API returns `date_modified` as a unix-seconds string,
// which we convert to an ISO timestamp so the existing date comparator
// works unchanged.
function pagureSetup(projecturl) {
    const userproject = pathFrom(projecturl);
    return {
        userproject,
        forgeapiurl: `https://pagure.io/api/0/${userproject}`,
        lastupdate: (resp) => {
            const secs = parseInt(resp.date_modified, 10);
            return Number.isFinite(secs) ? new Date(secs * 1000).toISOString() : null;
        },
    };
}

const GITLAB_KNOWN_DOMAINS  = ["0xacab.org", "gite.lirmm.fr", "framagit.org", "gricad-gitlab.univ-grenoble-alpes.fr"];
const GITEA_KNOWN_DOMAINS   = ["git.rampin.org", "repo.radio", "git.fsfe.org"];
// Forgejo preserves the Gitea /api/v1 surface, so the giteaInstanceSetup
// handler works against these unchanged — but they show up as "Forgejo"
// in the UI so users see what they actually use. Classification verified
// against each host's /api/v1/version string (Forgejo advertises a
// "+gitea-X.Y.Z" compat suffix; bare 1.x versions are Gitea).
const FORGEJO_KNOWN_DOMAINS = ["codeberg.org", "git.disroot.org", "git.minetest.land"];

const GITLAB_KNOWN  = GITLAB_KNOWN_DOMAINS.map(d => d.replace(/\./g, "\\.")).join("|");
const GITEA_KNOWN   = GITEA_KNOWN_DOMAINS.map(d => d.replace(/\./g, "\\.")).join("|");
const FORGEJO_KNOWN = FORGEJO_KNOWN_DOMAINS.map(d => d.replace(/\./g, "\\.")).join("|");

export const BUILTIN_FORGE_DOMAINS = Object.freeze([
    "github.com",
    "bitbucket.org",
    "gitlab.com",
    "gitee.com",
    "pagure.io",
    ...GITLAB_KNOWN_DOMAINS,
    ...GITEA_KNOWN_DOMAINS,
    ...FORGEJO_KNOWN_DOMAINS,
]);

// Domain → friendly type label, used by the options page to render
// the badge on each built-in forge row. Anything not in this map falls
// back to "built-in".
export const BUILTIN_DOMAIN_TYPES = Object.freeze({
    "github.com":        "GitHub",
    "api.github.com":    "GitHub",
    "bitbucket.org":     "Bitbucket",
    "api.bitbucket.org": "Bitbucket",
    "gitlab.com":        "GitLab",
    "gitee.com":         "Gitee",
    "pagure.io":         "Pagure",
    ...Object.fromEntries(GITLAB_KNOWN_DOMAINS.map(d => [d, "GitLab"])),
    ...Object.fromEntries(GITEA_KNOWN_DOMAINS.map(d => [d, "Gitea"])),
    ...Object.fromEntries(FORGEJO_KNOWN_DOMAINS.map(d => [d, "Forgejo"])),
});

export const DEFAULT_FORGES = Object.freeze([
    {
        name: "GitHub",
        pattern: /^https?:\/\/github\.com\/[^/]+\/[^/]+/,
        reject:  /^https?:\/\/github\.com\/(apps|features|marketplace|orgs|topics|collections|settings|([^/]+\/[^/]+\/search\?))/,
        setup: githubSetup,
    },
    {
        name: "Bitbucket",
        pattern: /^https?:\/\/bitbucket\.org\/[^/]+\/[^/]+/,
        reject:  /^https?:\/\/bitbucket\.org\/(dashboard\/|product\/|account\/signin)/,
        setup: bitbucketSetup,
    },
    {
        name: "GitLab",
        pattern: /^https?:\/\/gitlab\.com\/[^/]+\/[^/]+(\/[^-][^/]+)*/,
        reject:  /^https?:\/\/gitlab\.com\/explore\//,
        setup: gitlabDotComSetup,
    },
    {
        name: "Gitee",
        pattern: /^https?:\/\/gitee\.com\/[^/]+\/[^/]+/,
        reject:  /^https?:\/\/gitee\.com\/(explore|login|logout|signup|signin|api|organizations|users|notifications|dashboard|help|about|profile|settings|oauth|features|enterprises|gitee-pages)(\/|$|\?)/,
        setup: giteeSetup,
    },
    {
        name: "GitLab instance",
        pattern: new RegExp(`^https?:\\/\\/(${GITLAB_KNOWN})\\/[^/]+\\/[^/]+(\\/[^-][^/]+)*`),
        reject:  new RegExp(`^https?:\\/\\/(${GITLAB_KNOWN})\\/users\\/sign_in`),
        setup: gitlabInstanceSetup,
    },
    {
        name: "GitLab instance",
        pattern: /^https?:\/\/gitlab\.[^./]+\.[^./]+\/[^/]+\/[^/]+(\/[^-][^/]+)*/,
        reject:  /^https?:\/\/gitlab\.[^./]+\.[^./]+\/users\/sign_in/,
        setup: gitlabInstanceSetup,
    },
    {
        name: "Gitea instance",
        pattern: new RegExp(`^https?:\\/\\/(${GITEA_KNOWN})\\/[^/]+\\/[^/]+`),
        reject:  new RegExp(`^https?:\\/\\/(${GITEA_KNOWN})\\/(user|explore)\\/`),
        setup: giteaInstanceSetup,
    },
    {
        name: "Gitea instance",
        pattern: /^https?:\/\/(gitea\.[^./]+\.[^./]+)\/[^/]+\/[^/]+/,
        reject:  /^https?:\/\/(gitea\.[^./]+\.[^./]+)\/(user|explore)\//,
        setup: giteaInstanceSetup,
    },
    {
        // Forgejo shares Gitea's /api/v1 surface, so the setup is the
        // same — the distinct record just carries the correct name for
        // tooltips and logs.
        name: "Forgejo instance",
        pattern: new RegExp(`^https?:\\/\\/(${FORGEJO_KNOWN})\\/[^/]+\\/[^/]+`),
        reject:  new RegExp(`^https?:\\/\\/(${FORGEJO_KNOWN})\\/(user|explore)\\/`),
        setup: giteaInstanceSetup,
    },
    {
        // Pagure supports both /<repo> and /<namespace>/<repo>; the
        // pattern captures 1-or-2 path segments after the host.
        // Reject meta-paths (/user/, /groups/, etc.) and common repo
        // sub-paths (/<repo>/issues, /<repo>/pull-requests, …) so the
        // button doesn't try the API on an invalid project path.
        name: "Pagure",
        pattern: /^https?:\/\/pagure\.io\/[^/]+(\/[^/]+)?/,
        reject:  /^https?:\/\/pagure\.io\/(users?(\/|$)|groups?(\/|$)|admin(\/|$)|new(\/|$)|dashboard(\/|$)|login(\/|$)|logout(\/|$)|api(\/|$)|browse(\/|$)|api-swagger(\/|$)|documentation(\/|$)|about(\/|$)|search(\/|$)|static(\/|$)|[^/]+\/(issues|pull-requests|blob|commits|tree|settings|releases|forks|watchers|branches|tags|raw|stats|reports|docs)(\/|$|\?))/,
        setup: pagureSetup,
    },
]);

export function matches(forge, url) {
    if (!forge.pattern.test(url)) return false;
    if (forge.reject && forge.reject.test(url)) return false;
    return true;
}

export function findMatchingForge(url, handlers = DEFAULT_FORGES) {
    for (const forge of handlers) {
        if (matches(forge, url)) return forge;
    }
    return null;
}

export function setupForge(url, forge) {
    const projecturl = forge.pattern.exec(url)[0];
    return {
        projecturl,
        forgename: forge.name,
        ...forge.setup(projecturl),
    };
}

function escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function domainAlternation(domainsInput) {
    return domainsInput
        .split(/[\s,\n\r]+/)
        .filter(Boolean)
        .map(escapeForRegex)
        .join("|");
}

export function gitlabInstanceHandler(domainsInput) {
    const alt = domainAlternation(domainsInput);
    return {
        name: "GitLab instance",
        pattern: new RegExp(`^https?:\\/\\/(${alt})\\/[^/]+\\/[^/]+`),
        reject:  new RegExp(`^https?:\\/\\/(${alt})\\/users\\/sign_in`),
        setup: gitlabInstanceSetup,
    };
}

export function giteaInstanceHandler(domainsInput) {
    const alt = domainAlternation(domainsInput);
    return {
        name: "Gitea instance",
        pattern: new RegExp(`^https?:\\/\\/(${alt})\\/[^/]+\\/[^/]+`),
        reject:  new RegExp(`^https?:\\/\\/(${alt})\\/(user|explore)\\/`),
        setup: giteaInstanceSetup,
    };
}

export function buildForges({ gitlabs = "", giteas = "" } = {}) {
    const list = [...DEFAULT_FORGES];
    if (gitlabs.trim()) list.push(gitlabInstanceHandler(gitlabs));
    if (giteas.trim())  list.push(giteaInstanceHandler(giteas));
    return list;
}
