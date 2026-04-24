.PHONY: clean all build test test-chrome e2e

# Firefox gets the MV2 manifest today (manifest.json), Chrome/Edge get MV3
# (manifest-v3.json renamed to manifest.json in-zip). The Firefox-only
# identifying block (AMO gecko.id + data_collection_permissions) lives in
# build/firefox-gecko.json and is merged into the Firefox manifest at zip
# time, inside a throwaway temp dir so the main extension/ tree stays
# neutral. When Firefox switches to MV3, change FF_MANIFEST below.
#
# Requires `jq` at build time (Debian/Ubuntu: apt-get install jq).

FF_BUILD_DIR := extension-firefox-build
FF_MANIFEST  := manifest.json

all: clean build
	printf "Preparing FireFox.zip\n"
	rm -rf $(FF_BUILD_DIR)
	mkdir -p $(FF_BUILD_DIR)
	cp -r extension/* $(FF_BUILD_DIR)/
	rm -f $(FF_BUILD_DIR)/manifest-v3.json
	jq -s '.[0] * .[1]' extension/$(FF_MANIFEST) build/firefox-gecko.json > $(FF_BUILD_DIR)/$(FF_MANIFEST)
	(cd $(FF_BUILD_DIR); zip -r ../FireFox.zip .)
	rm -rf $(FF_BUILD_DIR)
	printf "Preparing Chrome.zip\n"
	(cd extension; zip -r ../Chrome.zip . -x manifest.json)
	printf "Use manifest v3 in Chrome.zip\n"
	printf "@ manifest-v3.json\n@=manifest.json\n" | zipnote -w Chrome.zip
	printf "Preparing Edge.zip (just a copy of Chrome.zip)\n"
	cp Chrome.zip Edge.zip

build:
	npm run build

clean:
	rm -f FireFox.zip Chrome.zip Edge.zip
	rm -rf $(FF_BUILD_DIR)
	rm -f extension/updateswh.js extension/manifest.json extension/manifest-v3.json

# Fast unit tier: jest + jsdom, no browser. Default check on every change.
test:
	npm test

# Legacy integration smoke tests (5 puppeteer scenarios, pre-e2e-harness).
# Superseded by `make e2e` but kept for now.
test-chrome:
	npm run test:chrome

# End-to-end tier: real Chromium, mocked forge + SWH.
# Run on PRs and before release, not on every local edit.
e2e:
	npm run test:e2e
