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
  let i, urlparts, currentNode = this;
  url = url.replace(/^chrome:\/\//, "");
  urlparts = url.split("/");
  for (i = 0; i < urlparts.length; i++) {
    let name = decodeURIComponent(urlparts[i]);
    if (currentNode.directories && (name in currentNode.directories))
      currentNode = currentNode.directories[name];
    else if (currentNode.files && (name in currentNode.files))
      currentNode = currentNode.files[name];
    else if (name != "")
      return null;
  }
  return currentNode;
}

ChromeStructure.prototype.updateFilteredState =
function cs_updateFilteredState(expr) {
  for (let k in this.directories) {
    matchesExpression(this.directories[k], expr);
  }
}

function matchesExpression(obj, expr) {
  const CHROME_SCHEME_LEN = "chrome://".length;
  if (!obj || !expr || (obj.filtered && obj.filtered.indexOf(expr) > -1))
    return true;

  if (expr.indexOf(obj.unfiltered) > -1)
    return false;

  if (obj.leafName.indexOf(expr) > -1 ||
      obj.href.indexOf(expr) > CHROME_SCHEME_LEN) {
    obj.filtered = expr;
    return true;
  }

  if (obj.isDirectory) {
    for (var k in obj.files) {
      if (k.indexOf(expr) > -1 || obj.files[k].href.indexOf(expr) > CHROME_SCHEME_LEN) {
        obj.filtered = expr;
        obj.files[k].filtered = expr;
        return true;
      }
    }
    for (var k in obj.directories) {
      var dir = obj.directories[k];
      if (matchesExpression(dir, expr)) {
        obj.filtered = expr;
        return true;
      }
    }
  }
  if (!obj.unfiltered || expr.indexOf(obj.unfiltered) == -1) {
    obj.unfiltered = expr;
  }
  return false;
}
///////////////////

///////////////////
// ChromeDirectory
// Constructor
// Note: name is expected to be URI-encoded
function ChromeDirectory(someParent, name, manifestURI, flags) {
  this.parent = someParent;
  this.href = this.parent.href + name + "/";
  this.level = this.parent.level + 1;
  // If this is somewhere down, resolve stuff:
  if (this.level >= 2) {
    var resolvedURI = chromeReg.convertChromeURL(Services.io.newURI(this.href, null, null));
    this.scheme = resolvedURI.scheme;
    this.resolvedURI = resolvedURI.spec;
    if (this.level == 2) // we're looking at the magic file for our resolved URI, fix:
      this.resolvedURI = this.resolvedURI.replace(/[^\/]+$/, "");
  } else {
    // Otherwise, we don't know:
    this.scheme = "unknown";
    this.resolvedURI = "";
  }
  // We'll have directories and files underneath this (or might, anyway):
  this.directories = new Object();
  this.files = new Object();
  // And we need to store the manifest used to register this:
  if (manifestURI)
    this.manifestURI = manifestURI;
  else
    this.manifestURI = this.parent.manifestURI;

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
function cd_getPath() {
  try {
    var path = getPathForURI(this.resolvedURI);
  } catch (ex) { logException(ex); return ""; }
  return path;
};

ChromeDirectory.prototype.getManifestURI =
function cd_getManifestURI() {
  return this.manifestURI;
}

ChromeDirectory.prototype._addon = "";
ChromeDirectory.prototype.getAddon =
function cd_getAddOn() {
  if (this._addon)
    return this._addon;

  let manifestURI = this.getManifestURI();
  if (!manifestURI) {
    return null;
  }

  let jarFileOrFile;
  if (manifestURI instanceof Ci.nsIJARURI) {
    manifestURI.QueryInterface(Ci.nsIJARURI);
    let jarFileURI = manifestURI.JARFile;
    let jarFile = getFileFromURLSpec(jarFileURI.spec);
    let appDir = Services.dirsvc.get("GreD", Ci.nsIFile);
    if (appDir.contains(jarFile) && jarFile.leafName == "omni.ja") {
      return getStr("not.an.addon");
    }
  }

  var m = manifestURI.spec.match(/\/([^\/]+)\/chrome.manifest$/);
  if (!m) {
    this._addon = getStr("not.an.addon");
  } else {
    let id = m[1].replace(/\.xpi!$/gi, "");
    this._addon = new Promise(resolve => {
      AddonManager.getAddonByID(decodeURIComponent(id), function(addon) {
        this._addon = addon ? addon.name : getStr("addon.not.found", [id]);
        resolve(this._addon);
      }.bind(this));
    });
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
function ChromeFile(parent, name, size) {
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
ChromeFile.prototype.getManifestURI =
function cf_getManifestURI() {
  var obj = this;
  while (!("manifestURI" in obj))
  {
    if (obj.TYPE == "ChromeStructure")
      return null;
    obj = obj.parent;
  }
  return obj.manifestURI;
}

// Same as for directories
ChromeFile.prototype.getPath = ChromeDirectory.prototype.getPath;
ChromeFile.prototype._addon = "";
ChromeFile.prototype.getAddon = ChromeDirectory.prototype.getAddon;
///////////////////
