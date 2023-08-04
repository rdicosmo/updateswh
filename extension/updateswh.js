
const COLOR_CODES = {
  UP_TO_DATE: "green",
  OUT_OF_DATE: "yellow",
  FAILED_UPDATE: "brown",
  API_LIMIT: "orange",
  NOT_ARCHIVED: "grey",
  FORGE_API_ERROR: "red",
};
if (chrome) {
    browser = chrome
}


var devLog = function (str, obj) {
    if (settings && settings.swhdebug) {
        console.log("updateswh: " + str, obj);
    }
}

// global variables:
var settings = {};
var swhsaverequested = "";

// wrapping setTimeout into a promise, based on
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises
var sleep = (ms) => {
    devLog(`sleeping for: ${ms} milliseconds`);
    return new Promise(resolve => {
        setTimeout(function() {
            resolve();
            console.log(`continuing after: ${ms} milliseconds`);
        }, ms);
    });
}


/***********************************************************************************
 *
 * Generic code to check a project from a forge in the Software Heritage archive
 *
 * Color code:
 *
 *    - red    : the forge API request fails on the project, typically for private projects
 *    - orange : the forge API request fails because we hit the rate limit
 *    - grey   : project unknown in Software Heritage
 *    - brown  : project known in Software Heritage, but last visit failed
 *    - yellow : project known in Software Heritage, but changed since last visit
 *    - green  : project known in Software Heritage, not changed since last visit
 *
 ************************************************************************************/

var lastprojecturl=null;
var lastresults=null;

function testupdateforge(url, forgespecs) {
    //cache calls
    if (forgespecs.projecturl==lastprojecturl) {
	devLog("Cache result of call to testupdateforge: "+lastprojecturl);
	return lastresults;
    } else {
	var projecturl = forgespecs.projecturl;
	var userproject = forgespecs.userproject;
	var forgeapiurl = forgespecs.forgeapiurl;
	var forgename = forgespecs.forgename;
	var lastupdate = forgespecs.lastupdate;

        // update cached values
	lastprojecturl=projecturl;
	
	// fixed parameters
	var swhapiurl = "https://archive.softwareheritage.org/api/1/origin/" + projecturl + "/visit/latest/";
	var forgelastupdate = null;
	var swhlastupdate = null;
	var results = {
            projecturl: projecturl,
            isComplete: false, // flag to record completion of the following code that is asynchronous
            color: COLOR_CODES.NOT_ARCHIVED,
	    swhlastupdate: null,
	    forgelastupdate: null,
	};
	$.ajax({ // get repository information from the forge
            url: forgeapiurl,
            dataType: "json",
            type: 'GET',
            beforeSend: function (xhr) { // add GitHub token if possible
		if (settings.ghtoken && forgename == "GitHub") {
                    xhr.setRequestHeader('Authorization', 'Bearer ' + settings.ghtoken);
		    devLog("Added GH token");
		}
            }
	})
            .done(function (resp) {
		forgelastupdate = lastupdate(resp);
		results.forgelastupdate=forgelastupdate;
		devLog("call to " + forgename + " API returned: ", forgelastupdate);
		$.ajax({
                    url: swhapiurl,
                    dataType: "json",
                    type: 'GET',
                    beforeSend: function (xhr) {
                        if (settings.swhtoken) {
                            xhr.setRequestHeader('Authorization', 'Bearer ' + settings.swhtoken);
                        }
                    }
                })
                    .done(function (resp) {
			swhlastupdate = resp.date;
			devLog("call to SWH API returned: ", swhlastupdate);
			results.swhlastupdate=swhlastupdate;
			if (swhlastupdate >= forgelastupdate) {
                            results.color = COLOR_CODES.UP_TO_DATE;
			} else {
                            results.color = COLOR_CODES.OUT_OF_DATE;
			};
			if (resp.status !="full") { // last update did not succeed
			    results.color = COLOR_CODES.FAILED_UPDATE;        // let's warn the user
			}
                    })
                    .fail(function (xhr, texstatus, error) {
			devLog("call to SWH API failed, status: " + texstatus + ", error: " + error + ".", xhr);
		    if (xhr.status == 403) { // it seems we ran out of steam on the SWH API
			results.color = COLOR_CODES.API_LIMIT; // let's warn the user
		    } else {
			results.color = COLOR_CODES.NOT_ARCHIVED;}
                    })
                    .always(function (resp) {
			devLog("call to SWH API finished", resp);
			results.isComplete = true;
                    });
            })
            .fail(function (resp) {
		devLog("call to " + forgename + " API failed", resp);
		if (resp.status == 403) { // it seems we ran out of steam on the forge API
		    results.color = COLOR_CODES.API_LIMIT; // let's warn the user
                    devLog("Setting color to orange");
		} else {
		    results.color = COLOR_CODES.FORGE_API_ERROR;}
		results.isComplete = true;
            });
	lastresults=results;
	return results;
    }
}

