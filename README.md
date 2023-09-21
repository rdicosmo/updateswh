# Update Software Heritage browser extension for Chrome, Firefox and Edge

This browser extension checks if a repository visited by the user is archived
and uptodate in Software Heritage.

### What the extension does

A color button on the right of the browser indicates if it is uptodate (green),
in which case clicking on the button opens a tab on the corresponding page of
the archive, missing (grey) or not up to date (yellow), in which case clicking
on the button triggers a save code now request.

A brown color warns that the last archival visit did not succeed in full, so
there may be issues that make archival not straightforward.

An orange color indicates that the SWH rate limit has been hit: one needs to
get and add an access token to overcome the limitation.

A red color indicates that the API request of information for the repository
did not succeed: this happens typically when one is visiting a repository
that is not publicly accessible, and that naturally cannot be archived.


### Getting the extension for your browser

For accessing the latest published version of the extension on the Firefox
Add-ons, the Chrome Web Store or the Microsoft Edge Add-ons, and more detailed usage instructions, see the webpage at
https://www.softwareheritage.org/browser-extensions/

### Credits

Many thanks to the Unpaywall extension developers (see
https://unpaywall.org/products/extension): their work has been an essential
starting point for designing and developing this extension.

### Developer information

The code base is meant to be identical between Firefox, Google Chrome and Microsoft Edge.
Due to the ongoing transition to manifest version 3, there is currently
one difference: for Firefox a manifest.json version 2 is provided, but
for Google Chrome and Microsoft Edge one needs to create a package using the version 3
format provided in manifest-v3.json.
The toplevel Makefile takes care of the appropriate reshuffling at package creation time.
