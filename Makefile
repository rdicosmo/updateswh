.PHONY: clean all build test test-chrome e2e

all: clean build
	printf "Preparing FireFox.zip\n"
	(cd extension; zip -r ../FireFox.zip . -x manifest-v3.json)
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