/***********************************************************************************
 *
 * Forge specifics
 *
 ************************************************************************************/

function setupGitHub(url, pattern, type) {
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var userproject = new URL(projecturl).pathname.substring(1); // this is the user+project fragment
    var forgeapiurl = "https://api.github.com/repos/" + userproject;
    return {
        projecturl: projecturl,
        userproject: userproject,
        forgeapiurl: forgeapiurl,
        forgename: type,
        lastupdate: (function (resp) {
            return resp.pushed_at;
        })
    };
}

function setupBitbucket(url, pattern, type) {
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var userproject = new URL(projecturl).pathname.substring(1); // this is the user+project fragment
    var forgeapiurl = "https://api.bitbucket.org/2.0/repositories/" + userproject;
    return {
        projecturl: projecturl,
        userproject: userproject,
        forgeapiurl: forgeapiurl,
        forgename: type,
        lastupdate: (function (resp) {
            return resp.updated_on;
        })
    };
}

function setupGitLab(url, pattern, type) {
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var userproject = encodeURIComponent(new URL(projecturl).pathname.substring(1)); // path-encoded user+project fragment
    var forgeapiurl = "https://gitlab.com/api/v4/projects/" + userproject;
    devLog("Setting up GitLab: " + type);
    return {
        projecturl: projecturl,
        userproject: userproject,
        forgeapiurl: forgeapiurl,
        forgename: type,
        lastupdate: (function (resp) {
            return resp.last_activity_at;
        })
    };
}

function setupGitLabInstance(url, pattern, type) {
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var forgebaseurl = new URL(projecturl).origin;
    var userproject = encodeURIComponent(new URL(projecturl).pathname.substring(1)); // path-encoded user+project fragment
    var forgeapiurl = forgebaseurl + "/api/v4/projects/" + userproject;
    devLog("Setting up GitLab instance at: " + forgebaseurl);
    return {
        projecturl: projecturl,
        userproject: userproject,
        forgeapiurl: forgeapiurl,
        forgename: type,
        lastupdate: (function (resp) {
            return resp.last_activity_at;
        })
    };
}

function setupGiteaInstance(url, pattern, type) {
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var forgebaseurl = new URL(projecturl).origin;
    var userproject = new URL(projecturl).pathname.substring(1); // user+project fragment
    var forgeapiurl = forgebaseurl + "/api/v1/repos/" + userproject;
    devLog("Setting up Gitea instance at: " + forgebaseurl);
    return {
        projecturl: projecturl,
        userproject: userproject,
        forgeapiurl: forgeapiurl,
        forgename: type,
        lastupdate: (function (resp) {
            return resp.updated_at;
        })
    };
}


// array of regex patterns to identify the project forge from the url
// associates forge type and handling function
// the reject regex allows to filter out urls that are surely not project ones
// order is important: first match will be used!

