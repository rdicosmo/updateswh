if (typeof (chrome) !== "undefined") {
    browser = chrome
}

/* ── Forge permissions ── */

function getOptionalOrigins() {
    var manifest = browser.runtime.getManifest();
    return manifest.optional_host_permissions || manifest.optional_permissions || [];
}

function domainFromPattern(pattern) {
    var m = pattern.match(/^\*:\/\/([^/]+)\/\*$/);
    return m ? m[1] : pattern;
}

function patternFromDomain(domain) {
    return '*://' + domain + '/*';
}

function parseDomainList(text) {
    return (text || '').split(/[\s,\n\r]+/).filter(Boolean);
}

function refreshPermissionsUI() {
    var origins = getOptionalOrigins().filter(function (o) { return o !== '<all_urls>'; });
    if (!origins.length) return;

    // Use permissions.contains per origin rather than getAll() because
    // Firefox normalizes *:// patterns into separate http/https entries,
    // breaking direct string comparison.
    var statusEl = document.getElementById('permissions-status');
    var btn = document.getElementById('grant-all-btn');
    var container = document.getElementById('origin-list');
    if (!container) {
        container = document.createElement('div');
        container.id = 'origin-list';
        statusEl.parentNode.insertBefore(container, btn);
    }
    container.innerHTML = '';

    var grantedCount = 0;
    var checkedCount = 0;

    function updateSummary() {
        statusEl.textContent = grantedCount + ' / ' + origins.length + ' forge origins granted.';
        if (grantedCount === origins.length) {
            btn.textContent = 'All built-in forges granted';
            btn.disabled = true;
        } else {
            btn.textContent = 'Grant access to all built-in forges';
            btn.disabled = false;
        }
    }

    origins.forEach(function (origin) {
        browser.permissions.contains({ origins: [origin] }, function (has) {
            if (has) grantedCount++;
            checkedCount++;
            var row = document.createElement('div');
            row.className = 'forge-origin-row';
            var dot = document.createElement('span');
            dot.className = 'dot ' + (has ? 'granted' : 'missing');
            var label = document.createElement('span');
            label.textContent = domainFromPattern(origin);
            row.appendChild(dot);
            row.appendChild(label);
            container.appendChild(row);
            if (checkedCount === origins.length) {
                updateSummary();
                // Append custom forge rows after built-ins
                appendCustomRows(container);
            }
        });
    });

    function appendCustomRows(container) {
        // Build a set of built-in origins to avoid duplicates
        var builtinSet = {};
        origins.forEach(function (o) { builtinSet[o] = true; });

        browser.storage.local.get({ customForgeOrigins: [] }, function (items) {
            var custom = items.customForgeOrigins || [];
            custom.forEach(function (origin) {
                if (builtinSet[origin]) return; // skip built-in duplicates
                browser.permissions.contains({ origins: [origin] }, function (has) {
                    var row = document.createElement('div');
                    row.className = 'forge-origin-row';
                    var dot = document.createElement('span');
                    dot.className = 'dot ' + (has ? 'granted' : 'missing');
                    var label = document.createElement('span');
                    label.textContent = domainFromPattern(origin) + ' (custom)';
                    row.appendChild(dot);
                    row.appendChild(label);
                    container.appendChild(row);
                });
            });
        });
    }
}

function grantAllBuiltins() {
    var origins = getOptionalOrigins();
    browser.permissions.request({ origins: origins }, function (granted) {
        if (granted) {
            var status = document.getElementById('status');
            status.textContent = 'Forge permissions granted.';
            setTimeout(function () { status.textContent = ''; }, 2000);
        }
        refreshPermissionsUI();
    });
}

/* Content-script injection for custom forges is handled by the
   background script via tabs.onUpdated + tabs.executeScript.
   The options page only needs to request permission and save to
   storage; the background picks up customForgeOrigins changes. */

/* ── Custom forge save flow ── */

function commitForgeStorage(gitlabsText, giteasText) {
    var domains = parseDomainList(gitlabsText).concat(parseDomainList(giteasText));
    browser.storage.local.set({
        gitlabs: gitlabsText,
        giteas:  giteasText,
        customForgeOrigins: domains.map(patternFromDomain)
    });
}

