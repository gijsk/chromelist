var chromeStructure;
var iosvc, chromeReg;

function findChromeURL(url)
{
    function getUriParticle()
    {
        var ary = url.match(/^([^\/]+)\/?(.*)$/);
        if (ary)
        {
            url = ary[2]; 
            return ary[1];
        }
        url = "";
        return "";
    };
    url = url.replace("chrome://", ""); // Remove chrome://
    var base = getUriParticle();
    if (!base)
        return keys(chromeStructure.directories);
    var ptype = getUriParticle();
    if (!ptype)
        return keys(chromeStructure.directories[base].directories);
    var currentDir = chromeStructure.directories[base].directories[ptype];
    var thisDirStr = "";
    while (url != "")
    {
        thisDirStr = getUriParticle();
        if (url == "" && (thisDirStr in currentDir.files)) // Last bit may be a file.
            return [];
        currentDir = currentDir.directories[thisDirStr];
    }
    return keys(currentDir.directories).concat(keys(currentDir.files));
}

// Maps the chrome's structure.
// This code probably looks strange. Why not a simple for loop, you wonder?
// Well, because even on my (somewhat fast) pc, it takes about a second to
// parse all the manifests and make a tree. On extension-loaded browsers,
// on slow machines, it might well take *very* long. So I'm trying hard not
// to hang the UI.
function refreshChromeList(callback)
{
    chromeStructure = null;
    chromeStructure = new ChromeStructure();
    var f, contents;
    var chromeURLs = [];

    // Fetch the manifests.
    var manifs = getManifests();
    var numberOfManifests = manifs.length;
    var currentManifest = 0;
    setStatusProgress(0);
    setTimeout(doParseManifest, 0);


    function doParseManifest()
    {
        // Parse them:
        f = fopen(manifs[currentManifest], "<");
        contents = f.read();
        f.close();
        if (contents) // If there's something in it, parse it.
            chromeURLs = chromeURLs.concat(parseManifest(contents, manifs[currentManifest]));

        // Update stuff every now and then.
        if (currentManifest % 10 == 0)
            setStatusProgress(Math.floor(25 * currentManifest / numberOfManifests));

        currentManifest++;
        if (currentManifest < numberOfManifests)
            setTimeout(doParseManifest, 0);
        else
            setTimeout(makeChromeTree, 0, chromeURLs, callback);
    };
}

function makeChromeTree(chromeURLs, callback)
{
    var currentIndex = 0;
    var numberOfURLs = chromeURLs.length;
    setStatusText(getStr("info.status.mapping.chrome"));
    function doProcessChromeURL()
    {
        // UI stuff + next one.
        function gotoNextURL()
        {
            currentIndex++;
            if (currentIndex % 10 == 0)
                setStatusProgress(25 + (75 * currentIndex / numberOfURLs));
            if (currentIndex < numberOfURLs)
                setTimeout(doProcessChromeURL, 0);
            else
                setTimeout(callback, 0);
        };

        var localURI, chromeURI;
        var pname, ptype, m, chromeDir;
        try
        {
            chromeURI = iosvc.newURI(chromeURLs[currentIndex][0], null, null);
            localURI = chromeReg.convertChromeURL(chromeURI);
        }
        catch (ex)
        {
            gotoNextURL();
            return;
        }
        // Make base and package, if necessary. Only do that if we could
        // map the URI to a local place, otherwise it may not have been used
        // due to app or version conflicts.
        m = chromeURLs[currentIndex][0].match(/^chrome\:\/\/([^\/]+)\/([^\/]+)/i);
        pname = m[1]; // Packagename
        ptype = m[2]; // Packagetype

        if (!(pname in chromeStructure.directories))
            chromeStructure.directories[pname] = new ChromeDirectory(chromeStructure, pname);

        if (!(ptype in chromeStructure.directories[pname].directories))
        {
            chromeDir = new ChromeDirectory(chromeStructure.directories[pname],
                                            ptype, chromeURLs[currentIndex][1]);
            chromeStructure.directories[pname].directories[ptype] = chromeDir;
        }

        // Now we have directory which contains these files/this file.
        var cD = chromeStructure.directories[pname].directories[ptype];
        if (localURI.scheme == "file")
            addFileSubs(localURI, cD);
        else if (localURI.scheme == "jar")
            addJarSubs(localURI, cD);
        gotoNextURL();
    };

    doProcessChromeURL();
}

