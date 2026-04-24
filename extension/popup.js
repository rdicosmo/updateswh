if (chrome) {
    browser = chrome
}

function addForge(hostname, forgeType) {
    // Save to customForges array. permissions.request does not work
    // reliably from a popup (Firefox closes the popup on dialog), so
    // defer the grant to the options page (user clicks the slider).
    browser.storage.local.get({
        customForges: null,
        gitlabs: '',
        giteas: ''
    }, function (items) {
        var list = Array.isArray(items.customForges) ? items.customForges.slice() : [];
        // Migrate legacy storage if needed, so we don't lose entries.
        if (!Array.isArray(items.customForges)) {
            (items.gitlabs || '').split(/[\s,\n\r]+/).filter(Boolean).forEach(function (d) {
                list.push({ domain: d, type: 'gitlab' });
            });
            (items.giteas || '').split(/[\s,\n\r]+/).filter(Boolean).forEach(function (d) {
                list.push({ domain: d, type: 'gitea' });
            });
        }
        if (!list.some(function (f) { return f.domain === hostname; })) {
            list.push({ domain: hostname, type: forgeType });
        }
        var patterns = list.map(function (f) { return '*://' + f.domain + '/*'; });
        browser.storage.local.set({
            customForges: list,
            customForgeOrigins: patterns
        }, function () {
            browser.storage.local.remove(['gitlabs', 'giteas'], function () {
                browser.runtime.openOptionsPage();
                window.close();
            });
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

document.getElementById("addforgejo").addEventListener("click",
    function () {
        // Forgejo is a Gitea fork that preserves the Gitea API surface,
        // so it's handled by the same code path under the hood — we just
        // label it "Forgejo" in the options page so users see what they
        // actually use.
        browser.tabs.query(
            { 'active': true, 'lastFocusedWindow': true },
            function (tabs) {
                var url = new URL(tabs[0].url);
                addForge(url.hostname, 'forgejo');
            }
        )
    }
)