function saveCustomForges() {
    var newGitlabs = parseDomainList(document.getElementById('gitlabs').value);
    var newGiteas  = parseDomainList(document.getElementById('giteas').value);
    var allNewDomains = newGitlabs.concat(newGiteas);
    console.log('[SWH options] saveCustomForges', { newGitlabs: newGitlabs, newGiteas: newGiteas });

    browser.storage.local.get({
        gitlabs: '',
        giteas: '',
        customForgeOrigins: []
    }, function (items) {
        // Determine "added" by comparing against customForgeOrigins
        // (actually registered domains), not gitlabs/giteas text.
        // The popup may have saved a domain to gitlabs without
        // requesting permission or registering a content script.
        var registeredOrigins = items.customForgeOrigins || [];
        var registeredSet = {};
        registeredOrigins.forEach(function (o) {
            registeredSet[domainFromPattern(o)] = true;
        });

        var oldGitlabs = parseDomainList(items.gitlabs);
        var oldGiteas  = parseDomainList(items.giteas);
        var oldDomains = oldGitlabs.concat(oldGiteas);
        var newSet = {};
        allNewDomains.forEach(function (d) { newSet[d] = true; });

        var added   = allNewDomains.filter(function (d) { return !registeredSet[d]; });
        var removed = oldDomains.filter(function (d) { return !newSet[d]; });
        console.log('[SWH options] diff', { added: added, removed: removed, registered: registeredOrigins });

        // Handle removed domains immediately
        removed.forEach(function (domain) {
            var origin = patternFromDomain(domain);
            console.log('[SWH options] removing', domain, origin);
            browser.permissions.remove({ origins: [origin] }, function () {});
        });

        // Handle added domains — request permission (user gesture context)
        if (added.length > 0) {
            var addedOrigins = added.map(patternFromDomain);
            console.log('[SWH options] requesting permission for', addedOrigins);
            browser.permissions.request({ origins: addedOrigins }, function (granted) {
                console.log('[SWH options] permission result:', granted);
                var status = document.getElementById('status');
                if (granted) {
                    // Save only after permission confirmed
                    commitForgeStorage(
                        document.getElementById('gitlabs').value,
                        document.getElementById('giteas').value
                    );
                    // Background script handles injection via tabs.onUpdated
                    status.textContent = 'Custom forges saved and permissions granted. Reload forge pages to activate.';
                } else {
                    // User denied — strip denied domains, save the rest
                    var deniedSet = {};
                    added.forEach(function (d) { deniedSet[d] = true; });
                    var keptGitlabs = newGitlabs.filter(function (d) { return !deniedSet[d]; });
                    var keptGiteas  = newGiteas.filter(function (d) { return !deniedSet[d]; });
                    document.getElementById('gitlabs').value = keptGitlabs.join('\n');
                    document.getElementById('giteas').value  = keptGiteas.join('\n');
                    commitForgeStorage(keptGitlabs.join('\n'), keptGiteas.join('\n'));
                    status.textContent = 'Permission denied — domains removed.';
                }
                setTimeout(function () { status.textContent = ''; }, 2000);
                refreshPermissionsUI();
            });
        } else {
            // No new domains — just save removals
            commitForgeStorage(
                document.getElementById('gitlabs').value,
                document.getElementById('giteas').value
            );
            console.log('[SWH options] no new domains, saved removals only');
            var status = document.getElementById('status');
            status.textContent = 'Custom forges saved.';
            setTimeout(function () { status.textContent = ''; }, 1000);
            refreshPermissionsUI();
        }
    });
}

/* ── Save / restore options ── */

function save_options() {
    var swhdebug = document.getElementById('swh-debug').checked;

    browser.storage.local.set({
        swhdebug: swhdebug
    })

    var showrequest = document.getElementById('showrequest').checked;

    browser.storage.local.set({
        showrequest: showrequest
    })

    var swhtoken = document.getElementById('swhtoken').value;

    browser.storage.local.set({
        swhtoken: swhtoken
    })

    var ghtoken = document.getElementById('ghtoken').value;

    browser.storage.local.set({
        ghtoken: ghtoken
    })

    var status = document.getElementById('status');
    status.textContent = 'Preferences saved.';

    setTimeout(function () {
        status.textContent = ''
    }, 1000)
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    browser.storage.local.get({
        swhdebug: false
    }, function (items) {
        document.getElementById('swh-debug').checked = items.swhdebug;
    });
    browser.storage.local.get({
        showrequest: false
    }, function (items) {
        document.getElementById('showrequest').checked = items.showrequest;
    });
    browser.storage.local.get({
        swhtoken: null
    }, function (items) {
        document.getElementById('swhtoken').value = items.swhtoken;
    });
    browser.storage.local.get({
        ghtoken: null
    }, function (items) {
        document.getElementById('ghtoken').value = items.ghtoken;
    });
    browser.storage.local.get({
        gitlabs: null
    }, function (items) {
        document.getElementById('gitlabs').value = items.gitlabs;
    });
    browser.storage.local.get({
        giteas: null
    }, function (items) {
        document.getElementById('giteas').value = items.giteas;
    });
    refreshPermissionsUI();
}


// Re-read forge textareas when storage changes (e.g. popup added a domain)
browser.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.gitlabs || changes.giteas) {
        if (changes.gitlabs && changes.gitlabs.newValue !== undefined) {
            document.getElementById('gitlabs').value = changes.gitlabs.newValue;
        }
        if (changes.giteas && changes.giteas.newValue !== undefined) {
            document.getElementById('giteas').value = changes.giteas.newValue;
        }
        refreshPermissionsUI();
    }
});

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('swh-debug').addEventListener('click',
    save_options);
document.getElementById('showrequest').addEventListener('click',
    save_options);
document.getElementById('swhtoken').addEventListener('input',
    save_options);
document.getElementById('ghtoken').addEventListener('input',
    save_options);
document.getElementById('grant-all-btn').addEventListener('click',
    grantAllBuiltins);
document.getElementById('save-forges-btn').addEventListener('click',
    saveCustomForges);
