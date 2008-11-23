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
    chromeOverrides = [];
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
            setTimeout(makeChromeTree, 0, chromeURLs, updateOverrides, callback);
    };
}

function makeChromeTree(chromeURLs, callback, callbackParam)
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
                setTimeout(callback, 0, callbackParam);
        };
        // Find a corresponding skin/locale entry
        // xxxHack: assume it's going to be just before or just after this item
        //          seeing as human beings tend to be quite organized!
        function existsSkinOrLocaleDir(name, urls)
        {
            var startIndex = Math.max(0, currentIndex - 5);
            var regexSkinLocale = new RegExp("^chrome://" + name + "/(skin|locale)");
            for (var i = 0; i < urls.length; i++)
            {
                var realIndex = (i + startIndex) % urls.length;
                var url = urls[realIndex][0];
                if (regexSkinLocale.test(url))
                    return true;
            }
            return false;
        };

        var localURI, chromeURI;
        var ignoreFailedLookup = false;
        var pname, ptype, m, manifest, flags, chromeDir, desc, prob;

        // Make base and package.
        m = chromeURLs[currentIndex][0].match(/^chrome\:\/\/([^\/]+)\/([^\/]+)/i);
        pname = m[1]; // Packagename
        ptype = m[2]; // Packagetype
        manifest = chromeURLs[currentIndex][1];
        flags = chromeURLs[currentIndex][2];
        
        // Now, we want to ignore the fact that the target of this mapping may
        // not exist if all of the following hold:
        // - the package type is content
        // - this manifest maps at least one other type of thing (skin, locale)
        // - this line has flags
        if ((stringTrim(flags) != "") && (ptype == "content") && existsSkinOrLocaleDir(pname, chromeURLs))
            ignoreFailedLookup = true;
        
        // Do our magic:
        try
        {
            localURI = getRealURI(chromeURLs[currentIndex][0])
        }
        catch (ex)
        {
            desc = getStr("problem.convertChromeURL.failure",[ptype, pname]);
            prob = {desc: desc, manifest: manifest, severity: "error"};
            chromeBrowser.addProblem(prob);
            gotoNextURL();
            return;
        }

        if (localURI.scheme == "file")
        {
            addFileSubs(localURI, ptype, pname, manifest, ignoreFailedLookup);
        }
        else if (localURI.scheme == "jar")
        {
            addJarSubs(localURI, ptype, pname, manifest, ignoreFailedLookup);
        }
        else
        {
            desc = getStr("problem.unrecognized.url", [localURI.spec, ptype, pname]);
            prob = {desc: desc, manifest: manifest, severity: "error"};
            chromeBrowser.addProblem(prob);
        }
        gotoNextURL();
    };

    doProcessChromeURL();
}

