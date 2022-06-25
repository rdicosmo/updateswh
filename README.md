# Update Software Heritage
Repository for the Update Software Heritage browser extension for Chrome and Firefox.

In a nutshell, this extension checks if a repository visited by the user is
archived and uptodate in Software Heritage. A color button on the right of the
browser indicates if it is uptodate (green), in which case clicking on the
button opens a tab on the corresponding page of the archive, missing (grey) or
not up to date (yellow), in which case clicking on the button triggers a save
code now request.

A red color indicates that the API request of information for the repository
did not succeed: this happens typically when one is visiting a repository
that is not publicly accessible, and that naturally cannot be archived.

More documentation is available on the website at https://www.softwareheritage.org/browser-extensions/

Many thanks to the Unpaywall extension developers (see
https://unpaywall.org/products/extension): their work has been an essential
starting point for developing this extension.
