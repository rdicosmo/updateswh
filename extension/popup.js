if (chrome) {
    browser = chrome
}

function addForge(hostname, forgeType) {
    var storageKey = forgeType === 'gitlab' ? 'gitlabs' : 'giteas';

    // Save the domain to storage, then open the options page so the
    // user can grant permission from there.  permissions.request does
    // not work reliably from a popup (Firefox closes the popup when
    // the permission dialog appears, losing the callback).
    browser.storage.local.get({
        [storageKey]: ''
    }, function (items) {
        var domains = items[storageKey];
        if (domains === null || domains === '') {
            domains = hostname;
        } else {
            // Avoid duplicates
            var list = domains.split(/[\s,\n\r]+/).filter(Boolean);
            if (list.indexOf(hostname) === -1) {
                domains = domains + '\n' + hostname;
            }
        }
        browser.storage.local.set({ [storageKey]: domains }, function () {
            browser.runtime.openOptionsPage();
            window.close();
        });
    });
}

document.getElementById("options").addEventListener("click",
    function () {
        browser.runtime.openOptionsPage();
	window.close()
    }
)

document.getElementById("homepage").addEventListener("click",
    function () {
        browser.tabs.create({
            url: "https://www.softwareheritage.org/updateswh-8-x/"
        });
	window.close()
    }
)

document.getElementById("addgitlab").addEventListener("click",
    function () {
        browser.tabs.query(
            { 'active': true, 'lastFocusedWindow': true },
            function (tabs) {
                var url = new URL(tabs[0].url);
                addForge(url.hostname, 'gitlab');
            }
        )
    }
)

document.getElementById("addgitea").addEventListener("click",
    function () {
        browser.tabs.query(
            { 'active': true, 'lastFocusedWindow': true },
            function (tabs) {
                var url = new URL(tabs[0].url);
                addForge(url.hostname, 'gitea');
            }
        )
    }
)