var forgehandlers = [{
        pattern: /^https?:\/\/github\.com\/[^\/]+\/[^\/]+/,
        reject:  /^https?:\/\/github\.com\/(apps|features|marketplace|orgs|topics|collections|settings|([^\/]+\/[^\/]+\/search\?))/,
        type: 'GitHub',
        handler: setupGitHub
    },
    {
        pattern: /^https?:\/\/bitbucket\.org\/[^\/]+\/[^\/]+/,
        reject:  /^https?:\/\/bitbucket\.org\/(dashboard\/|product\/|account\/signin)/,
        type: 'Bitbucket',
        handler: setupBitbucket
    },
    {
        pattern: /^https?:\/\/gitlab\.com\/[^\/]+\/[^\/]+(\/[^-][^\/]+)*/,
        reject:  /^https?:\/\/gitlab\.com\/explore\//,
        type: 'GitLab',
        handler: setupGitLab
    },
    // hardcoded list of gitlab instances		     
    {
        pattern: /^https?:\/\/(0xacab\.org|gite\.lirmm\.fr|framagit\.org|gricad-gitlab\.univ-grenoble-alpes\.fr)\/[^\/]+\/[^\/]+(\/[^-][^\/]+)*/,
        reject:  /^https?:\/\/(0xacab\.org|gite\.lirmm\.fr|framagit\.org|gricad-gitlab\.univ-grenoble-alpes\.fr)\/users\/sign_in/,
        type: 'GitLab instance',
        handler: setupGitLabInstance
    },
    // heuristic: we handle gitlab.*.* as a GitLab instance
    {
        pattern: /^https?:\/\/gitlab\.[^.\/]+\.[^.\/]+\/[^\/]+\/[^\/]+(\/[^-][^\/]+)*/,
        reject:  /^https?:\/\/gitlab\.[^.\/]+\.[^.\/]+\/users\/sign_in/,
        type: 'GitLab instance',
        handler: setupGitLabInstance
    },
    // hardcoded list of gitea instances
    {
        pattern: /^https?:\/\/(git\.rampin\.org|codeberg\.org|git\.disroot\.org|git\.minetest\.land|repo\.radio|git\.fsfe\.org)\/[^\/]+\/[^\/]+/,
        reject:  /^https?:\/\/(git\.rampin\.org|codeberg\.org|git\.disroot\.org|git\.minetest\.land|repo\.radio|git\.fsfe\.org)\/(user|explore)\//,
        type: 'Gitea instance',
        handler: setupGiteaInstance
    },
    // heuristic: we handle gitea.*.* as a Gitea instance
    {
        pattern: /^https?:\/\/(gitea\.[^.\/]+\.[^.\/]+)\/[^\/]+\/[^\/]+/,
        reject:  /^https?:\/\/(gitea\.[^.\/]+\.[^.\/]+)\/(user|explore)\//,
        type: 'Gitea instance',
        handler: setupGiteaInstance
    },
]

function updategitlabhandlers(domains){
    var domainexpr =
	domains
	.replace(/ /g, "") // sanitize input
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape for regexp
	.replace(/[\n\r]/g, "|"); // turn multiple domains into alternation
    var addrecord  =
	{
            pattern: RegExp("^https?:\/\/("+domainexpr+")\/[^\/]+\/[^\/]+"),
            reject:  RegExp("^https?:\/\/("+domainexpr+")\/users\/sign_in"),
            type: 'GitLab instance',
            handler: setupGitLabInstance
	};
    forgehandlers.push(addrecord);
    devLog("updated GitLab instances", forgehandlers);
    return
};

function updategiteahandlers(domains){
    var domainexpr =
	domains
	.replace(/ /g, "") // sanitize input
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape for regexp
	.replace(/[\n\r]/g, "|"); // turn multiple domains into alternation
    var addrecord  =
	{
            pattern: RegExp("^https?:\/\/("+domainexpr+")\/[^\/]+\/[^\/]+"),
            reject:  RegExp("^https?:\/\/("+domainexpr+")\/(users|explore)\/"),
            type: 'Gitea instance',
            handler: setupGiteaInstance
	};
    forgehandlers.push(addrecord);
    devLog("updated Gitea instances", forgehandlers);
    return
};


