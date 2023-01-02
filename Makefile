.PHONY: clean all

all: clean
	printf "Preparing FireFox.zip\n"
	(cd extension; zip -r ../FireFox.zip . -x manifest-v3.json)
	printf "Preparing Chrome.zip\n"
	(cd extension; zip -r ../Chrome.zip . -x manifest.json)
	printf "Use manifest v3 in Chrome.zip\n"
	printf "@ manifest-v3.json\n@=manifest.json\n" | zipnote -w Chrome.zip
	printf "Preparing Edge.zip (just a copy of Chrome.zip)\n"
	cp Chrome.zip Edge.zip

clean:
	rm -f FireFox.zip Chrome.zip
