#!/bin/sh
# Prints, as Markdown, what a failed store job of the Release workflow
# usually means and how to recover. The workflow appends it to the run
# summary when a store job fails:
#
#   sh build/store-failure-help.sh chrome|edge|firefox >> "$GITHUB_STEP_SUMMARY"
#
# The job log holds the store's own error message; match it against the
# causes below. Renewing a credential is described step by step in the
# maintainer's store setup notes.

set -eu

store=${1:-}

case "$store" in
chrome)
    cat <<'EOF'
## Chrome Web Store upload failed

| what the log shows | likely cause | fix |
|---|---|---|
| `invalid_grant` while refreshing the access token | `CHROME_REFRESH_TOKEN` is dead: unused for about 6 months, OAuth consent screen back in Testing (7-day tokens), or access revoked | create a new refresh token in the OAuth Playground, replace `CHROME_REFRESH_TOKEN` |
| `invalid_client`, or HTTP 401 | `CHROME_CLIENT_ID` or `CHROME_CLIENT_SECRET` wrong, or the OAuth client was deleted | create a client, replace both secrets and the refresh token |
| HTTP 403 | the Google account behind the token does not own the item, or `CHROME_PUBLISHER_ID` is wrong | check the publisher ID in the developer console settings |
| an error about the version | the store already holds this version or a higher one | nothing to retry: release a new version |
EOF
    ;;
edge)
    cat <<'EOF'
## Edge Add-ons upload failed

| what the log shows | likely cause | fix |
|---|---|---|
| HTTP 401 or 403 | `EDGE_API_KEY` expired (keys last about 72 days) or `EDGE_CLIENT_ID` wrong | Partner Center, Publish API, Create API credentials; replace `EDGE_API_KEY` |
| HTTP 404 | `EDGE_PRODUCT_ID` wrong | copy the product ID from the extension overview in Partner Center |
| `the package is not valid`, followed by the reasons | Edge's validation rejected the package | fix the cause in the code and release a new version |
| an upload already in progress | a previous submission is still being processed | wait, then re-run |
EOF
    ;;
firefox)
    cat <<'EOF'
## Firefox AMO job failed

| what the log shows | likely cause | fix |
|---|---|---|
| HTTP 401 or 403 | `FIREFOX_JWT_ISSUER` or `FIREFOX_JWT_SECRET` wrong or revoked | generate new credentials on the AMO API key page, replace both secrets |
| validation errors from the add-on linter | AMO rejected the package | fix the cause in the code and release a new version |
| an error about the version number | AMO already holds this version: the job checks first and skips the upload, so this should only happen on a race | nothing to upload; re-run to update the listing text |
| an error in "Set the AMO listing" | the upload went through but the description or release notes were not set | re-run the failed job, or edit them on the AMO version page |
EOF
    ;;
*)
    echo "usage: $0 chrome|edge|firefox" >&2
    exit 2
    ;;
esac

cat <<'EOF'

**Recover with "Re-run failed jobs" on this run.** It reruns only the failed
jobs and reuses this run's build. Do not start a new run with every store
ticked: it would upload again to the stores where this run succeeded.
EOF
