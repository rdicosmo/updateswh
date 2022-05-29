if (typeof chrome !== "undefined" && chrome){
    browser = chrome
}

function showWelcomePage(){
    browser.tabs.create({url: "https://softwareheritage.org/browser-extension"}, function (tab) {});
}

browser.runtime.onInstalled.addListener(function (object) {
    if(object.reason === 'install') {
        showWelcomePage()
    }
});
