.PHONY: clean all build test test-chrome

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

test:
	npm test

test-chrome:
	npm run test:chrome

clean:
	rm -f FireFox.zip Chrome.zip Edge.zip
	rm -f extension/updateswh.js extension/manifest.json extension/manifest-v3.json
