if (chrome) {
    browser = chrome
}


var devLog = function (str, obj) {
    if (settings && settings.swhdebug) {
        console.log("updateswh: " + str, obj)
    }
}

devLog("updateswh is running");

// global variables:
var iconInserted = false;
var settings = {};
var swhsaverequested = false;

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

function testupdateforge(url, forgespecs) {
    var projecturl = forgespecs.projecturl;
    var userproject = forgespecs.userproject;
    var forgeapiurl = forgespecs.forgeapiurl;
    var forgename = forgespecs.forgename;
    var lastupdate = forgespecs.lastupdate;

    // fixed parameters
    var swhapiurl = "https://archive.softwareheritage.org/api/1/origin/" + projecturl + "/visit/latest/";
    var forgelastupdate = "";
    var swhlastupdate = "";
    var results = {
        projecturl: projecturl,
        isComplete: false, // flag to record completion of the following code that is asynchronous
        color: "grey"
    }
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
		    swhlastupdatestatus = resp.status;
                    devLog("call to SWH API returned: ", swhlastupdate);
                    if (swhlastupdate >= forgelastupdate) {
                        results.color = "green"
                    } else {
                        results.color = "yellow"
                    };
		    if (swhlastupdatestatus !="full") { // last update did not succeed
			results.color = "brown"         // let's warn the user
		    }
                })
                .fail(function (xhr, texstatus, error) {
                    devLog("call to SWH API failed, status: " + texstatus + ", error: " + error + ".", xhr);
		    if (xhr.status == 403) { // it seems we ran out of steam on the SWH API
			results.color = "orange"; // let's warn the user
		    } else {
			results.color = "grey";}
                })
                .always(function (resp) {
                    devLog("call to SWH API finished", resp);
                    results.isComplete = true;
                })
        })
        .fail(function (resp) {
            devLog("call to " + forgename + " API failed", resp);
	    if (resp.status == 403) { // it seems we ran out of steam on the forge API
		results.color = "orange"; // let's warn the user
                devLog("Setting color to orange");
	    } else {
		results.color = "red";}
            results.isComplete = true;
        });
    return results;
}

/***********************************************************************************
 *
 * Forge specifics
 *
 ************************************************************************************/

