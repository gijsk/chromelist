// Main UI JS

// Starts the whole thing
function onLoad()
{
    initGlobalVars();
    chrometree.view = chromeTree;
    chromedirtree.view = chromeDirTree;

    chromeBrowser.chromeStructure = new ChromeStructure();
    chromeBrowser.newChromeStructure = null;

    chromeBrowser.init();
    setStatusText(getStr("info.status.reading.manifests"));
    setTimeout(refreshChromeList, 0, chromeBrowser.chromeStructure, onLoadDone);
}

// Basically finishes starting up after we've done all the background loading
function onLoadDone()
{
    setStatusText(getStr("info.status.done"));
    setStatusProgress(-1);

    chromeTree.currentURL = "chrome://";
    chromeDirTree.changeDir("chrome://");

    chromeBrowser.processPossibleProblems();
}

// Close up shop:
function onUnload()
{
    chrometree.view = null;
    chromedirtree.view = null;
}

var chromeBrowser = {}; // Global object.

chromeBrowser.init =
function cb_init()
{
    const PREF_CTRID = "@mozilla.org/preferences-service;1";
    const nsIPrefService = Components.interfaces.nsIPrefService;
    const nsIPrefBranch = Components.interfaces.nsIPrefBranch;
    const nsIPrefBranchInternal = Components.interfaces.nsIPrefBranchInternal;

    this.prefService =
        Components.classes[PREF_CTRID].getService(nsIPrefService);
    this.prefBranch = this.prefService.getBranch("extensions.chromelist.");
    this.prefBranchInternal =
        this.prefBranch.QueryInterface(nsIPrefBranchInternal);

    // Fit in, wherever we may be:
    this.initAppCompat();
    if (this.host == "Firefox")
    {
        var s = document.createElementNS(XHTML_NS, "html:script");
        s.setAttribute("src", "chrome://browser/content/utilityOverlay.js");
        s.setAttribute("type", "application/x-javascript");
        var ls = document.getElementById("last-script");
        var p = ls.parentNode;
        p.insertBefore(s, ls);
    }

    // Nothing done yet == no problems:
    this.foundProblems = false;
}

chromeBrowser.close =
function cb_close()
{
    //XXXgijs: Do we need to null out stuff here? Might be prudent...
    //         Also see onUnload.
    window.close();
}

