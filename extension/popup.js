if (chrome) {
    browser = chrome
}


document.getElementById("options").addEventListener("click",
    function () {
        browser.runtime.openOptionsPage();
	window.close()
    }
)

document.getElementById("homepage").addEventListener("click",
    function () {
        browser.tabs.create({
            url: "https://softwareheritage.org/browser-extensions/#UpdateSWH"
        });
	window.close()
    }
)


function addgitlab(hostname){
  browser.storage.local.get({
       gitlabs: null
   }, function (items) {
       var gl=items.gitlabs;
       if (gl===null || gl===""){gl=hostname}
       else {gl=gl + '\n' + hostname};
       browser.storage.local.set({gitlabs: gl})
   })
}

function addgitea(hostname){
  browser.storage.local.get({
       giteas: null
  }, function (items) {
      var gl=items.giteas;
      if (gl===null || gl===""){gl=hostname}
      else {gl=gl + '\n' + hostname};
      browser.storage.local.set({giteas: gl})
  })
 }


// calling this function inside the listener instead of copying there the exact
// code does not work: it would be nice to know why
function getCurrentTabDomain() {
    browser.tabs.query(
	{'active': true, 'lastFocusedWindow': true},
	function(tabs) {
	    const url = new URL(tabs[0].url);
	    return(url.hostname)
    })
}


document.getElementById("addgitlab").addEventListener("click",
      function () {
	  browser.tabs.query(
	      {'active': true, 'lastFocusedWindow': true},
	      function (tabs) {
		  const url = new URL(tabs[0].url);
		  addgitlab(url.hostname);
		  let reloading = browser.tabs.reload({bypassCache: true});
		  reloading.then(window.close, window.close)
	      }
	  )
      }
)

document.getElementById("addgitea").addEventListener("click",
      function () {
	  browser.tabs.query(
	      {'active': true, 'lastFocusedWindow': true},
	      function (tabs) {
		  const url = new URL(tabs[0].url);
		  addgitea(url.hostname);
		  let reloading = browser.tabs.reload({bypassCache: true});
		  reloading.then(window.close, window.close)
	      }
	  )
      }
)
