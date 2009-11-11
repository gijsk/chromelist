////////////////////////////////////////////////////////////////////////////////
// Chrome Structure representation.


///////////////////
// ChromeStructure
function ChromeStructure()
{
    this.overrides = [];
    this.directories = {};
}

ChromeStructure.prototype.TYPE = "ChromeStructure";
ChromeStructure.prototype.isDirectory = true;
ChromeStructure.prototype.directories = null;
ChromeStructure.prototype.overrides = null;
ChromeStructure.prototype.parent = null;
ChromeStructure.prototype.href = "chrome://";
ChromeStructure.prototype.level = 0;
ChromeStructure.prototype.findURL =
function cs_findURL(url)
{
    var i, urlparts, currentNode = this;
    url = url.replace(/^chrome:\/\//, "");
    urlparts = url.split("/");
    for (i = 0; i < urlparts.length; i++)
    {
        if (currentNode.directories && (urlparts[i] in currentNode.directories))
            currentNode = currentNode.directories[urlparts[i]];
        else if (currentNode.files && (urlparts[i] in currentNode.files))
            currentNode = currentNode.files[urlparts[i]];
        else if (urlparts[i] != "")
            return null;
    }
    return currentNode;
}
///////////////////

///////////////////
// ChromeDirectory
// Constructor
// Note: name is expected to be URI-encoded
function ChromeDirectory(someParent, name, manifest, flags)
{
    this.parent = someParent;
    this.href = this.parent.href + name + "/";
    this.level = this.parent.level + 1;
    // If this is somewhere down, resolve stuff:
    if (this.level >= 2)
    {
        var resolvedURI = chromeReg.convertChromeURL(iosvc.newURI(this.href, null, null));
        this.scheme = resolvedURI.scheme;
        this.resolvedURI = resolvedURI.spec;
        if (this.level == 2) // we're looking at the magic file for our resolved URI, fix:
            this.resolvedURI = this.resolvedURI.replace(/[^\/]+$/, "");
    }
    // Otherwise, we don't know:
    else
    {
        this.scheme = "unknown";
        this.resolvedURI = "";
    }
    // We'll have directories and files underneath this (or might, anyway):
    this.directories = new Object();
    this.files = new Object();
    // And we need to store the manifest used to register this:
    if (manifest)
        this.manifest = manifest;
    else
        this.manifest = this.parent.manifest;

    // And the flags:
    if (flags)
        this.flags = flags;
    else if (this.level > 2)
        this.flags = this.parent.flags;
    else
        this.flags = "";

    // We calculate the path, and the leaf name:
    this.path = this.getPath();
    this.leafName = decodeURIComponent(name);
}

ChromeDirectory.prototype.getPath =
function cd_getPath()
{
    try {
        var path = getPathForURI(this.resolvedURI);
    }
    catch (ex) { logException(ex); return ""; }
    return path;
}

ChromeDirectory.prototype.getManifest =
function cd_getManifest()
{
    return this.manifest;
}

ChromeDirectory.prototype._addon = "";
ChromeDirectory.prototype.getAddOn =
function cd_getAddOn()
{
    if (this._addon)
        return this._addon;

    var manifestURL = getURLSpecFromFile(this.getManifest());
    var id;
    var m = manifestURL.match(/\/([^\/]+)\/chrome.manifest$/);
    if (!m)
    {
        this._addon = getStr("not.an.addon");
    }
    else
    {
        id = m[1];
        try {
            this._addon = extManager.getItemForID(decodeURIComponent(id)).name;
        }
        catch (ex)
        {
            logException(ex);
            this._addon = getStr("addon.not.found");
        }
    }
    return this._addon;
}

ChromeDirectory.prototype.TYPE = "ChromeDirectory";
ChromeDirectory.prototype.parent = null;
ChromeDirectory.prototype.isDirectory = true;
///////////////////



///////////////////
// ChromeFile
// Constructor
// Note: name is expected to be URI-encoded
function ChromeFile(parent, name, size)
{
    this.parent = parent;
    this.href = this.parent.href + name;
    this.level = this.parent.level + 1;
    this.size = size;
    var resolvedURI = getRealURI(this.href);
    this.scheme = resolvedURI.scheme;
    this.resolvedURI = resolvedURI.spec;
    this.path = this.getPath();
    this.leafName = decodeURIComponent(name);
}

ChromeFile.prototype.TYPE = "ChromeFile";
ChromeFile.prototype.parent = null;
ChromeFile.prototype.isDirectory = false;
ChromeFile.prototype.getManifest =
function cf_getManifest()
{
    var obj = this;
    while (!("manifest" in obj))
    {
        if (obj.TYPE == "ChromeStructure")
            return null;
        obj = obj.parent;
    }
    return obj.manifest;
}

// Same as for directories
ChromeFile.prototype.getPath = ChromeDirectory.prototype.getPath;
ChromeFile.prototype._addon = "";
ChromeFile.prototype.getAddOn = ChromeDirectory.prototype.getAddOn;
///////////////////
