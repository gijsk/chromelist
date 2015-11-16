/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Main UI JS

// Starts the whole thing
function onLoad() {
  chrometree = document.getElementById("chrometree");
  chromedirtree = document.getElementById("chromedirtree");
  chrometree.view = chromeTree;
  chromedirtree.view = chromeDirTree;

  chromeBrowser.chromeStructure = new ChromeStructure();
  chromeBrowser.newChromeStructure = null;

  chromeBrowser.init();
  setStatusText(getStr("info.status.reading.manifests"));
  setTimeout(refreshChromeList, 0, chromeBrowser.chromeStructure, onLoadDone);
}

// Basically finishes starting up after we've done all the background loading
function onLoadDone() {
  setStatusText(getStr("info.status.done"));
  setStatusProgress(-1);

  chromeTree.currentURL = "chrome://";
  chromeDirTree.changeDir("chrome://");

  chromeBrowser.processPossibleProblems();
  var sf = document.getElementById("searchFilter");
  sf.addEventListener("command", chromeBrowser.updateSearch, true);
}

// Close up shop:
function onUnload() {
  var sf = document.getElementById("searchFilter");
  sf.removeEventListener("command", chromeBrowser.updateSearch, true);
  chrometree.view = null;
  chromedirtree.view = null;
}

var chromeBrowser = {}; // Global object.

chromeBrowser.init =
function cb_init() {
  this.prefService = Services.prefs;
  this.prefBranch = this.prefService.getBranch("extensions.chromelist.");

  // Fit in, wherever we may be:
  this.initAppCompat();
  if (this.host == "Firefox") {
    var s = document.createElementNS(XHTML_NS, "html:script");
    s.setAttribute("src", "chrome://browser/content/utilityOverlay.js");
    s.setAttribute("type", "application/x-javascript;version=1.8");
    var ls = document.getElementById("last-script");
    var p = ls.parentNode;
    p.insertBefore(s, ls);
  }

  // Nothing done yet == no problems:
  this.foundProblems = false;
}

chromeBrowser.close =
function cb_close() {
  //XXXgijs: Do we need to null out stuff here? Might be prudent...
  //         Also see onUnload.
  window.close();
}

