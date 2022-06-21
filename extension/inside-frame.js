if (typeof chrome !== "undefined"){
    browser = chrome
}

var devLog = function(str, obj){
    // only log to console if we're in Chrome with Debug Mode enabled.
    if (settings && settings.swhdebug && navigator.userAgent.indexOf("Chrome") > -1){
        console.log("updateswh: " + str, obj)
    }
}
devLog("script inside the iframe is running")

// global variables:
var settings = {}

var parts = window.name.split("#")
var color = parts[0]
var url = decodeURI(parts.slice(1).join('#'))
var swhurl = "https://archive.softwareheritage.org/browse/origin/directory/?origin_url="+encodeURI(url)
var swhsaveurl = "https://archive.softwareheritage.org/api/1/origin/save/git/url/"+encodeURI(url)+"/"
var swhsaverequested = false;

if (color == "green") { // everything is up to date!
    $(".button")
        .wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
        .parent()
        .attr("href", swhurl);
}
else { // we propose to save the project   
    $(".button").click(function(){
	if (!swhsaverequested){ // ensure we only request saving once
	    $.post(swhsaveurl, function(data, status, xhr){swhsaverequested=true},)
		.done(function(resp){
		    $(".button").removeClass("yellow").addClass("lightgreen");
		    devLog("Successful " + swhsaveurl);
		})
		.fail(function(resp){
		    $(".button").removeClass("yellow").addClass("grey");
		    devLog("Failed " + swhsaveurl);
		})
		.always(function(resp){
		    devLog("Completed " + swhsaveurl);
		})
	}
    });
}

$(".button").fadeIn();

$(".button").addClass(color)

    browser.storage.local.get(null, function(items){
        settings = items
        devLog("got settings", settings)
    });
