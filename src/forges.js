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

const GITLAB_KNOWN_DOMAINS = ["0xacab.org", "gite.lirmm.fr", "framagit.org", "gricad-gitlab.univ-grenoble-alpes.fr"];
const GITEA_KNOWN_DOMAINS  = ["git.rampin.org", "codeberg.org", "git.disroot.org", "git.minetest.land", "repo.radio", "git.fsfe.org"];

const GITLAB_KNOWN = GITLAB_KNOWN_DOMAINS.map(d => d.replace(/\./g, "\\.")).join("|");
const GITEA_KNOWN  = GITEA_KNOWN_DOMAINS.map(d => d.replace(/\./g, "\\.")).join("|");

export const BUILTIN_FORGE_DOMAINS = Object.freeze([
    "github.com",
    "bitbucket.org",
    "gitlab.com",
    ...GITLAB_KNOWN_DOMAINS,
    ...GITEA_KNOWN_DOMAINS,
]);

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