// Get the status of the repository by polling the results of the handler until
// its work is completed, then show the result with the save icon and quit.

function getandshowstatus(url, forgespecs) {
    if ($(".swh-save-button").length &&
	!$(".swh-save-button").hasClass('orange')) {
	devLog("getandshowstatus skipping: icon present, and not API limit overflow");
	return
    } else { // no icon, or we had an API limit overflow: let's run
	var results = testupdateforge(url, forgespecs);
	var resultsChecker = setInterval(function () {
            if (results.isComplete) {
		// display button using an icon named with the color and the project url
		devLog("Calling InsertSaveIcon with: ",results);
		insertSaveIcon(results);
		clearInterval(resultsChecker) // stop polling
            }
	}, 250);
	return results;
    }
}

/***********************************************************************************
 *
 *  utility and UX functions
 *
 ************************************************************************************/

function mouse3click(event,url){
    switch (event.which) {
    case 1:
	break;
    case 2:
	break;
    case 3:
        devLog("Showing request status in a new tab");
        browser.runtime.sendMessage({
            "type": "createtab",
            "url": url
        });
	break;
    default:
	break;
    }
};


function insertSaveIcon(results) {
    devLog("Inside insertSaveIcon");
    var color=results.color;
    var url=results.projecturl;
    if (results.forgelastupdate){
	var forgelastupdate=(results.forgelastupdate).split('T')[0];
    }
    if (results.swhlastupdate){
	var swhlastupdate=(results.swhlastupdate).split('T')[0];
    }
    // make sure we are not inserting icon again and again
    if ($(".swh-save-button").length) {
       devLog("Icon already present, skipping insertion on page for: " + url);
       return
    } else {
       devLog("Inserting icon for: " + url);
    }

    var saveButton = $(
        '<div class="swh-save-button">' +
        '   <div class="swh-save-icon">' +
        '       <svg xmlns="http://www.w3.org/2000/svg" height="3em" viewBox="0 0 448 512"><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path d="M48 96V416c0 8.8 7.2 16 16 16H384c8.8 0 16-7.2 16-16V170.5c0-4.2-1.7-8.3-4.7-11.3l33.9-33.9c12 12 18.7 28.3 18.7 45.3V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96C0 60.7 28.7 32 64 32H309.5c17 0 33.3 6.7 45.3 18.7l74.5 74.5-33.9 33.9L320.8 84.7c-.3-.3-.5-.5-.8-.8V184c0 13.3-10.7 24-24 24H104c-13.3 0-24-10.7-24-24V80H64c-8.8 0-16 7.2-16 16zm80-16v80H272V80H128zm32 240a64 64 0 1 1 128 0 64 64 0 1 1 -128 0z"/></svg>        ' +
        '   </div>' +
        '</div>');

    $('body').append(saveButton);

    var swhhelp = "https://www.softwareheritage.org/browser-extension/#missingrepo"; // documentation about missing repositories (typically private ones)
    var swhurl = "https://archive.softwareheritage.org/browse/origin/directory/?origin_url=" + encodeURI(url);
    var swhsaveurl = "https://archive.softwareheritage.org/api/1/origin/save/git/url/" + encodeURI(url) + "/";
    var swhsavelisturl = "https://archive.softwareheritage.org/save/list/";
    
    if (color == COLOR_CODES.UP_TO_DATE) { // everything is up to date!
        $(".swh-save-button")
	    .attr("title", 'Good news: archive is up to date!\n' +
		  'Last visit on: ' + swhlastupdate +
		 "\nClick to open the archive page.")
            .wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
            .parent()
            .attr("href", swhurl);
    } else if (color == COLOR_CODES.FORGE_API_ERROR) { // we did not find this project (probably a private project)
        $(".swh-save-button")
	    .attr("title", 'Could not get information:\nprivate repository?\nnon repository GitLab path?\nwrong values in setting?')
            .wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
            .parent()
            .attr("href", swhhelp);
    } else if (color == COLOR_CODES.API_LIMIT) { // we hit the rate limit
        $(".swh-save-button")
	    .attr("title", 'Cannot trigger archival!\nIs archive.softwareheritage.org in maintenance?\nIf not, you used up the API call quota.\nClick to read more on the help page.')
            .wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
            .parent()
            .attr("href", swhhelp);
    } else { // we propose to save the project
	if (color==COLOR_CODES.OUT_OF_DATE) {
	    $(".swh-save-button").
		mousedown(function(e) {mouse3click(e,swhurl)}).
		attr("title",'Archival copy is not current.\n'+
		     'Last changed  on ' + forgelastupdate + '.\n' +
		     'Last archival on ' + swhlastupdate + '.\n' +
		     'Click to trigger an update\n' +
		     'Right click to view last archival');}
	else if (color==COLOR_CODES.NOT_ARCHIVED) {
	    $(".swh-save-button").
		attr("title",'Not yet archived.\nClick to trigger archival');}
	else if (color==COLOR_CODES.FAILED_UPDATE) {
	    $(".swh-save-button").
		mousedown(function(e) {mouse3click(e,swhurl)}).
		attr("title",'Last archival tried on ' + swhlastupdate +
		     ' failed.\n' +
		     'Click to try again, but beware:\n' +
		     'there may be technical issues\n' +
		     'that prevent archival at the moment.\n' +
		     'Right click to view last archival');}
	else {$(".swh-save-button").attr("title",'');};
        $(".swh-save-button").click(function () {
            if (swhsaverequested!=swhsaveurl) { // ensure we only request saving once for each project
                $.ajax({
                        url: swhsaveurl,
                        dataType: "json",
                        type: 'POST',
                        beforeSend: function (xhr) {
                            if (settings.swhtoken) {
                                xhr.setRequestHeader('Authorization', 'Bearer ' + settings.swhtoken);
                            }
                        }
                    })
                    .done(function (resp) {
                        swhsaverequested = swhsaveurl;
                        $(".swh-save-button")
			    .removeClass(COLOR_CODES.OUT_OF_DATE)
			    .removeClass(COLOR_CODES.FAILED_UPDATE)
			    .removeClass(COLOR_CODES.NOT_ARCHIVED)
			    .addClass("lightgreen")
			    .removeAttr("title")
			    .attr("title", 'SWH update requested already!\n' +
				  'Click to go to the request status page.\n' +
				  'The archival takes a few minutes, and the\n'+
				  'button may not be up to date in the meantime.')
			    .wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
			    .parent()
			    .attr("href", swhsavelisturl);
                        devLog("Successful " + swhsaveurl);
                        if (settings && settings.showrequest) {
                            devLog("Showing request status in a new tab");
                            browser.runtime.sendMessage({
                                "type": "createtab",
                                "url": swhsavelisturl
                            });
                        };
                        //browser.tabs.create({url: "https://archive.softwareheritage.org/save/list/"})}; // not accessible on FF
                    })
                    .fail(function (resp, texstatus, error) {
                        $(".swh-save-button")
			    .removeClass(COLOR_CODES.OUT_OF_DATE)
			    .removeClass(COLOR_CODES.FAILED_UPDATE)
			    .removeClass(COLOR_CODES.NOT_ARCHIVED)
			    .addClass(COLOR_CODES.FORGE_API_ERROR)
			    .removeAttr("title")
			    .attr("title",
				  'Archival failed:' +
				  texstatus +
				  '.\nError: ')
			    .wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
			    .parent()
			    .attr("href", swhhelp);
                        devLog("Call to SWH save API failed, status: " + texstatus + ", error: " + error + ".", resp);
                        devLog("Failed on url " + swhsaveurl);
                    })
                    .always(function (resp) {
                        devLog("Completed " + swhsaveurl);
                    });
            }
        });
    }

    $(".swh-save-button").fadeIn();

    $(".swh-save-button").addClass(color);

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
    forgehandlers.every(function (fh) {
        if (url.match(fh.pattern) && (fh.reject == null || !url.match(fh.reject))) {
            devLog("Match " + url + " with " + fh.type);
            result = getandshowstatus(url, fh.handler(url, fh.pattern, fh.type));
            return false
        } else {
            devLog("No match " + url + " on " + fh.type);
            return true
        }
    });
    return result;
}

