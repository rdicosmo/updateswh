if (typeof chrome !== "undefined") {
	browser = chrome
}

var devLog = function (str, obj) {
	// only log to console if we're in Chrome with Debug Mode enabled.
	if (settings && settings.swhdebug) {
		console.log("updateswh: " + str, obj)
	}
}
devLog("script inside the iframe is running")

// global variables:
var settings = {}

var parts = window.name.split("#")
var color = parts[0]
var url = decodeURI(parts.slice(1).join('#'))
var swhhelp = "https://www.softwareheritage.org/browser-extension/#missingrepo" // documentation about missinig repositories (typically private ones)
var swhurl = "https://archive.softwareheritage.org/browse/origin/directory/?origin_url=" + encodeURI(url)
var swhsaveurl = "https://archive.softwareheritage.org/api/1/origin/save/git/url/" + encodeURI(url) + "/"
var swhsaverequested = false;

if (color == "green") { // everything is up to date!
	$(".button")
		.wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
		.parent()
		.attr("href", swhurl);
} else if (color == "red") { // we did not find this project (probably a private project)
	$(".button")
		.wrap($('<a target="_blank" rel="noopener noreferrer"></a>'))
		.parent()
		.attr("href", swhhelp);
} else { // we propose to save the project
	$(".button").click(function () {
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
					});
				}

				$(".button").fadeIn();

				$(".button").addClass(color)

				browser.storage.local.get(null, function (items) {
					settings = items
					devLog("got settings", settings)
				});