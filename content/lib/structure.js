////////////////////////////////////////////////////////////////////////////////
// Chrome Structure representation.


///////////////////
// ChromeStructure
function ChromeStructure() {}
ChromeStructure.prototype.TYPE = "ChromeStructure";
ChromeStructure.prototype.isDirectory = true;
ChromeStructure.prototype.directories = {};
ChromeStructure.prototype.parent = null;
ChromeStructure.prototype.href = "chrome://";
ChromeStructure.prototype.level = 0;
ChromeStructure.prototype.findURL =
function cs_findURL(url)
{
    var i, currentNode = this, urlparts;
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
function ChromeDirectory(someParent, name, manifest)
{
    this.parent = someParent;
    this.href = this.parent.href + name + "/";
    this.level = this.parent.level + 1;
    if (this.level >= 2)
    {
        var resolvedURI = chromeReg.convertChromeURL(iosvc.newURI(this.href, null, null));
        this.scheme = resolvedURI.scheme;
        this.resolvedURI = resolvedURI.spec;
        if (this.level == 2) // we're looking at the magic file for our resolved URI, fix:
            this.resolvedURI = this.resolvedURI.replace(/[^\/]+$/, "");
    }
    else
    {
        this.scheme = "unknown";
        this.resolvedURI = "";
    }
    this.directories = new Object();
    this.files = new Object();
    if (manifest)
        this.manifest = manifest;
    else
        this.manifest = this.parent.manifest;

    this.path = this.getPath();
    this.leafName = decodeURIComponent(name);
}

// DON'T PASS DIRECTORIES, _ONLY_ FILES
ChromeDirectory.prototype.addRelativeURL =
function CD_addRelativeURL(url, size)
{
    var name = url.split("/", 1)[0];
    var remainingurl = url.replace(/^[^\/]+\/?/, "");
    if (remainingurl == "")
    {
        // We want the relative url to be a file, hence the last part will be a
        // file, not a directory.
        if (!(name in this.files))
            this.files[name] = new ChromeFile(this, name, size);
    }
    else
    {
        if (!(name in this.directories))
            this.directories[name] = new ChromeDirectory(this, name, this.manifest);
        this.directories[name].addRelativeURL(remainingurl, size);
    }
    return;
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
///////////////////