function addJarSubs(uri, provider, pack, manifest, ignoreFailedLookup)
{
    var desc, prob;
    var jarURI = uri.QueryInterface(nsIJARURI);
    var jarFileURL = jarURI.JARFile.QueryInterface(nsIFileURL);
    var zr = newObject("@mozilla.org/libjar/zip-reader;1", nsIZipReader);
    try
    {
        zr.open(jarFileURL.file);
    }
    catch (ex)
    {
        if (!jarFileURL.file || !jarFileURL.file.exists())
        {
            prob = {desc: getStr("problem.noJarFile",
                                 [provider, pack, jarFileURL.spec]),
                    manifest: manifest,
                    severity: "error"};
            chromeBrowser.addProblem(prob);
        }
        else
        {
            logException(ex);
        }
        return;
    }

    var relativeDir = jarURI.directory;
    relativeDir = (/^\//).test(relativeDir) ? relativeDir.substr(1) : relativeDir;
    
    var entries = zr.findEntries(relativeDir + "*");
    var cDir = null;
    //XXXgijs: more API changes. Not fun.
    while ((("hasMoreElements" in entries) && entries.hasMoreElements()) ||
           (("hasMore" in entries) && entries.hasMore()))
    {
        cDir = getProviderDir(pack, provider, manifest);
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
        cDir.addRelativeURL(relEntry, size);
    }
    
    if (!cDir && !ignoreFailedLookup)
    {
        desc = getStr("problem.fileNotInJar", [provider, pack, jarFileURL.file.path]);
        prob = {desc: desc, manifest: manifest, severity: "error"};
        chromeBrowser.addProblem(prob);
    }
}

function addFileSubs(uri, provider, pack, manifest)
{
    function parseLocalDir(entries, cDir, dirPath)
    {
        var entry, fileName, size, subdir, urlFileName, urlDir;
        var addedSomething = false;
        while (entries.hasMoreElements())
        {
            entry = entries.getNext().QueryInterface(nsIFile);
            fileName = entry.leafName;
            urlFileName = getURLSpecFromFile(entry);
            urlDir = urlFileName.replace(/[^\/]+\/?$/, "");
            urlFileName = urlFileName.substr(urlDir.length);
            addedSomething = true;
            // Try to get a normal filesize, but for all we know this may fail.
            try
            {
                size = entry.fileSize;
            }
            catch (ex) { size = 0; }

            if (!entry.isDirectory())
            {
                cDir.files[urlFileName] = new ChromeFile(cDir, urlFileName, size);
            }
            else
            {
                // Remove the slash from the name before use...
                var subdirName = urlFileName.substring(0, urlFileName.length -1);
                subdir = new ChromeDirectory(cDir, subdirName, manifest);
                cDir.directories[subdirName] = subdir;
                parseLocalDir(entry.directoryEntries, subdir, entry.path);
            }
        }
        if (!addedSomething && (cDir.level == 2))
        {
            desc = getStr("problem.mappedToEmptyDir", [provider, pack, dirPath]);
            prob = {desc: desc, manifest: manifest, severity: "warning"};
            chromeBrowser.addProblem(prob);
        }
    };

    const nsIFileURL = Components.interfaces.nsIFileURL;
    const nsIFile = Components.interfaces.nsIFile;
    var file = uri.QueryInterface(nsIFileURL).file;
    var dir = file.parent; // We're still looking at the magic file.
    if (!dir)
        return;

    var prob, desc;

    if (!dir.exists() && !ignoreFailedLookups)
    {
        desc = getStr("problem.noFile", [provider, pack, dir.path]);
        prob = {desc: desc, manifest: manifest, severity: "error"};
        chromeBrowser.addProblem(prob);
    }
    else if (!dir.isDirectory())
    {
        desc = getStr("problem.mappedToFile", [provider, pack, dir.path]);
        prob = {desc: desc, manifest: manifest, severity: "error"};
        chromeBrowser.addProblem(prob);
    }
    else
    {
        var chromeDir = getProviderDir(pack, provider, manifest);
        parseLocalDir(dir.directoryEntries, chromeDir, dir.path);
    }
}

function getProviderDir(packageName, providerType, manifest)
{
    var dir;
    if (!(packageName in chromeStructure.directories))
    {
        dir = new ChromeDirectory(chromeStructure, packageName, manifest);
        chromeStructure.directories[packageName] = dir;
    }

    if (!(providerType in chromeStructure.directories[packageName].directories))
    {
        dir = new ChromeDirectory(chromeStructure.directories[packageName],
                                  providerType, manifest);
        chromeStructure.directories[packageName].directories[providerType] = dir;
    }
    
    return chromeStructure.directories[packageName].directories[providerType];
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
    var line, params, rv = [];
    var uriForManifest = iosvc.newURI(getURLSpecFromFile(path), null, null);
    // Pick apart the manifest line by line.
    var lines = manifest.split("\n");
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
                // elem looks like: [chrome uri, path to manifest, flags (if any)]
                if (params.length > 2)
                    params[2] = params.slice(2).join(" ");
                else
                    params[2] = "";
                rv.push(["chrome://" + params[1] + "/" + params[0], path, params[2]]);
                break;
            case "override":
                if (params.length >= 3)
                {
                    try {
                        var resolvedURI = iosvc.newURI(params[2], null, uriForManifest);
                    } catch(ex) {}
                    if (resolvedURI)
                        chromeOverrides.push([params[1], resolvedURI.spec, path]);
                    else
                        chromeOverrides.push([params[1], params[2], path]);
                }

            // Otherwise, don't do anything.
        }
    }
    return rv;
}

function updateOverrides(callback)
{
    var overridden, override, manifest, overriddenURI, expectedURI, prob, desc;
    for (var i = 0; i < chromeOverrides.length; i++)
    {
        overridden = chromeOverrides[i][0];
        override = chromeOverrides[i][1];
        manifest = chromeOverrides[i][2];
        overriddenURI = iosvc.newURI(overridden, null, null);
        expectedURI = chromeReg.convertChromeURL(overriddenURI);
        if (expectedURI.spec != override)
        {
            desc = getStr("problem.override.notApplied", [overridden, override]);
            prob = {desc: desc, manifest: manifest, severity: "warning"};
            chromeBrowser.addProblem(prob);
        }
        else // OK, this thing got applied. Do stuff:
        {
            //xxxHack: unfortunately, if you do a chrome --> chrome override,
            //         the chrome Registry just gives you back the same chrome URL.
            //         We need to unwrap this so as to obtain a proper URI:
            while (expectedURI.scheme == "chrome")
                expectedURI = chromeReg.convertChromeURL(expectedURI);

            if (expectedURI.scheme == "file")
            {
                overrideFile(overridden, override, manifest);
            }
            else if (expectedURI.scheme == "jar")
            {
                overrideJar(overridden, override, expectedURI, manifest);
            }
            else
            {
                desc = getStr("problem.override.unrecognized.url",
                              [overridden, override]);
                prob = {desc: desc, manifest: manifest, severity: "error"};
                chromeBrowser.addProblem(prob);
            }
        }
    }
    setTimeout(callback, 0);
}

