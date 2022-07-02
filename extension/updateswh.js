
if (chrome){
    browser = chrome
}


var devLog = function(str, obj){
    if (settings && settings.swhdebug){
        console.log("updateswh: " + str, obj)
    }
}
devLog("updateswh is running")

// global variables:
var iframeIsInserted = false
var settings = {}

/***********************************************************************************
 *
 * Generic code to check a project from a forge in the Software Heritage archive
 *
 * Color code:
 *  
 *    - red    : the forge API request fails on the project, typically for private projects
 *    - grey   : project unknown in Software Heritage
 *    - yellow : project known in Software Heritage, but changed since last visit
 *    - green  : project known in Software Heritage, not changed since last visit
 * 
 ************************************************************************************/

function testupdateforge(url,forgespecs) {
    var projecturl  = forgespecs.projecturl;
    var userproject = forgespecs.userproject;
    var forgeapiurl = forgespecs.forgeapiurl;
    var forgename   = forgespecs.forgename;
    var lastupdate  = forgespecs.lastupdate;
    
    // fixed parameters
    var swhapiurl = "https://archive.softwareheritage.org/api/1/origin/" + projecturl + "/visit/latest/";
    var forgelastupdate = "";
    var swhlastupdate = "";
    var results = {
        projecturl: projecturl,
        isComplete: false, // flag to record completion of the following code that is asynchronous
        color: "grey"
    }
    $.getJSON(forgeapiurl) // get repository information from the forge
        .done(function(resp){
	    forgelastupdate = lastupdate(resp);
            devLog("call to " + forgename + " API returned: ", forgelastupdate);
	    $.getJSON(swhapiurl)
		.done(function(resp){
		    swhlastupdate = resp.date;
		    devLog("call to SWH API returned: ", swhlastupdate);
		    if (swhlastupdate >= forgelastupdate) {results.color = "green"}
		    else {results.color = "yellow"}
		})
		.fail(function(resp, texstatus, error){
		    devLog("call to SWH API failed, status: " + texstatus + ", error: " + error + ".", resp);
		    results.color="grey"; // FIXME: analyze the reason of the failure before setting the color
		})
		.always(function(resp){
		    devLog("call to SWH API finished", resp);
		    results.isComplete=true;
		})
        })
	.fail(function(resp){
	    devLog("call to " + forgename + " API failed", resp);
	    results.color="red";
	    results.isComplete=true;
        });
    return results;
}

/***********************************************************************************
 *
 * Forge specifics
 *
 ************************************************************************************/

function setupGitHub(url,pattern,type){
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var userproject = projecturl.replace(/http.*:\/\/github.com\//,""); // this is the user+project fragment
    var forgeapiurl = "https://api.github.com/repos/" + userproject;
    return {
	projecturl : projecturl,
	userproject : userproject,
	forgeapiurl : forgeapiurl,
	forgename : type,
	lastupdate: (function (resp) {return resp.pushed_at})
    };
}

function setupGitLab(url,pattern,type){
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var userproject = encodeURIComponent(projecturl.replace(/http.*:\/\/gitlab.com\//,"")); // path-encoded user+project fragment
    var forgeapiurl = "https://gitlab.com/api/v4/projects/" + userproject;
    devLog("Setting up GitLab: " + type);
    return {
	projecturl : projecturl,
	userproject : userproject,
	forgeapiurl : forgeapiurl,
	forgename : type,
        lastupdate: (function (resp) {return resp.last_activity_at})
    };
}

function setupGitLabInstance(url,pattern,type){
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var forgeprotocol = projecturl.match(/^http[^:]*:\/\//);
    var forgebaseurl = forgeprotocol + projecturl.replace(forgeprotocol,"").replace(/\/.*/,"/");
    var userproject = encodeURIComponent(projecturl.replace(forgebaseurl,"")); // path-encoded user+project fragment
    var forgeapiurl = forgebaseurl + "api/v4/projects/" + userproject;
    devLog("Setting up GitLab instance at: " + forgebaseurl);
    return {
	projecturl : projecturl,
	userproject : userproject,
	forgeapiurl : forgeapiurl,
	forgename : type,
        lastupdate: (function (resp) {return resp.last_activity_at})
    };
}


// array of regex patterns to identify the project forge from the url
// associates forge type and handling function
// order is important: first match will be used!
// FIXME: complete setup functions

var forgehandlers = [
    {pattern: /^https?:\/\/github.com\/[^\/]*\/[^\/]+/ , type: 'GitHub', handler: setupGitHub },
    {pattern: /^https?:\/\/gitlab.com\/[^\/]*\/[^\/]+/ , type: 'GitLab', handler: setupGitLab },
    // heuristic: we handle gitlab.*.* as a GitLab instance
    {pattern: /^https?:\/\/gitlab.[^.]*.[^.]*\/[^\/]*\/[^\/]+/ , reject: "^https?:\/\/gitlab.[^.]*.[^.]*\/users\/sign_in" , type: 'GitLab instance', handler: setupGitLabInstance},
    ]

// Get the status of the repository by polling the results of the handler until
// its work is completed, then show the result with the iframe and quit.

function getandshowstatus(url,forgespecs){
    var results = testupdateforge(url,forgespecs);
    var resultsChecker=setInterval(function(){
        if (results.isComplete){
	    // display button using an iframe named with the color and the project url
            insertIframe(results.color, results.projecturl)
            clearInterval(resultsChecker) // stop polling
        }
    }, 250)
    return results;
}     

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

/***********************************************************************************
 *
 *  main method
 *
 ************************************************************************************/

// to test ...
// handle("https://github.com/rdicosmo/parmap");


function handle(url) {
    // dispatch based on the url
    var result = "";
    forgehandlers.every(function(fh){
        if (url.match(fh.pattern) && (fh.reject==null || ! url.match(fh.reject))) {
	    devLog("Match " + url + " with " + fh.type);
            result=getandshowstatus(url,fh.handler(url,fh.pattern,fh.type));
	    return false
        } else {devLog("No match " + url + " on " + fh.type); return true}
    });
    return result;
}

function run () {
    handle(window.location.href);
}
			 
function runWithSettings(){
    browser.storage.local.get(null, function(items){
        settings = items
        devLog("got settings", settings)
        run()
    });
}

runWithSettings()


