function setupGitHub(url, pattern, type) {
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var userproject = projecturl.replace(/https?:\/\/github.com\//, ""); // this is the user+project fragment
    var forgeapiurl = "https://api.github.com/repos/" + userproject;
    return {
        projecturl: projecturl,
        userproject: userproject,
        forgeapiurl: forgeapiurl,
        forgename: type,
        lastupdate: (function (resp) {
            return resp.pushed_at
        })
    };
}

function setupBitbucket(url, pattern, type) {
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var userproject = projecturl.replace(/https?:\/\/bitbucket.org\//, ""); // this is the user+project fragment
    var forgeapiurl = "https://api.bitbucket.org/2.0/repositories/" + userproject;
    return {
        projecturl: projecturl,
        userproject: userproject,
        forgeapiurl: forgeapiurl,
        forgename: type,
        lastupdate: (function (resp) {
            return resp.updated_on
        })
    };
}

function setupGitLab(url, pattern, type) {
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var userproject = encodeURIComponent(projecturl.replace(/http.*:\/\/gitlab.com\//, "")); // path-encoded user+project fragment
    var forgeapiurl = "https://gitlab.com/api/v4/projects/" + userproject;
    devLog("Setting up GitLab: " + type);
    return {
        projecturl: projecturl,
        userproject: userproject,
        forgeapiurl: forgeapiurl,
        forgename: type,
        lastupdate: (function (resp) {
            return resp.last_activity_at
        })
    };
}

function setupGitLabInstance(url, pattern, type) {
    var projecturl = pattern.exec(url)[0]; // this is the url of the project
    var forgeprotocol = projecturl.match(/^https?:\/\//);
    var forgebaseurl = forgeprotocol + projecturl.replace(forgeprotocol, "").replace(/\/.*/, "/");
    var userproject = encodeURIComponent(projecturl.replace(forgebaseurl, "")); // path-encoded user+project fragment
    var forgeapiurl = forgebaseurl + "api/v4/projects/" + userproject;
    devLog("Setting up GitLab instance at: " + forgebaseurl);
    return {
        projecturl: projecturl,
        userproject: userproject,
        forgeapiurl: forgeapiurl,
        forgename: type,
        lastupdate: (function (resp) {
            return resp.last_activity_at
        })
    };
}


// array of regex patterns to identify the project forge from the url
// associates forge type and handling function
// the reject regex allows to filter out urls that are surely not project ones
// order is important: first match will be used!

var forgehandlers = [{
        pattern: /^https?:\/\/github.com\/[^\/]*\/[^\/]+/,
        reject: "^https?:\/\/github.com\/(features|marketplace)",
        type: 'GitHub',
        handler: setupGitHub
    },
    {
        pattern: /^https?:\/\/bitbucket.org\/[^\/]*\/[^\/]+/,
        reject: "^https?:\/\/bitbucket.org\/(dashboard\/|product\/|account\/signin)",
        type: 'Bitbucket',
        handler: setupBitbucket
    },
    {
        pattern: /^https?:\/\/gitlab.com\/[^\/]*\/[^\/]+/,
        type: 'GitLab',
        handler: setupGitLab
    },
    // heuristic: we handle gitlab.*.* as a GitLab instance
    {
        pattern: /^https?:\/\/gitlab.[^.]*.[^.]*\/[^\/]*\/[^\/]+/,
        reject: "^https?:\/\/gitlab.[^.]*.[^.]*\/users\/sign_in",
        type: 'GitLab instance',
        handler: setupGitLabInstance
    },
]

// Get the status of the repository by polling the results of the handler until
// its work is completed, then show the result with the save icon and quit.

function getandshowstatus(url, forgespecs) {
    var results = testupdateforge(url, forgespecs);
    var resultsChecker = setInterval(function () {
        if (results.isComplete) {
            // display button using an icon named with the color and the project url
            insertSaveIcon(results.color, results.projecturl)
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

function insertSaveIcon(color, url) {

    // make sure we are not inserting icon again and again
    if (iconInserted) {
        return false;
    }

    var saveButton = $(
        '<div class="swh-save-button">' +
        '   <div class="swh-save-icon">' +
        '       <i class="fa fa-save fa-3x"></i>' +
        '   </div>' +
        '</div>');

    $('body').append(saveButton);

    var swhhelp = "https://www.softwareheritage.org/browser-extension/#missingrepo" // documentation about missinig repositories (typically private ones)
    var swhurl = "https://archive.softwareheritage.org/browse/origin/directory/?origin_url=" + encodeURI(url)
    var swhsaveurl = "https://archive.softwareheritage.org/api/1/origin/save/git/url/" + encodeURI(url) + "/"
    var swhsavelisturl = "https://archive.softwareheritage.org/save/list/"
    
    if (color == "green") { // everything is up to date!
        $(".swh-save-button")
            .wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
            .parent()
            .attr("href", swhurl);
    } else if (color == "red") { // we did not find this project (probably a private project)
        $(".swh-save-button")
            .wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
            .parent()
            .attr("href", swhhelp);
    } else if (color == "orange") { // we hit the rate limit
        $(".swh-save-button")
            .wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
            .parent()
            .attr("href", swhhelp);
    } else { // we propose to save the project
        $(".swh-save-button").click(function () {
            if (!swhsaverequested) { // ensure we only request saving once
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
                        swhsaverequested = true;
                        $(".swh-save-button").removeClass("yellow").removeClass("grey").addClass("lightgreen");
			$(".swh-save-button").wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
			    .parent()
			    .attr("href", swhsavelisturl);
                        devLog("Successful " + swhsaveurl);
                        if (settings && settings.showrequest) {
                            devLog("Showing request status in a new tab");
                            browser.runtime.sendMessage({
                                "type": "createtab",
                                "url": swhsavelisturl
                            })
                        };
                        //browser.tabs.create({url: "https://archive.softwareheritage.org/save/list/"})}; // not accessible on FF
                    })
                    .fail(function (resp, texstatus, error) {
                        $(".swh-save-button").removeClass("yellow").removeClass("grey").addClass("red").attr("href", swhhelp);
                        devLog("Call to SWH save API failed, status: " + texstatus + ", error: " + error + ".", resp);
                        devLog("Failed on url " + swhsaveurl);
                    })
                    .always(function (resp) {
                        devLog("Completed " + swhsaveurl);
                    })
            }
        });
    }

    $(".swh-save-button").fadeIn();

    $(".swh-save-button").addClass(color)

    iconInserted = true
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
    handle(window.location.href);
}

function runWithSettings() {
    // extension bundled webfont URL is not the same for Chrome and Firefox so we inject
    // the font-face dynamically to avoid error message in the console
    var fa = document.createElement("style");
    fa.rel = "stylesheet";
    fa.textContent = '@font-face { font-family: FontAwesome; src: url("' +
        browser.runtime.getURL("fonts/fontawesome-webfont.woff2") +
        '"); }';
    document.head.appendChild(fa);

    browser.storage.local.get(null, function (items) {
        settings = items
        devLog("got settings", settings)
        run()
    });
}

runWithSettings();
