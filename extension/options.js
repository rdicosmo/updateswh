if (typeof (chrome) !== "undefined") {
    browser = chrome
}

/* ── Forge storage model ──

   Canonical: customForges = [{domain, type}]  (type: "gitlab" | "gitea").
   Derived:   customForgeOrigins = [pattern]   (cache for background injector).

   Legacy: gitlabs + giteas text blobs. One-shot migration on load.
*/

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

function migrateCustomForges(cb) {
    browser.storage.local.get({
        customForges: null,
        gitlabs: '',
        giteas: ''
    }, function (items) {
        if (Array.isArray(items.customForges)) { cb(items.customForges); return; }
        var list = [];
        parseDomainList(items.gitlabs).forEach(function (d) { list.push({ domain: d, type: 'gitlab' }); });
        parseDomainList(items.giteas).forEach(function (d) { list.push({ domain: d, type: 'gitea'  }); });
        browser.storage.local.set({
            customForges: list,
            customForgeOrigins: list.map(function (f) { return patternFromDomain(f.domain); })
        }, function () {
            browser.storage.local.remove(['gitlabs', 'giteas'], function () { cb(list); });
        });
    });
}

function writeCustomForges(list, cb) {
    browser.storage.local.set({
        customForges: list,
        customForgeOrigins: list.map(function (f) { return patternFromDomain(f.domain); })
    }, cb || function () {});
}

/* ── Row rendering ── */

function buildSlider(originPattern, onToggle) {
    var label = document.createElement('label');
    label.className = 'slider';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    var knob = document.createElement('span');
    knob.className = 'knob';
    label.appendChild(cb);
    label.appendChild(knob);

    browser.permissions.contains({ origins: [originPattern] }, function (has) {
        cb.checked = !!has;
    });

    cb.addEventListener('change', function () {
        if (cb.checked) {
            browser.permissions.request({ origins: [originPattern] }, function (granted) {
                cb.checked = !!granted;
                if (onToggle) onToggle(!!granted);
            });
        } else {
            browser.permissions.remove({ origins: [originPattern] }, function () {
                if (onToggle) onToggle(false);
            });
        }
    });

    return label;
}

function buildRow({ domain, typeLabel, originPattern, custom, onDelete }) {
    var row = document.createElement('div');
    row.className = 'forge-row';

    row.appendChild(buildSlider(originPattern));

    var domainEl = document.createElement('span');
    domainEl.className = 'forge-domain';
    domainEl.textContent = domain;
    row.appendChild(domainEl);

    var badge = document.createElement('span');
    badge.className = 'forge-badge ' + (custom ? 'custom' : 'builtin');
    badge.textContent = typeLabel;
    row.appendChild(badge);

    if (custom) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'forge-delete';
        del.title = 'Remove this custom forge';
        del.textContent = '×';
        del.addEventListener('click', function () {
            browser.permissions.remove({ origins: [originPattern] }, function () {
                if (onDelete) onDelete();
            });
        });
        row.appendChild(del);
    }

    return row;
}

function renderForgeList() {
    var container = document.getElementById('forge-list');
    container.innerHTML = '';

    var builtinOrigins = getOptionalOrigins().filter(function (o) { return o !== '<all_urls>'; });
    builtinOrigins.forEach(function (origin) {
        container.appendChild(buildRow({
            domain: domainFromPattern(origin),
            typeLabel: 'built-in',
            originPattern: origin,
            custom: false
        }));
    });

    migrateCustomForges(function (customList) {
        var seen = {};
        builtinOrigins.forEach(function (o) { seen[domainFromPattern(o)] = true; });

        customList.forEach(function (entry, index) {
            if (seen[entry.domain]) return; // skip duplicates of built-ins
            seen[entry.domain] = true;
            container.appendChild(buildRow({
                domain: entry.domain,
                typeLabel: entry.type === 'gitlab' ? 'GitLab' : 'Gitea',
                originPattern: patternFromDomain(entry.domain),
                custom: true,
                onDelete: function () {
                    var next = customList.filter(function (f) { return f.domain !== entry.domain; });
                    writeCustomForges(next, renderForgeList);
                }
            }));
        });

        updateBulkButton(builtinOrigins, customList);
    });
}

// Enable all: built-in forges + any custom forges the user has added
// via the popup or import.  Lets users accept the default (all on) in
// one click instead of flipping every slider individually.
function allForgeOrigins(builtinOrigins, customList) {
    var customOrigins = (customList || []).map(function (f) { return patternFromDomain(f.domain); });
    var out = builtinOrigins.slice();
    customOrigins.forEach(function (o) { if (out.indexOf(o) < 0) out.push(o); });
    return out;
}