function run() {
    try {
	handle(window.location.href);
    } catch (error) {
	console.log("updateswh.js error: "+error);
    }
}

function runWithSettings() {
    // extension bundled webfont URL is not the same for Chrome and Firefox so we inject
    // the font-face dynamically to avoid error message in the console
/*    var fa = document.createElement("style");
    fa.rel = "stylesheet";
    fa.textContent = '@font-face { font-family: FontAwesome; src: url("' +
        browser.runtime.getURL("fonts/fontawesome-webfont.woff2") +
        '"); }';
    document.head.appendChild(fa);*/

    browser.storage.local.get(null, function (items) {
        settings = items;
	if (settings.gitlabs) {
	    devLog("update gitlab instances");
	    updategitlabhandlers(settings.gitlabs);
	};
	if (settings.giteas) {
	    devLog("update gitea instances");
	    updategiteahandlers(settings.giteas);
	};
        devLog("got settings in runWithSettings", settings);
	devLog("updateswh is running");
    });

    // wait 200ms for the settings to get loaded
    sleep(200).then(run);
}

// Add a mutation observer to trigger actions on changes
// Restricted to GitHub (only case where it seems needed for now)

var thisrunprefix = null;

var setupObserver = async () => {
    // console.log("Inside the observer function");
    var htmlList = document.querySelector("html");
    var thisurl = document.location.href;

    var htmlobserver = new MutationObserver(async (mutations) => {
	var newurl = document.location.href;
	var prefix = null;
	var prefixmatch = newurl.match(/^https?:\/\/github.com\/[^\/]*\/[^\/]+/);
	if (prefixmatch) {prefix=prefixmatch[0]};
        if (prefix) { // we are on a potentially new GitHub page
	    console.log("wait for lock");
	    await navigator.locks.request('mutation_observer', async lock => {
	    console.log("got lock");
	    if (prefix==thisrunprefix &&
		$(".swh-save-button").length &&
		!$(".swh-save-button").hasClass('orange')
	       ) { // same prefix as one handled by a previous mutation observer, and the icon is there
		devLog("Skipping redundant mutation on : "+newurl);
	    } else {
		if ($(".swh-save-button").length &&
		    !$(".swh-save-button").hasClass('orange')) {
		    devLog("Icon present, and not API limit overflow: skipping mutation call");
		} else { // no icon, let's run
		    if (prefix!=thisrunprefix){thisrunprefix=prefix;};
		    console.log("mutation triggers call");
		    run();
		    devLog("Wait for run to complete");
		    await sleep(350);
		    if($(".swh-save-button").length) {
			devLog("Icon has been inserted before releasing lock");};
		    devLog("releasing lock");
		}
	    }});
	}
	else {
	    devLog("Skipping non GitHub project page: "+newurl);
	}
    });
    var config = {
        childList: true,
        subtree: true,
    };
    if (thisurl.match(/^https?:\/\/github.com/)){
	// console.log("On a GitHub page: set up observer");
	// console.log("Set up observer on: " + thisurl + " (current page: "+document.location.href+")");
	htmlobserver.observe(htmlList, config);
    };
};

if (document.readyState === 'loading') {  // Loading hasn't finished yet
    // console.log("Wait for DOMContentLodaded");
    document.addEventListener('DOMContentLoaded', setupObserver);
} else {  // `DOMContentLoaded` has already fired
    // console.log("DOMContentLodaded has already fired: set up observer directly");
    setupObserver();
}
		       
runWithSettings();
