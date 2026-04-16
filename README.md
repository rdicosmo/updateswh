# Update Software Heritage browser extension for Chrome, Firefox and Edge

This browser extension checks if a repository visited by the user is archived
and up to date in Software Heritage.

### What the extension does

A coloured button on the right edge of the page indicates the archival state
of the repository currently shown:

- **green** — archived and up to date; click opens the archive page
- **yellow** — archived but out of date; click triggers a save
- **grey** — not yet archived; click triggers a save
- **brown** — last archival visit did not complete; click retries
- **orange** — SWH rate limit reached (an access token can help)
- **red** — forge API request failed (private repo, wrong settings, …)
- **dashed outline** — the extension needs host permission for this forge;
  click the button to grant access

### Permissions

On first install the options page opens automatically.  Click **"Grant access
to all built-in forges"** to allow the extension to query the APIs of GitHub,
Bitbucket, GitLab and the other default forges.

You can grant or revoke individual forge permissions at any time from the
options page.  For self-hosted GitLab or Gitea instances, add the domain in
the options page and click **"Save custom forge domains"** — the browser will
prompt you for permission for each new domain.

The only host that is always required is `archive.softwareheritage.org` (the
SWH API).  All forge origins are optional and requested at runtime.

### Getting the extension for your browser

For the latest published version of the extension on Firefox Add-ons, the
Chrome Web Store, or Microsoft Edge Add-ons — and more detailed usage
instructions — see <https://www.softwareheritage.org/browser-extensions/>.

### Credits

Many thanks to the Unpaywall extension developers
(<https://unpaywall.org/products/extension>): their work was an essential
starting point for designing and developing this extension.

### Developer information

```
npm install
npm test                # jest unit tests (jsdom); 67 tests
npm run build           # build extension/updateswh.js + manifests
make                    # build + zip FireFox.zip / Chrome.zip / Edge.zip
```

The same source tree is used for Firefox (manifest v2) and for Chrome /
Microsoft Edge (manifest v3). `build/manifest-generator.js` emits both from a
single source (`src/manifest-base.json`); the `Makefile` runs the build and
reshuffles the manifests at package time.

See `CONTRIBUTING.md` for the architecture and for instructions on adding
support for a new forge technology.