function updateBulkButton(builtinOrigins, customList) {
    var btn = document.getElementById('grant-all-btn');
    var status = document.getElementById('permissions-status');
    var origins = allForgeOrigins(builtinOrigins, customList);
    if (!origins.length) {
        status.textContent = 'No forges configured.';
        btn.disabled = true;
        return;
    }
    var checked = 0;
    var granted = 0;
    origins.forEach(function (origin) {
        browser.permissions.contains({ origins: [origin] }, function (has) {
            if (has) granted++;
            checked++;
            if (checked === origins.length) {
                status.textContent = granted + ' / ' + origins.length + ' forges enabled.';
                if (granted === origins.length) {
                    btn.textContent = 'All forges enabled';
                    btn.disabled = true;
                } else {
                    btn.textContent = 'Enable all forges';
                    btn.disabled = false;
                }
            }
        });
    });
}

function enableAllForges() {
    var builtinOrigins = getOptionalOrigins().filter(function (o) { return o !== '<all_urls>'; });
    migrateCustomForges(function (customList) {
        var origins = allForgeOrigins(builtinOrigins, customList);
        if (!origins.length) { renderForgeList(); return; }
        browser.permissions.request({ origins: origins }, function (granted) {
            if (granted) flashStatus('All forge permissions granted.');
            renderForgeList();
        });
    });
}

/* ── Import / Export ── */

var pendingImport = null;

function triggerImport() {
    var input = document.getElementById('import-file');
    input.value = '';
    input.click();
}

function handleImportFile(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
        try {
            var data = JSON.parse(reader.result);
            var imported = normalizeImport(data);
            if (!imported.length) {
                flashStatus('Import file has no recognizable forge entries.');
                return;
            }
            showImportPreview(imported);
        } catch (e) {
            flashStatus('Import failed: ' + e.message);
        }
    };
    reader.readAsText(file);
}

function normalizeImport(data) {
    var out = [];
    if (Array.isArray(data && data.customForges)) {
        data.customForges.forEach(function (f) {
            if (f && f.domain && (f.type === 'gitlab' || f.type === 'gitea')) {
                out.push({ domain: f.domain, type: f.type });
            }
        });
    }
    // Legacy shape: {gitlabs: [...], giteas: [...]}
    if (Array.isArray(data && data.gitlabs)) {
        data.gitlabs.forEach(function (d) { out.push({ domain: d, type: 'gitlab' }); });
    }
    if (Array.isArray(data && data.giteas)) {
        data.giteas.forEach(function (d) { out.push({ domain: d, type: 'gitea' }); });
    }
    return out;
}

function showImportPreview(imported) {
    pendingImport = imported;
    var box = document.getElementById('import-preview');
    box.innerHTML = '';
    var h = document.createElement('p');
    h.textContent = 'About to import ' + imported.length + ' custom forge(s):';
    box.appendChild(h);
    var ul = document.createElement('ul');
    imported.forEach(function (f) {
        var li = document.createElement('li');
        li.textContent = f.domain + ' (' + f.type + ')';
        ul.appendChild(li);
    });
    box.appendChild(ul);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Grant and import';
    btn.addEventListener('click', commitImport);
    box.appendChild(btn);
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.style.marginLeft = '8px';
    cancel.addEventListener('click', function () {
        pendingImport = null;
        box.innerHTML = '';
    });
    box.appendChild(cancel);
}

function commitImport() {
    if (!pendingImport) return;
    var imported = pendingImport;
    migrateCustomForges(function (current) {
        var byDomain = {};
        current.forEach(function (f) { byDomain[f.domain] = f; });
        imported.forEach(function (f) { if (!byDomain[f.domain]) byDomain[f.domain] = f; });
        var merged = Object.keys(byDomain).map(function (d) { return byDomain[d]; });
        var origins = imported.map(function (f) { return patternFromDomain(f.domain); });

        browser.permissions.request({ origins: origins }, function (granted) {
            // Always store the merged list — denied entries stay in the list
            // with slider OFF so the user can retry later.
            writeCustomForges(merged, function () {
                pendingImport = null;
                document.getElementById('import-preview').innerHTML = '';
                flashStatus(granted
                    ? 'Imported ' + imported.length + ' forge(s); permissions granted.'
                    : 'Imported ' + imported.length + ' forge(s); permissions not granted — toggle each slider to retry.');
                renderForgeList();
            });
        });
    });
}

function buildExportPayload(list) {
    // Non-empty: plain payload; the file is self-describing because it
    // literally contains the entries.
    if (list.length) return { version: 1, customForges: list };
    // Empty: scaffold the file with a _comment + _example so the user (or
    // someone they share it with) can see the shape to fill in.  Both
    // underscore keys are ignored by normalizeImport.
    return {
        version: 1,
        _comment:
            'Add entries under "customForges". Each entry is {"domain": "<host>", "type": "gitlab" | "gitea"}. ' +
            'The "_example" key below shows the expected shape and is ignored on import.',
        _example: [
            { domain: 'git.example.org',   type: 'gitlab' },
            { domain: 'forge.example.net', type: 'gitea' }
        ],
        customForges: []
    };
}