function addJarSubs(uri, chromeDir)
{
    const nsIJARURI = Components.interfaces.nsIJARURI;
    const nsIFileURL = Components.interfaces.nsIFileURL;
    const nsIZipReader = Components.interfaces.nsIZipReader;
    const nsIZipEntry = Components.interfaces.nsIZipEntry;
    var jarURI = uri.QueryInterface(nsIJARURI);
    var jarFileURL = jarURI.JARFile.QueryInterface(nsIFileURL);
    var zr = newObject("@mozilla.org/libjar/zip-reader;1", nsIZipReader);
    try
    {
        // nsIZipReader changed on trunk somewhere in the summer of 2006. Not on branch though.
        if ("init" in zr)
        {
            zr.init(jarFileURL.file);
            zr.open();
        }
        else
        {
            zr.open(jarFileURL.file);
        }
    }
    catch (ex)
    {
        logException(ex);
        return;
    }
    var relativeDir = jarURI.directory;
    relativeDir = (/^\//).test(relativeDir) ? relativeDir.substr(1) : relativeDir;
    
    var entries = zr.findEntries(relativeDir + "*");
    //XXXgijs: more API changes. Not fun.
    while ((("hasMoreElements" in entries) && entries.hasMoreElements()) ||
           (("hasMore" in entries) && entries.hasMore()))
    {
        var entry;
        // Still more API changes:
        var strEntry = entries.getNext();
        if (typeof strEntry == "string")
        {
            entry = zr.getEntry(strEntry);
            entry = entry.QueryInterface(nsIZipEntry);
        }
        else
        {
            entry = strEntry;
            entry = entry.QueryInterface(nsIZipEntry);
            strEntry = entry.name;
        }
        

        
        var relEntry = strEntry.replace(new RegExp("^" + relativeDir), "");
        // Don't add this if it's a directory or 'nothing' (current directory)
        if (relEntry == "" || (/\/$/).test(relEntry))
            continue;
        try
        {
            var size = entry.realSize;
        }
        catch (ex) { var size = 0; }
        // Add this entry with the correct size. Don't pass directories, they'll be
        // created on an as-necessary basis.
        chromeDir.addRelativeURL(relEntry, size);
    }

}

function addFileSubs(uri, chromeDir)
{
    function parseLocalDir(entries, cDir)
    {
        var entry, filename, size, subdir;
        while (entries.hasMoreElements())
        {
            entry = entries.getNext().QueryInterface(nsIFile);
            filename = entry.leafName;
            // Try to get a normal filesize, but for all we know this may fail.
            try
            {
                size = entry.fileSize;
            }
            catch (ex) { size = 0; }

            if (!entry.isDirectory())
            {
                cDir.files[filename] = new ChromeFile(cDir, filename, size);
            }
            else
            {
                subdir = new ChromeDirectory(cDir, filename);
                cDir.directories[filename] = subdir;
                parseLocalDir(entry.directoryEntries, subdir);
            }
        }
    };

    const nsIFileURL = Components.interfaces.nsIFileURL;
    const nsIFile = Components.interfaces.nsIFile;
    var file = uri.QueryInterface(nsIFileURL).file;
    var dir = file.parent; // We're still looking at the magic file.
    if (dir && dir.exists() && dir.isDirectory())
        parseLocalDir(dir.directoryEntries, chromeDir);

}

function getManifests()
{
    const DS_CTR = "@mozilla.org/file/directory_service;1";
    const nsIProperties = Components.interfaces.nsIProperties;
    const nsISE = Components.interfaces.nsISimpleEnumerator;
    const nsIF = Components.interfaces.nsIFile;

    var dirSvc = Components.classes[DS_CTR].getService(nsIProperties);
    var manifestEnum = dirSvc.get("ChromeML", nsISE);
    var manifests = [];
    while (manifestEnum.hasMoreElements())
    {
        var entry = manifestEnum.getNext();
        try
        {
            entry.QueryInterface(nsIF);
        }
        catch (ex)
        {
            continue;
        }
        // If this is not a directory, it must be a manifest file.
        if (!entry.isDirectory())
        {
            manifests.push(entry.path);
            continue;
        }
        // Parse as a directory.
        var dirEntries = entry.directoryEntries;
        while (dirEntries.hasMoreElements())
        {
            var file = dirEntries.getNext().QueryInterface(nsIF);
            if ((/\.manifest$/i).test(file.path))
                manifests.push(file.path);
        }
    }
    return manifests;
}

// Parse a manifest.
function parseManifest(manifest, path)
{
    var line, params, rv;
    // Pick apart the manifest line by line.
    var lines = manifest.split("\n");
    rv = [];
    for (var i = 0; i < lines.length; i++)
    {
        line = stringTrim(lines[i]);
        var params = line.split(/\s+/);

        // Switch based on the type of chrome mapping. Each kind has its own
        // syntax. See http://developer.mozilla.org/en/docs/Chrome_Manifest
        switch (params[0])
        {
            case "content":
            case "skin":
            case "locale":
                // push( [chrome uri, path to manifest])
                rv.push(["chrome://" + params[1] + "/" + params[0], path]);
                break;
            // Otherwise, don't do anything.
        }
    }
    return rv;
}

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
function ChromeDirectory(someParent, name, manifest)
{
    this.leafName = name;
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
    this.manifest = manifest;
    this.path = this.getPath();
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
    if (this.scheme == "jar")
    {
        var file, uri;
        try {
            uri = iosvc.newURI(this.resolvedURI, null, null);
            uri.QueryInterface(Components.interfaces.nsIJARURI);
            file = getFileFromURLSpec(uri.JARFile.spec);
        }
        catch (ex) { logException(ex); return ""; }
        return file.path;
    }
    if (this.scheme == "file")
    {
        var file;
        try {
            file = getFileFromURLSpec(this.resolvedURI);
        }
        catch (ex) { logException(ex); return ""; }
        return file.path;
    }
    return "";
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
function ChromeFile(parent, name, size)
{
    this.leafName = name;
    this.parent = parent;
    this.href = this.parent.href + name;
    this.level = this.parent.level + 1;
    this.size = size;
    var resolvedURI = chromeReg.convertChromeURL(iosvc.newURI(this.href, null, null));
    this.scheme = resolvedURI.scheme;
    this.resolvedURI = resolvedURI.spec;
    this.path = this.getPath();
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

function logException (ex)
{
         // FIXME: logException doesn't do anything yet.
}
