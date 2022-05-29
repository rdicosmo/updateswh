
if (chrome){
    browser = chrome
}


var devLog = function(str, obj){
    // FIXME: only log to console if we're in Chrome with Nerd Mode enabled.
    // if (settings && settings.showOaColor && navigator.userAgent.indexOf("Chrome") > -1){
        console.log("updateswh: " + str, obj)
    //}
}
devLog("updateswh is running")

// global variables:
var iframeIsInserted = false
var settings = {}
var myHost = window.location.hostname
var allSources = []

/***********************************************************************************
 *
 * Forge specifics
 *
 ************************************************************************************/

// FIXME: generalize with forge specific parameters
// we can abstract the computation of userproject and forgeapiurl, and replace "GH" in messages with the forge 'type'

function testupdateGitHub(url,pattern) {
    var projecturl=pattern.exec(url)[0]; // this is the url of the project
    var userproject=projecturl.replace(/http.*:\/\/github.com\//,""); // this is the user+project fragment
    var forgeapiurl = "https://api.github.com/repos/" + userproject;
    var swhapiurl = "https://archive.softwareheritage.org/api/1/origin/" + projecturl + "/visit/latest";
    var forgelastupdate = "";
    var swhlastupdate = "";
    var results = {
        projecturl: projecturl,
        isComplete: false,
        color: "black"
    }

    $.getJSON(forgeapiurl) // get last update time from GitHub
        .done(function(resp){
	    forgelastupdate = resp.updated_at;
            devLog("call to GH API returned: ", forgelastupdate);
	    $.getJSON(swhapiurl) // get last visit time from SWH <-- all this is generic, get it out from here!
		.done(function(resp){
		    swhlastupdate = resp.date;
		    devLog("call to SWH API returned: ", swhlastupdate);
		    if (swhlastupdate >= forgelastupdate) {results.color = "green"}
		    else {results.color = "yellow"}
		})
		.fail(function(resp){
		    devLog("call to SWH API failed", resp);
		    results.color="black";
		})
		.always(function(resp){
		    devLog("call to SWH API finished", resp);
		    results.isComplete=true;
		})
        })
	.fail(function(resp){
	    devLog("call to GH API failed", resp);
	    results.color="red";
	    results.isComplete=true;
        });
    return results;
}

// array of regex patterns to identify the project forge from the url
// associates forge type and handling function
// order is important: first match will be used!

// FIXME: generalize with forge specific parameters
// we can add the computation of userproject and forgeapiurl

var forgehandlers = [
    {pattern: /http.*:\/\/github.com\/[^\/]*\/[^\/]+/ , type: 'GitHub', handler: testupdateGitHub},
//    {pattern: /http.*:\/\/gitlab.com\/[^\/]*\/[^\/]+/ , type: 'GitLab', handler: testupdateGitLab},
//    {pattern: /http.*:\/\/[^\/]*gitlab[^\/]*\/[^\/]*\/[^\/]+/ , type: 'GitLab instance', handler: testupdateGitLab},
    ]

// Get the status of the repository by polling the results of the handler until
// its work is completed, then show the result with the iframe and quit.

function getandshowstatus(url,fh){
    var results = fh.handler(url,fh.pattern);
    var resultsChecker=setInterval(function(){
        if (results.isComplete){
	    // FIXME: update the DOM with the results based on the color, use following commented code as starting point
            //insertIframe(results.color, results.projecturl)
            clearInterval(resultsChecker) // stop polling
        }
    }, 250)
    return results;
}     

// to test ...
// getandshowstatus("https://github.com/rdicosmo/parmap",/http.*:\/\/github.com\/[^\/]*\/[^\/]+/,);
	



/***********************************************************************************
 *
 *  utility and UX functions
 *
 ************************************************************************************/


function insertIframe(name, url){
    var iframe = document.createElement('iframe');

    // make sure we are not inserting iframe again and again
    if (iframeIsInserted){
        return false
    }

    iframe.src = browser.runtime.getURL('updateswh.html');

    iframe.style.height = "50px";
    iframe.style.width = '50px';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.top = '33%';
    iframe.scrolling = 'no';
    iframe.style.border = '0';
    iframe.style.zIndex = '9999999999';
    iframe.style.display = 'none;'
    iframe.id = "updateswh";

    // set a custom name and URL
    iframe.name = name + "#" + encodeURI(url)

    document.documentElement.appendChild(iframe);
    iframeIsInserted = true
}


// from https://davidwalsh.name/get-absolute-url
var getAbsoluteUrl = (function() {
	var a;

	return function(url) {
		if(!url) return;
		if(!a) a = document.createElement('a');
		a.href = url;

		return a.href;
	};
})();

/***********************************************************************************
 *
 *  main method
 *
 ************************************************************************************/

function run() {
    // dispatch based on the current url
    var url = window.location.href;
    forgehandlers.every(function(fh){
        if (url.match(fh.pattern)) {
	    devLog("Match " + url + " with " + fh.type);
            getandshowstatus(url,fh);
	    return false
        } else {devLog("No match " + url + " on " + fh.type)}
    })
}
			 
function runWithSettings(){
    browser.storage.local.get(null, function(items){
        settings = items
        devLog("got settings", settings)
        run()
    });
}

// runWithSettings()


