function triggerExport() {
    migrateCustomForges(function (list) {
        var payload = buildExportPayload(list);
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'updateswh-forges.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        flashStatus(list.length
            ? 'Exported ' + list.length + ' custom forge(s).'
            : 'Exported an empty whitelist with an example (no custom forges configured).');
    });
}

/* ── Manual add of a custom forge ── */

// Normalize user-typed domain: strip scheme, trailing slashes, whitespace.
// Returns null if the result doesn't look like a hostname.
function normalizeDomain(input) {
    if (!input) return null;
    var d = String(input).trim();
    d = d.replace(/^https?:\/\//i, '');   // drop scheme
    d = d.replace(/\/.*$/, '');           // drop any path
    d = d.replace(/^\.+|\.+$/g, '');      // drop leading/trailing dots
    if (!d) return null;
    // Must contain at least one dot, no spaces, no illegal chars.
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(d)) return null;
    return d.toLowerCase();
}

function addCustomForge(rawDomain, type) {
    var domain = normalizeDomain(rawDomain);
    if (!domain) {
        flashStatus('Please enter a valid domain (e.g. git.example.org).');
        return;
    }
    migrateCustomForges(function (current) {
        if (current.some(function (f) { return f.domain === domain; })) {
            flashStatus(domain + ' is already in the list.');
            return;
        }
        var origin = patternFromDomain(domain);
        // Request permission *inside* the click gesture.  If the user
        // denies, don't add the entry — the options page is already open,
        // so there's no point in persisting an off-slider row the way the
        // import flow does.
        browser.permissions.request({ origins: [origin] }, function (granted) {
            if (!granted) {
                flashStatus('Permission denied for ' + domain + '.');
                return;
            }
            var next = current.concat([{ domain: domain, type: type }]);
            writeCustomForges(next, function () {
                document.getElementById('custom-forge-domain').value = '';
                flashStatus('Added ' + domain + ' as ' + (type === 'gitlab' ? 'GitLab' : 'Gitea') + '.');
                renderForgeList();
            });
        });
    });
}

function wireAddCustom() {
    var input = document.getElementById('custom-forge-domain');
    function submit(type) { addCustomForge(input.value, type); }
    document.getElementById('add-gitlab-btn').addEventListener('click', function () { submit('gitlab'); });
    document.getElementById('add-gitea-btn').addEventListener('click',  function () { submit('gitea');  });
    // Enter key defaults to GitLab (arbitrary but common choice); users who
    // want Gitea can click the button.
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit('gitlab'); }
    });
}

/* ── Status helper ── */

function flashStatus(msg, ms) {
    var status = document.getElementById('status');
    status.textContent = msg;
    setTimeout(function () { status.textContent = ''; }, ms || 2500);
}

/* ── Simple options (checkboxes + tokens) ── */

function save_options() {
    browser.storage.local.set({
        swhdebug:    document.getElementById('swh-debug').checked,
        showrequest: document.getElementById('showrequest').checked,
        swhtoken:    document.getElementById('swhtoken').value,
        ghtoken:     document.getElementById('ghtoken').value
    });
    flashStatus('Preferences saved.', 1000);
}

function restore_options() {
    browser.storage.local.get({
        swhdebug: false,
        showrequest: false,
        swhtoken: '',
        ghtoken: ''
    }, function (items) {
        document.getElementById('swh-debug').checked  = items.swhdebug;
        document.getElementById('showrequest').checked = items.showrequest;
        document.getElementById('swhtoken').value      = items.swhtoken || '';
        document.getElementById('ghtoken').value       = items.ghtoken || '';
    });
    renderForgeList();
}

/* Re-render when storage changes (e.g. popup added a custom forge) */
browser.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.customForges || changes.customForgeOrigins) {
        renderForgeList();
    }
});

document.addEventListener('DOMContentLoaded', function () {
    restore_options();
    document.getElementById('swh-debug').addEventListener('click', save_options);
    document.getElementById('showrequest').addEventListener('click', save_options);
    document.getElementById('swhtoken').addEventListener('input', save_options);
    document.getElementById('ghtoken').addEventListener('input', save_options);
    document.getElementById('grant-all-btn').addEventListener('click', enableAllForges);
    document.getElementById('import-btn').addEventListener('click', triggerImport);
    document.getElementById('export-btn').addEventListener('click', triggerExport);
    document.getElementById('import-file').addEventListener('change', handleImportFile);
    wireAddCustom();
});
