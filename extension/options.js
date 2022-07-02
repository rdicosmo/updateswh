if (typeof(chrome) !== "undefined"){
    browser = chrome
}

function save_options() {
    console.log("click")

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

    var status = document.getElementById('status');
    status.textContent = 'Preferences saved.';

    setTimeout(function(){
        status.textContent = ''
    }, 1000)
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    browser.storage.local.get({
        swhdebug: false
    }, function(items) {
        document.getElementById('swh-debug').checked = items.swhdebug;
    });
    browser.storage.local.get({
        showrequest: false
    }, function(items) {
        document.getElementById('showrequest').checked = items.showrequest;
    });
    browser.storage.local.get({
        swhtoken: null
    }, function(items) {
        document.getElementById('swhtoken').value = items.swhtoken;
    });
}


document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('swh-debug').addEventListener('click',
    save_options);
document.getElementById('showrequest').addEventListener('click',
    save_options);
document.getElementById('swhtoken').addEventListener('input',
    save_options);
