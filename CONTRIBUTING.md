# Extending updateswh

This documents provides basic information about the design of the extension,
in order to make it easier to understand its operation and to help contributors
add support for new forge technologies.

## Objectives
The goals of the extension are the following.

### At user level:

 - show an immediate visual indication of the archival status of a project shown
   on the webpage of a code hosting platform
 - provide one click operations to 
     + trigger new archival for missing or not up to date repositories
	 + visit archive page for a know repository
 - support addition of specific user defined forges, on top of the default ones
	 
### At developer level:	 
 - provide an easy way to add support for new forge technologies

A natural source of inspiration for this work was the [unpaywall extension](https://github.com/ourresearch/unpaywall-extension), and
the extension code base started with a significantly stripped down version of
the unpaywall source code. We have kept the same coding style, but the current
extension works in a way that is pretty different from the unpaywall one.
	 
## Getting the information about a repository from a forge

We started with supporting three popular forge technologies: Bitbucket, GitLab
and GitHub.  Luckily, in all these cases, a URL convention allows to spot easily a repository, with no need to do any parsing of the web page itself.

## Bitbucket
On GitHub, a URL related to a repository has always the prefix `https://bitbucket.org/<workspace>/<repository>/`.
We can get the repository last modification as follows (see [the Bitbucket documentation](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-repo-slug-get)):
 - perform a GET request at `https://api.bitbucket.org/2.0/repositories/<workspace>/<repository>`
 - retrieve the value of the `updated_on` field in the JSON document returned by the call
### GitHub
On GitHub, a URL related to a repository has always the prefix `https://github.com/<entity>/<repository>/`.
We can get the repository last modification as follows (see [the GitHub documentation](https://docs.github.com/en/rest/repos/repos)):
 - perform a GET request at `https://api.github.com/repos/<entity>/<repository>`
 - retrieve the value of the `pushed_at` field in the JSON document returned by the call
### GitLab
On a GitLab instance, we can proceed almost in the same way (see [the GitLab documentation](https://docs.gitlab.com/ee/api/projects.html#get-single-project)), with the following differences
 - the call to the API must [path encode the entity/repository slug](https://docs.gitlab.com/ee/api/index.html#namespaced-path-encoding)
 - the last modification is in the `last_activity_at` field

### Special prefixes

In all cases, a few special prefixes are reserved for use by the forge, so we need to filter them out.

## Getting the information about a repository from Software Heritage

To get the last archival date of a repository, we can use the `visit/latest` API call
(see [documentation](https://archive.softwareheritage.org/api/1/origin/visit/latest/doc/)),
and then fetch the value of the `date` field in the returned JSON document.

The good news is that the same URL prefix we check to know whether we are
visiting a repository is enough to query the Software Heritage API, to get the last visit date.

## Handling multiple forge architectures, and adding new ones

As a result of the observations above, in order to add support for a new
forge technology, here are the steps needed.

### Add a record to the `forgehandlers` array
Each record in the `forgehandlers` array contains key information used by the extension
to decide whether we are on a web page of a project repository, and what to do about it: 
 - a `pattern` regular expression that must capture *exactly* the prefix that corresponds to a repository
   (yes, *exactly*: remember, this pattern will be used to call the Software Heritage API!)
 - a `reject` regular expression that captures the reserved prefixes that match the `pattern` but are not
   repositories
 - a `type` string field that holds the name of the forge/technology (useful for debugging)
 - a `handler` entry holding the function that will be used to setup the interaction with the forge API

As an example, here is the record that corresponds to GitHub:

```
   {
        pattern: /^https?:\/\/github.com\/[^\/]*\/[^\/]+/,
        reject:  /^https?:\/\/github.com\/(features|marketplace|orgs|topics|collections|([^\/]*\/[^\/]*\/search\?))/,
        type: 'GitHub',
        handler: setupGitHub
    }
```

### Add a specific setup function

The second step is to create a specific setup function for this forge technology.
This function will be called with the full URL of the page visited, the `pattern` regular
expression and the `type` tag.

It is expected to return a record with the following information:

- `projecturl`: the project prefix ( `pattern.exec(url)[0]` should work in most
  cases)
- `userproject`: the `<entity>/<project>` slug as needed to call the forge API
  (removing the fixed forge prefix from `projecturl` should be enough in most
  cases)
- `forgeapiurl`: the exact API URL to call to get the status of this project
  (usually, the API URL entry followed by `userproject`, but remember that
  some forges want something else (e.g. GitLab wants this urlencoded).
- `lastupdate`: a function to call on the resulting JSON to extract the last change date

As an example, here is the code of the `setupGitHub` function:
```
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
            return resp.pushed_at;
        })
    };
}
```
### That's all!
In general, once you did the above, you are all set and the extension should
now be able to handle the new forge technology. Go out and test it!

### If that's not all

It may happen that the colored button appears to randomly go away, or need a
page reload (Ctrl-r, or Ctrl-Shift-r) to show up. If that's the case, the
application running on the webpage of the forge may be modifying the DOM
behind the scenes, like GitHub does.

To handle this case, you will need to add this forge
to the list of observed urls: go to the `setupObserve` function, and modify
the following line, adding the base url of the new forge to the pattern:

'''
if (thisurl.match(/^https?:\/\/github.com/)){
'''

Please make sure this is really needed before going ahead: it's not the
first thing to try if your code doesn't fly.

## Submitting your contribution

Once you have extensively tested your modified extension, not only on
your nice new forge, but also on the other ones, you are very welcome
to [create a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request) on the [source code repository](https://github.com/rdicosmo/updateswh/) to get it merged.

Thank you!