chromeBrowser.initAppCompat =
function cb_initAppCompat() {
  switch (Services.appinfo.ID) {
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
function cb_showProblems() {
  var existingWindow = getWindowByType("global:console");
  if (existingWindow) {
    existingWindow.focus();
    return;
  }

  var windowArgs = "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar";
  window.open("chrome://global/content/console.xul", "_blank", windowArgs);
}

chromeBrowser.addProblem =
function cb_addProblem(problem) {
  var error = chromeError(problem.desc, problem.manifestURI, problem.severity);
  Services.console.logMessage(error);
  this.foundProblems = true;
}

chromeBrowser.addPossibleProblem =
function cb_addPossibleProblem(problem) {
  if (!this.delayedProblems)
    this.delayedProblems = [];
  this.delayedProblems.push(problem);
}

// We post-procress problems that might not be problems: if you added content
// providers with flags, and they don't exist, but there are skin and/or locale
// providers, we should silently ignore the error.
chromeBrowser.processPossibleProblems =
function cb_processPossibleProblems() {
  for (var i = 0; i < this.delayedProblems.length; i++) {
    var p = this.delayedProblems[i];

    // First, remove the actual thing, if it was ever added.
    // Note the odd workaround for delete's behaviour here...
    var prov = this.chromeStructure.findURL(p.url);
    if (prov) {
      var provParent = prov.parent; // use this later.
      delete provParent.directories[prov.leafName];
      var isContent = prov.leafName == "content";
    } else {
      isContent = p.url.match(/chrome:\/\/[^\/]+\/content/i);
      if (isContent) {
        var parentURL = p.url.replace(/content\/?$/, "");
        provParent = this.chromeStructure.findURL(parentURL);
      }
    }

    // Check if there are specific flags (platform or xpcnativewrappers):
    var flagAry = stringTrim(p.flags).split(/\s+/g);
    var contentSpecificFlags = flagAry.some((x) => /platform|xpcnativewrappers/.test(x));

    // If this is not a content package,
    // or it is a content package with no content-specific flags,
    // this is definitely a problem, so add it:
    if (!isContent || !contentSpecificFlags) {
      this.addProblem(p);
      continue;
    }

    // So if this is a content package, with content-specific flags,
    // and if there are other providers that did work out,
    // this is not a problem (eg. global-region registration in Fx 3)
    // Hack for absence of provParent...
    var packDirs = provParent ? provParent.directories : {};
    if ("skin" in packDirs || "locale" in packDirs)
      continue;
    // Otherwise, this is a problem:
    this.addProblem(p);
  }
  this._enableProblemBtn();
}

chromeBrowser._enableProblemBtn =
function cb_enableProblemBtn() {
  if (this.foundProblems) {
    var problemBtn = document.getElementById("problem-button");
    problemBtn.setAttribute("disabled", false);
    problemBtn.setAttribute("label", getStr("btn.problems"));
  }
}

chromeBrowser.getPref =
function cb_getPref(prefName) {
  var type = this.prefBranch.getPrefType(prefName);
  try {
    switch (type) {
      case Ci.nsIPrefBranch.PREF_INT:
        return this.prefBranch.getIntPref(prefName);
      case Ci.nsIPrefBranch.PREF_BOOL:
        return this.prefBranch.getBoolPref(prefName);
      case Ci.nsIPrefBranch.PREF_STRING:
        return this.prefBranch.getCharPref(prefName);
      default:
        throw "Unknown pref type: " + type + " !?";
    }
  }
  catch (ex) {
    logException(ex);
    return null;
  }
  return null; // Keep js happy (strict warning otherwise)
}

chromeBrowser.setPref =
function cb_setPref(prefName, newValue) {
  var type = this.prefBranch.getPrefType(prefName);
  try {
    switch (type) {
      case Ci.nsIPrefBranch.PREF_INT:
        return this.prefBranch.setIntPref(prefName, newValue);
      case Ci.nsIPrefBranch.PREF_BOOL:
        return this.prefBranch.setBoolPref(prefName, newValue);
      case Ci.nsIPrefBranch.PREF_STRING:
        return this.prefBranch.setCharPref(prefName, newValue);
      default:
        throw "Unknown pref type: " + type + " !?";
    }
  } catch (ex) {
    logException(ex);
    return null;
  }
}

////////////////////////////////////////////////////////////////
// View stuff.

chromeBrowser.viewSourceOf =
function cb_viewSourceOf(href) {
  const vsURL = "chrome://global/content/viewSource.xul";
  // Create a window.
  openDialog(vsURL, "_blank", "chrome,all,dialog=no", href);
}

chromeBrowser.view =
function cb_view(href) {
  if (!href) {
    alert(getStr("error.no.url.for.file"));
    return;
  }

  if (this.host == "Firefox") {
    var openInTab = this.getPref("open-files-in-tab");
    if (!openInTab) {
      openUILinkIn(href, "window");
      return;
    }
    openUILinkIn(href, "tab");
    return;
  }
  if (this.host == "Thunderbird") {
    try {
      var msngr = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
    } catch (ex) {
      alert(getStr("error.launching.url", [ex]));
    }
    if (msngr) {
      msngr.launchExternalURL(href);
    }
    return;
  }
    var uri = Services.io.newURI(href, "UTF-8", null);
    extProtoSvc.loadUrl(uri);
}

chromeBrowser.viewInCurrent =
function cb_viewInCurrent(href) {
  if (!href) {
    alert(getStr("error.no.url.for.file"));
    return;
  }
  openUILinkIn(href, "current");
}

chromeBrowser.viewInWindow =
function cb_viewInWindow(href) {
  if (!href) {
    alert(getStr("error.no.url.for.file"));
    return;
  }
  openUILinkIn(href, "window");
}

chromeBrowser.viewInTab =
function cb_viewInTab(href) {
  if (!href) {
    alert(getStr("error.no.url.for.file"));
    return;
  }
  openUILinkIn(href, "tab");
}

chromeBrowser.launch =
function cb_launch(item) {
  (new FileRef(item.path)).launch();
}

chromeBrowser.showManifest =
function cb_showManifest(item) {
  (new FileRef(item.path)).reveal();
}

chromeBrowser.refresh =
function cb_refresh(item) {
  // Make sure we have a directory:
  if (item.level == 1)
    alert("This shouldn't have happened, huh?!");
  item = item.parent;
  // If item is too low, run on all children:
  if (item.level == 1) {
    for (var k in item.directories)
      this._refresh(item.directories[k]);
  }
  else {
    this._refresh(item);
  }
  this._enableProblemBtn();
}

/**
 * This one does the actual refresh on this particular item...
 */
chromeBrowser._refresh =
function cb__refresh(item) {
  item.directories = {};
  item.files = {};
  var href = item.href;
  var overrides = filterOverrides(this.chromeStructure, href);
  addSubs(this.chromeStructure, item);
  updateOverrides(this.chromeStructure, overrides, true);
  chromeTree.currentURL = href;
  chromeDirTree.changeDir(href);
}

////////////////////////////////////////////////////////////////
// Copy stuff.

chromeBrowser.copy =
function cb_copy(item, prop) {
  if (!item || !(prop in item))
    return;

  ClipboardHelper.copyString(item[prop]);
}

// Save stuff.
chromeBrowser.saveAs =
function cb_saveAs(href) {
  if (!href) {
    alert("Couldn't get the URL for this file... sorry!");
    return;
  }
  saveURL(href, null, null, false, false, null, document, false);
}

chromeBrowser.replace =
function cb_replace(item) {
  if (item.scheme == "data") {
    alert(getStr("replace.dataurl"));
    return;
  }
  var path = item.path;
  // Check if user really wants to do this:
  if (this.getPref("replace.prompt")) {
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
  } catch (ex) {
    logException(ex);
    alert(getStr("error.replacing.file", [formatException(ex)]));
    return;
  }
  this.refresh(item);
}

chromeBrowser._replaceFile =
function cb_internalReplaceFile(destPath, sourceFile) {
  var f = new LocalFile(destPath);
  var originalF = new LocalFile(destPath);
  var targetName = f.leafName;
  // What can I say, the copyTo API sucks. It won't overwrite files, ever.
  // So, we try to do our own logic here...
  // First, move the file to a unique name:
  f.createUnique(0, 0700);
  originalF.moveTo(null, f.leafName);
  // Then, try to copy the new file.
  try {
    sourceFile.copyTo(f.parent, targetName);
  } catch (ex) {
    // If this fails, move the backup back, and re-throw the exception.
    f.moveTo(null, targetName);
    throw ex;
  }
  // If we get here, we managed: destroy the original (moved) file:
  originalF.remove(false);
}

chromeBrowser._replaceFileInJar =
function cb_internalReplaceFileInJar(jarPath, jarEntry, filePath) {
  // FIXME this should copy to temp, replace, and then copy back, to avoid
  // quota restrictions and so on.
  writeFileToJar(jarPath, jarEntry, filePath);
}

// LXR stuff.
chromeBrowser.lxr =
function cb_lxr(item) {
  if (item) {
    var searchString = encodeURIComponent(glimpseEscape(item.leafName));
    var href = this.getPref("lxr-url").replace("%s", searchString);
    this.view(href);
  }
}

// Search stuff.
chromeBrowser.updateSearch =
function cb_updateSearch(e) {
  var searchTerm = document.getElementById("searchFilter").value;
  chromeBrowser.search.expr = searchTerm;
}

chromeBrowser.search = new Object();
chromeBrowser.search._update =
function ct_s_up(newExpr) {
  this._expr = newExpr.trim();
  var treeBox = document.getElementById("chrometreebox");

  chromeBrowser.chromeStructure.updateFilteredState(this._expr);

  if (!this._expr) {
    treeBox.removeAttribute("filtered");
    chromeDirTree.invalidate();
  } else {
    treeBox.setAttribute("filtered", "true");
    chromeTree.sort();
    chromeDirTree.sort();
  }
  chromeTree.treebox.clearStyleAndImageCaches();
  chromeDirTree.treebox.clearStyleAndImageCaches();
}
chromeBrowser.search.__defineGetter__("expr", function _getSearch() { return this._expr;});
chromeBrowser.search.__defineSetter__("expr", chromeBrowser.search._update);


// Properties stuff.
chromeBrowser.showProperties =
function cb_properties(item) {
  var windowArgs = "scrollbars,chrome,resizable,dialog=no";
  window.openDialog("chrome://chromelist/content/ui/props/properties.xul", "_blank", windowArgs, item);
}

chromeBrowser.host = "Unknown";


// Error in chrome registration reported to console:
function chromeError(message, file, severity) {
  const SCRIPT_ERROR_IID = "@mozilla.org/scripterror;1";
  var scriptError = Cc[SCRIPT_ERROR_IID].createInstance(Ci.nsIScriptError);
  var flags = Ci.nsIScriptError.errorFlag;
  if (severity == "warning")
    flags = Ci.nsIScriptError.warningFlag;

  scriptError.init(message, (file && file.spec) || null, null, null, null, flags, null);
  return scriptError;
}


