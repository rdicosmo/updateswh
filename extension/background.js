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

function browseraction(data,sender) {
    console.log("Got request to create tab", data,sender);
    if (data.type = "createtab") {
	browser.tabs.create({url: data.url})
    }
};

browser.runtime.onMessage.addListener(browseraction);