function overrideFile(overridden, override, manifest)
{
    var desc, prob, f = getFileFromURLSpec(override);
    // The file needs to exist.
    if (!f || !f.exists())
    {
        desc = getStr("problem.override.pathDoesNotExist", [overridden, override]);
        prob = {desc: desc, manifest: manifest, severity: "error"};
        chromeBrowser.addProblem(prob);
        return;
    }
    // Overriding directories is pretty useless.
    if (f.isDirectory())
    {
        desc = getStr("problem.override.isDir", [overridden, override]);
        prob = {desc: desc, manifest: manifest, severity: "warning"};
        chromeBrowser.addProblem(prob);
        return;
    }
    
    // Get a filesize neatly.
    try {
        var fileSize = f.fileSize;
    }
    catch (ex) { fileSize = 0; }
    
    addOverride(overridden, override, manifest, "file", fileSize);
    return;
}

function overrideJar(overridden, override, expectedURI, manifest)
{
    var desc, prob;
    try
    {
        var jarURI = expectedURI.QueryInterface(nsIJARURI);
        var jarFileURL = jarURI.JARFile.QueryInterface(nsIFileURL);

        // Doublecheck this jarfile exists:
        if (!jarFileURL.file.exists())
        {
            desc = getStr("problem.override.noJarFile", [overridden, override]);
            prob = {desc: desc, manifest: manifest, severity: "error"};
            chromeBrowser.addProblem(prob);
            return;
        }

        var zr = newObject("@mozilla.org/libjar/zip-reader;1", nsIZipReader);
        zr.open(jarFileURL.file);

        // If we've survived opening it, check if what we really want from it:
        var path = jarURI.directory;
        path = (path[0] == "/") ? path.substr(1) : path;
        // Oh, right. Don't try a directory. That's useless for overrides.
        if (path[path.length - 1] == "/")
        {
            desc = getStr("problem.override.isDir", [overridden, override]);
            prob = {desc: desc, manifest: manifest, severity: "error"};
            chromeBrowser.addProblem(prob);
            return;
        }
        // Right. So does it really have this file?
        var entry;

        try {
            entry = zr.getEntry(path);
            if (!entry)
                throw "NoEntryFound";
        }
        catch (ex)
        {
            var desc = getStr("problem.override.fileNotInJar", [overridden, override]);
            prob = {desc: desc, manifest: manifest, severity: "error"};
            chromeBrowser.addProblem(prob);
            return;
        }

        // Make sure it knows what we're talking 'bout.
        entry = entry.QueryInterface(Components.interfaces.nsIZipEntry);
        try
        {
            var fileSize = entry.realSize;
        }
        catch (ex) { fileSize = 0; }

        // Do it:
        addOverride(overridden, override, manifest, "jar", fileSize);
    }
    catch (ex)
    {
        // Uh oh.
        desc = getStr("problem.override.jarFailure", [overridden, override, ex]);
        prob = {desc: desc, manifest: manifest, severity: "warning"};
        chromeBrowser.addProblem(prob);
        return;
    }
    /*
     * Need: Overridden URL
     *       What to override with
     *       relevant manifest
     *       actual scheme
     *       size
     *       check if jarfile exists
     *       check if entry exists
     *       check if entry is directory
     */
}

function addOverride(overridden, override, manifest, scheme, size)
{
    // Alright. Get stuff.
    var chromeThingy = chromeStructure.findURL(overridden);
    if (!chromeThingy)
    {
        // So basically, you can override whatever you want.
        // It's hard to make a tree out of that.
        // We will try for a small bit, but not too long:
        var chromeThingyDir = overridden.replace(/[^\/]+$/, "");
        var chromeThingyFile = overridden.substr(chromeThingyDir.length);
        chromeThingy = chromeStructure.findURL(chromeThingyDir);
        if (!chromeThingy)
            return; // Still nothing, give up.

        chromeThingy = new ChromeFile(chromeThingy, chromeThingyFile, size);
    }
    chromeThingy.size = size;
    chromeThingy.manifest = manifest;
    chromeThingy.scheme = scheme;
    chromeThingy.resolvedURI = override;
    return;
}