chromeBrowser.initAppCompat =
function cb_initAppCompat()
{
    var app = getService("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
    if (!app)
    {
        alert("Dude, couldn't find nsIXULAppInfo. No good!");
        return;
    }
    
    switch (app.ID)
    {
        case FlockUUID:
        case FirefoxUUID:
             this.host = "Firefox";
             break;
        case ThunderbirdUUID:
             this.host = "Thunderbird";
             break;
        default:
             this.host = "Toolkit";
    }
    return;
}

chromeBrowser.showProblems =
function cb_showProblems()
{
    var existingWindow = getWindowByType("global:console");
    if (existingWindow)
    {
        existingWindow.focus();
        return;
    }
    
    var windowArgs = "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar";
    window.open("chrome://global/content/console.xul", "_blank", windowArgs);
}

chromeBrowser.addProblem =
function cb_addProblem(problem)
{
    var error = chromeError(problem.desc, problem.manifest, problem.severity);
    consoleService.logMessage(error);
    this.foundProblems = true;
}

chromeBrowser.addPossibleProblem =
function cb_addPossibleProblem(problem)
{
    if (!this.delayedProblems)
        this.delayedProblems = [];
    this.delayedProblems.push(problem);
}

// We post-procress problems that might not be problems: if you added content
// providers with flags, and they don't exist, but there are skin and/or locale
// providers, we should silently ignore the error.
chromeBrowser.processPossibleProblems =
function cb_processPossibleProblems()
{
    for (var i = 0; i < this.delayedProblems.length; i++)
    {
        var p = this.delayedProblems[i];

        // First, remove the actual thing. Note the odd workaround for delete's
        // behaviour here...
        var prov = this.chromeStructure.findURL(p.url);
        delete prov.parent.directories[prov.leafName];

        // Check if there are specific flags (platform or xpcnativewrappers):
        var flagAry = stringTrim(p.flags).split(/\s+/g);
        var contentSpecificFlags = flagAry.some(/platform|xpcnativewrappers/);

        // If this is a non-content package, or has no content-specific flags,
        // this is definitely a problem, so add it:
        if ((prov.leafName != "content") || !contentSpecificFlags)
        {
            this.addProblem(p);
            continue;
        }

        // and only if there are other providers that did work out:
        var packDirs = prov.parent.directories;
        if ("skin" in packDirs || "locale" in packDirs)
            continue;
        // Otherwise, this is a problem:
        this.addProblem(p);
    }
    if (this.foundProblems)
        document.getElementById("problem-button").setAttribute("disabled", false);
}

chromeBrowser.getPref =
function cb_getPref(prefName)
{
    var type = this.prefBranch.getPrefType(prefName);
    try
    {
        switch (type)
        {
            case Components.interfaces.nsIPrefBranch.PREF_INT:
                return this.prefBranch.getIntPref(prefName);
            case Components.interfaces.nsIPrefBranch.PREF_BOOL:
                return this.prefBranch.getBoolPref(prefName);
            case Components.interfaces.nsIPrefBranch.PREF_STRING:
                return this.prefBranch.getCharPref(prefName);
            default:
                throw "Unknown pref type: " + type + " !?";
        }
    }
    catch (ex)
    {
        logException(ex);
        return null;
    }
    return null; // Keep js happy (strict warning otherwise)
}

chromeBrowser.setPref =
function cb_setPref(prefName, newValue)
{
    var type = this.prefBranch.getPrefType(prefName);
    try
    {
        switch (type)
        {
            case Components.interfaces.nsIPrefBranch.PREF_INT:
                return this.prefBranch.setIntPref(prefName, newValue);
            case Components.interfaces.nsIPrefBranch.PREF_BOOL:
                return this.prefBranch.setBoolPref(prefName, newValue);
            case Components.interfaces.nsIPrefBranch.PREF_STRING:
                return this.prefBranch.setCharPref(prefName, newValue);
            default:
                throw "Unknown pref type: " + type + " !?";
        }
    }
    catch (ex)
    {
        logException(ex);
        return null;
    }
}

////////////////////////////////////////////////////////////////
// View stuff.

chromeBrowser.viewSourceOf =
function cb_viewSourceOf(href)
{
    const vsURL = "chrome://global/content/viewSource.xul";
    // Create a window.
    openDialog(vsURL, "_blank", "chrome,all,dialog=no", href);
}

chromeBrowser.view =
function cb_view(href)
{
    const PROTO_CID = "@mozilla.org/uriloader/external-protocol-service;1";
    if (!href)
    {
        alert(getStr("error.no.url.for.file"));
        return;
    }

    if (this.host == "Firefox")
    {
        var openInTab = this.getPref("open-files-in-tab");
        if (!openInTab)
        {
            openUILinkIn(href, "window");
            return;
        }
        openUILinkIn(href, "tab");
        return;
    }
    else if (this.host == "Thunderbird")
    {
        try {
            var msngr = newObject("@mozilla.org/messenger;1", "nsIMessenger");
        } catch (ex) {
            alert(getStr("error.launching.url", [ex]));
        }
        if (msngr)
            msngr.launchExternalURL(href);
    }
    else if (this.host == "Toolkit")
    {
        const extProtoSvc = getService(PROTO_CID, "nsIExternalProtocolService");
        var uri = iosvc.newURI(href, "UTF-8", null);
        extProtoSvc.loadUrl(uri);
    }
}

chromeBrowser.viewInCurrent =
function cb_viewInCurrent(href)
{
    if (!href)
    {
        alert(getStr("error.no.url.for.file"));
        return;
    }
    openUILinkIn(href, "current");
}

chromeBrowser.viewInWindow =
function cb_viewInWindow(href)
{
    if (!href)
    {
        alert(getStr("error.no.url.for.file"));
        return;
    }
    openUILinkIn(href, "window");
}

chromeBrowser.viewInTab =
function cb_viewInTab(href)
{
    if (!href)
    {
        alert(getStr("error.no.url.for.file"));
        return;
    }
    openUILinkIn(href, "tab");
}

chromeBrowser.launch =
function cb_launch(item)
{
    // Code adapted from http://developer.mozilla.org/en/docs/Code_snippets:Running_applications
    // Per the site, it may not be implemented on some platforms
    var file = newObject("@mozilla.org/file/local;1", "nsILocalFile");
    file.initWithPath(item.path);
    file.launch();
}

chromeBrowser.refresh =
function cb_refresh(item)
{
    // Make sure we have a directory:
    item = item.parent;
    item.directories = {};
    item.files = {};
    addSubs(chromeBrowser.chromeStructure, item);
    chromeTree.currentURL = item.href;
    chromeDirTree.changeDir(item.href);


}

////////////////////////////////////////////////////////////////
// Copy stuff.

chromeBrowser.copy =
function cb_copy(item, prop)
{
    try {
        var clipboardhelper = getService("@mozilla.org/widget/clipboardhelper;1",
                                         "nsIClipboardHelper");
    }
    catch (ex) {};
    if (!item || !clipboardhelper || !(prop in item))
        return;

    clipboardhelper.copyString(item[prop]);
}

// Save stuff.
chromeBrowser.saveAs =
function cb_saveAs(href)
{
    if (!href)
    {
        alert("Couldn't get the URL for this file... sorry!");
        return;
    }
    saveURL(href, null, null, false, false, null);
}

chromeBrowser.replace =
function cb_replace(item)
{
    var path = item.path;
    // Check if user really wants to do this:
    if (this.getPref("replace.prompt"))
    {
        var alwaysPrompt = {value: true};
        var reply = confirmEx(getStr("replace.confirm"),
                              [getStr("replace.confirm.replace"), getStr("replace.confirm.cancel")],
                              0,
                              getStr("replace.confirm.remind"), alwaysPrompt,
                              window,
                              getStr("replace.confirm.title"));
        if (reply == 1)
            return;
        this.setPref("replace.prompt", alwaysPrompt.value);
    }

    // So we continue:
    var originalExtIndex  = item.leafName.lastIndexOf(".");
    var fileExtension = item.leafName.substring(originalExtIndex + 1);
    var filters = [[fileExtension.toUpperCase() + " files", "*." + fileExtension]];
    var filePickerResult = pickOpen(null, filters, item.leafName);
    if (filePickerResult.reason != PICK_OK)
        return;
    try {
        if (item.scheme == "jar")
            this._replaceFileInJar(path, getDirInJAR(item.resolvedURI), filePickerResult.file);
        else
            this._replaceFile(path, filePickerResult.file);
    }
    catch (ex)
    {
        logException(ex);
        alert(getStr("error.replacing.file", [formatException(ex)]));
        return;
    }
    this.refresh(item);
}

chromeBrowser._replaceFile =
function cb_internalReplaceFile(destPath, sourceFile)
{
    var f = nsLocalFile(destPath);
    var originalF = nsLocalFile(destPath);
    var targetName = f.leafName;
    // What can I say, the copyTo API sucks. It won't overwrite files, ever.
    // So, we try to do our own logic here...
    // First, move the file to a unique name:
    f.createUnique(0, 0700);
    originalF.moveTo(null, f.leafName);
    // Then, try to copy the new file.
    try {
        sourceFile.copyTo(f.parent, targetName);
    }
    catch (ex)
    {
        // If this fails, move the backup back, and re-throw the exception.
        f.moveTo(null, targetName);
        throw ex;
    }
    // If we get here, we managed: destroy the original (moved) file:
    originalF.remove(false);
}

chromeBrowser._replaceFileInJar =
function cb_internalReplaceFileInJar(jarPath, jarEntry, filePath)
{
    // FIXME this should copy to temp, replace, and then copy back, to avoid
    // quota restrictions and so on.
    writeFileToJar(jarPath, jarEntry, filePath);
}

// LXR stuff.
chromeBrowser.lxr =
function cb_lxr(item)
{
    if (item)
    {
        var searchString = encodeURIComponent(glimpseEscape(item.leafName));
        var href = this.getPref("lxr-url").replace("%s", searchString);
        this.view(href);
    }
}

// Properties stuff.
chromeBrowser.showProperties =
function cb_properties(item)
{
    var windowArgs = "scrollbars,chrome,resizable,dialog=no";
    window.openDialog("chrome://chromelist/content/ui/props/properties.xul", "_blank", windowArgs, item);
}

chromeBrowser.host = "Unknown";


// Error in chrome registration reported to console:
function chromeError(message, file, severity)
{
    const SCRIPT_ERROR_IID = "@mozilla.org/scripterror;1";
    var scriptError = newObject(SCRIPT_ERROR_IID, "nsIScriptError");
    var flags = Components.interfaces.nsIScriptError.errorFlag;
    if (severity == "warning")
        flags = Components.interfaces.nsIScriptError.warningFlag;

    scriptError.init(message, file, null, null, null, flags, null);
    return scriptError;
}


