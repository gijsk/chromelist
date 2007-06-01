var chrometree, chromedirtree;

function onLoad()
{
    chrometree = document.getElementById("chrometree");
    chromedirtree = document.getElementById("chromedirtree");
    iosvc = getService("@mozilla.org/network/io-service;1", "nsIIOService");
    chromeReg = getService("@mozilla.org/chrome/chrome-registry;1",
                           "nsIToolkitChromeRegistry");
    
    consoleService = getService("@mozilla.org/consoleservice;1",
                                "nsIConsoleService");

    chrometree.view = chromeTree;
    chromedirtree.view = chromeDirTree;
    
    chromeBrowser.init();
    setStatusText(getStr("info.status.reading.manifests"));
    setTimeout(refreshChromeList, 0, onLoadDone);
}

function onLoadDone()
{
    setStatusText(getStr("info.status.done"));
    setStatusProgress(-1);
    chromeTree.currentURL = "chrome://";
    chromeDirTree.changeDir("chrome://");
    
    if (chromeBrowser.foundProblems)
        document.getElementById("problem-button").setAttribute("disabled", false);
}

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
    this.foundProblems = false;
}

chromeBrowser.close =
function cb_close()
{
    //XXXgijs: Do we need to null out stuff here? Might be prudent...
    //         Also see onUnload.
    window.close();
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
        }
    }
    catch (ex)
    {
        logException(ex);
        return null;
    }
    return null; // Keep js happy (strict warning otherwise)
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
    if (!href)
    {
        alert("Couldn't get the URL for this file... sorry!");
        return;
    }

    var openInTab = this.getPref("open-files-in-tab");
    if (!openInTab)
    {
        openUILinkIn(href, "window");
        return;
    }
    openUILinkIn(href, "tab");
}

chromeBrowser.viewInCurrent =
function cb_viewInCurrent(href)
{
    if (!href)
    {
        alert("Couldn't get the URL for this file... sorry!");
        return;
    }
    openUILinkIn(href, "current");
}

chromeBrowser.viewInWindow =
function cb_viewInWindow(href)
{
    if (!href)
    {
        alert("Couldn't get the URL for this file... sorry!");
        return;
    }
    openUILinkIn(href, "window");
}

chromeBrowser.viewInTab =
function cb_viewInTab(href)
{
    if (!href)
    {
        alert("Couldn't get the URL for this file... sorry!");
        return;
    }
    openUILinkIn(href, "tab");
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

// LXR stuff.
chromeBrowser.lxr =
function cb_lxr(item)
{
    var openWhere = this.getPref("open-files-in-tab") ? "tab" : "window";
    if (item)
    {
        var searchString = encodeURIComponent(glimpseEscape(item.leafName));
        openUILinkIn(this.getPref("lxr-url").replace("%s", searchString), openWhere);
    }

}

// Properties stuff.
chromeBrowser.showProperties =
function cb_properties(item)
{
    var windowArgs = "scrollbars,chrome,resizable,dialog=no";
    window.openDialog("chrome://chromelist/content/properties.xul", "_blank", windowArgs, item);
}


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


