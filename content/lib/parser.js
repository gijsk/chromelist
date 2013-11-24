// Maps the chrome's structure.
// To be called once we're done:
var finalCallbackFunction;

// Progress bar division:
const PARSEPROGRESS = 25;
const MAXPROGRESS = 100;
const TREEPROGRESS = MAXPROGRESS - PARSEPROGRESS;

// Kickstart it all:
function refreshChromeList(chromeStructure, callback) {
  Task.spawn(function() {
    let chromeURLs = [];
    finalCallbackFunction = callback;

    // Fetch the manifests.
    let manifests = getManifests();
    // Reset status progress bar
    setStatusProgress(0);
    for (let i = 0; i < manifests.length; i++) {
      // Parse them:
      let contents = yield readManifest(manifests[i], manifests);
      if (contents) {
        // If there's something in it, parse it.
        let extraURLs = parseManifest(chromeStructure, contents, manifests[i], manifests);
        chromeURLs = chromeURLs.concat(extraURLs);
      }

      // Update stuff every now and then.
      if (i % 10 == 0)
        setStatusProgress(Math.floor(PARSEPROGRESS * i / manifests.length));
    }
    throw new Task.Result([chromeStructure, chromeURLs]);
  }).then(makeChromeTree, function(ex) {
    Cu.reportError(ex);
  });
}

function readManifest(manifestURL, manifestList) {
  let deferred = new Promise.defer();
  let req = new XMLHttpRequest();
  req.onload = function() {
    deferred.resolve(req.response);
  };
  req.onerror = function() {
    deferred.resolve("");
  };
  req.overrideMimeType('text/plain');
  req.open("get", manifestURL.spec, true);
  try {
    req.send();
  } catch (ex) { return ""; }
  return deferred.promise;
}

/**
 * Construct the chrome tree
 * @param chromeStructure {ChromeStruct} the chrome structure on which to build.
 * @param chromeURLs {array} the list of chrome URLs we have
 * @returns nothing!
 */
function makeChromeTree([chromeStructure, chromeURLs]) {
  setStatusText(getStr("info.status.mapping.chrome"));
  Task.spawn(function() {
    for (let i = 0; i < chromeURLs.length; i++) {
      // Expand our stored items:
      let [chromeURI, manifest, flags] = chromeURLs[i];
      // Extract base and package:
      let matches = chromeURI.match(/^chrome\:\/\/([^\/]+)\/([^\/]+)/i);
      let packagename = matches[1]; // Packagename
      let providertype = matches[2]; // Packagetype
      // Get the ChromeDirectory represented:
      let cDir = getProviderDir(chromeStructure, packagename, providertype, manifest, flags);
      // Find all the stuff underneath:
      addSubs(chromeStructure, cDir);

      // UI stuff + next one.
      if (i % 10 == 0)
        setStatusProgress(PARSEPROGRESS + (TREEPROGRESS * (i / chromeURLs.length)));
    }
  }).then(function() {
    try {
      updateOverrides(chromeStructure);
    } catch (ex) {
      Cu.reportError(ex);
    }
  }, function(ex) {
    Cu.reportError(ex);
  });
}

function getProviderDir(chromeStructure, packageName, providerType, manifest, flags) {
  var dir;
  if (!(packageName in chromeStructure.directories))
  {
    dir = new ChromeDirectory(chromeStructure, packageName, manifest);
    chromeStructure.directories[packageName] = dir;
  }

  dir = new ChromeDirectory(chromeStructure.directories[packageName],
      providerType, manifest, flags);
  chromeStructure.directories[packageName].directories[providerType] = dir;
  return chromeStructure.directories[packageName].directories[providerType];
}

function getManifests() {
  let manifests = Components.manager.getManifestLocations();
  let rv = [];
  for (let i = 0; i < manifests.length; i++) {
    let entry;
    try {
      entry = manifests.queryElementAt(i, Ci.nsIURI);
      rv.push(entry);
    } catch (ex) {
      Cu.reportError(ex);
    }
  }
  return rv;
}

// Parse a manifest.
function parseManifest(chromeStructure, manifestContents, path, manifestList)
{
  var line, params, flags, rv = [];
  var uriForManifest = path;
  // Pick apart the manifest line by line.
  var lines = manifestContents.split("\n");
  for (var i = 0; i < lines.length; i++)
  {
    line = stringTrim(lines[i]);
    if (!line) {
      continue;
    }
    params = line.split(/\s+/);

    // Switch based on the type of chrome mapping. Each kind has its own
    // syntax. See http://developer.mozilla.org/en/docs/Chrome_Manifest
    switch (params[0])
    {
      case "content":
      case "skin":
      case "locale":
        // elem looks like: [chrome uri, path to manifest, flags (if any)]
        flags = "";
        if (params[0] == "content")
          flags = params.slice(3).join(" ");
        else if (params[0] == "skin")
          flags = params.slice(4).join(" ");
        else if (params[0] == "locale")
          flags = params.slice(4).join(" ");
        rv.push(["chrome://" + params[1] + "/" + params[0], path, flags]);
        break;
      case "override":
        if (params.length >= 3) {
          // If this is a relative URL, need to resolve:
          try {
            var resolvedURI = Services.io.newURI(params[2], null, uriForManifest);
          } catch(ex) {}
          flags = params.slice(3).join(" ");
          if (resolvedURI)
            chromeStructure.overrides.push([params[1], resolvedURI.spec, path, flags]);
          else
            chromeStructure.overrides.push([params[1], params[2], path, flags]);
        }
        break;
      case "manifest":
        if (params.length) {
          let resolvedURI;
          try {
            resolvedURI = Services.io.newURI(params[1], null, uriForManifest);
          } catch(ex) {}
          if (resolvedURI) {
            manifestList.push(resolvedURI);
          }
        }
        // Otherwise, don't do anything.
    }
  }
  return rv;
}

function updateOverrides(chromeStructure, overrides, onlyOverrides)
{
  var overridden, override, manifest, flags, overriddenURI, expectedURI, overrideURI
  var prob, desc;
  var chromeOverrides = overrides;
  if (!chromeOverrides)
    chromeOverrides = chromeStructure.overrides;

  for (var i = 0; i < chromeOverrides.length; i++) {
    overridden = chromeOverrides[i][0];
    override = chromeOverrides[i][1];
    manifest = chromeOverrides[i][2];
    flags = chromeOverrides[i][3];
    overriddenURI = Services.io.newURI(overridden, null, null);
    try {
      expectedURI = getRealURI(overriddenURI);
      overrideURI = getRealURI(override);
    }
    catch (ex) { /* If this fails, the chrome URI being overridden does not exist: */}
    if ((!expectedURI || (expectedURI.spec != overrideURI.spec)) && flags == "")
    {
      desc = getStr("problem.override.notApplied", [overridden, override]);
      prob = {desc: desc, manifest: manifest, severity: "warning"};
      chromeBrowser.addProblem(prob);
    }
    else // OK, this thing got applied. Do stuff:
    {
      if (expectedURI.scheme == "file")
      {
        overrideFile(chromeStructure, overridden, override, expectedURI, manifest);
      }
      else if (expectedURI.scheme == "jar")
      {
        overrideJar(chromeStructure, overridden, override, expectedURI, manifest);
      }
      else if (expectedURI.scheme == "data")
      {
        overrideData(chromeStructure, overridden, override, expectedURI, manifest);
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
  if (!onlyOverrides) {
    setTimeout(updateFlags, 0, chromeStructure);
  }
}

function overrideFile(chromeStructure, overridden, override, expectedURI, manifest)
{
  var desc, prob, f = getFileFromURLSpec(expectedURI.spec);
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

  addOverride(chromeStructure, overridden, override, manifest, "file", fileSize);
  return;
}

function overrideJar(chromeStructure, overridden, override, expectedURI, manifest)
{
  let desc, prob;
  try {
    let jarURI = expectedURI.QueryInterface(Ci.nsIJARURI);
    let zr;
    try {
      zr = getZipReaderForJARURL(jarURI);
    } catch (ex) {
      if (ex && ex.result && ex.result == Cr.NS_ERROR_FILE_TARGET_DOES_NOT_EXIST) {
        desc = getStr("problem.override.noJarFile", [overridden, override]);
        prob = {desc: desc, manifest: manifest, severity: "error"};
        chromeBrowser.addProblem(prob);
      }
      throw ex; // Fall through to final catch block below
    }

    // If we've survived opening it, check if what we really want from it:
    var path = jarURI.JAREntry;
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
    entry = entry.QueryInterface(Ci.nsIZipEntry);
    try
    {
      var fileSize = entry.realSize;
    }
    catch (ex) { fileSize = 0; }

    // Do it:
    addOverride(chromeStructure, overridden, override, manifest, "jar", fileSize);
  }
  catch (ex)
  {
    // Uh oh.
    desc = getStr("problem.override.jarFailure", [overridden, override, ex]);
    prob = {desc: desc, manifest: manifest, severity: "warning"};
    chromeBrowser.addProblem(prob);
    return;
  }
}

function overrideData(chromeStructure, overridden, override, expectedURI, manifest)
{
  var size = expectedURI.spec.replace(/^data:[^,]*,/, "").length;
  addOverride(chromeStructure, overridden, override, manifest, "data", size);
}

function addOverride(chromeStructure, overridden, override, manifest, scheme, size)
{
  // Alright. Get stuff.
  var chromeThingy = chromeStructure.findURL(overridden);
  if (!chromeThingy)
  {
    // So basically, you can override whatever you want.
    // It's hard to make a tree out of that.
    // We will try for a small bit, but not too long:
    var chromeThingyDir = overridden.replace(/[^\/]+$/, "");
    chromeThingy = chromeStructure.findURL(chromeThingyDir);
    if (!chromeThingy)
      return; // Still nothing, give up.

    var chromeThingyFile = overridden.substr(chromeThingyDir.length);
    chromeThingy = new ChromeFile(chromeThingy, chromeThingyFile, size);
    chromeThingy.parent.files[chromeThingy.leafName] = chromeThingy;
  }
  chromeThingy.size = size;
  chromeThingy.manifest = manifest;
  chromeThingy.scheme = scheme;
  chromeThingy.resolvedURI = override;
  return;
}


/**
 * Updates all the skin/locale flags to include the flags enabled for the
 * content package that won't get parsed on skin/locale flags.
 * @param chromeStructure {ChromeStructure} the chrome structure to work on.
 */
function updateFlags(chromeStructure)
{
  for each (var pack in chromeStructure.directories)
  {
    var flags;
    if ("content" in pack.directories && (flags = pack.directories.content.flags))
    {
      var flagAry = flags.split(/\s+/g);
      var p = flags.match(/platform/);
      var xnw = flags.match(/xpcnativewrappers=(?:yes|no)/);
      var addedFlags = p ? p[0] : "";
      addedFlags += " " + (xnw ? xnw[0] : "");
      var otherProvs = [pack.directories[d] for (d in pack.directories) if (d != "content")];
      otherProvs.forEach(function(x) x.flags += addedFlags);
    }
  }
  setTimeout(finalCallbackFunction, 0);
}

/**
 * (re)parse this chrome structure part.
 * @param chromeStructure {ChromeStruct} the structure to stick this onto.
 * @param cDir {ChromeDirectory} the directory to further parse.
 * @returns nothing.
 */
function addSubs(chromeStructure, cDir)
{
  var nextRound = [cDir];
  while (nextRound.length > 0)
  {
    var currentCDir = nextRound.shift();
    var gen = chromeChildrenGenerator(chromeStructure, currentCDir);
    for (var c in gen)
    {
      if (c.TYPE == "ChromeDirectory")
      {
        currentCDir.directories[c.leafName] = c;
        // If the item c is a ChromeDirectory, we need to recurse:
        nextRound.push(c);
      }
      else
      {
        currentCDir.files[c.leafName] = c;
      }
    }
  }
}

/**
 * Generator for the children of a ChromeDirectory.
 * Does not walk directory tree recursively!
 */
function chromeChildrenGenerator(chromeStructure, cDir)
{
  try {
    var realURL = getRealURI(cDir.href);
  }
  catch (ex)
  {
    var desc = getStr("problem.convertChromeURL.failure", cDir.href);
    var prob = {desc: desc, manifest: cDir.manifest, severity: "error"};
    chromeBrowser.addProblem(prob);
    return;
  }

  var parentSpec = realURL.spec.replace(/[^\/]+$/, "");
  realURL = Services.io.newURI(parentSpec, null, null);
  // Create a generator for the actual thing. If we don't recognize the protocol,
  // error out.
  var innerGen;
  if (realURL.scheme == "jar")
  {
    innerGen = jarChildrenGenerator(chromeStructure, cDir, realURL);
  }
  else if (realURL.scheme == "file")
  {
    innerGen = fileChildrenGenerator(chromeStructure, cDir, realURL);
  }
  else
  {
    var desc = getStr("problem.unrecognized.url", [cDir.href, realURL.spec]);
    prob = {desc: desc, manifest: cDir.manifest, severity: "error"};
    chromeBrowser.addProblem(prob);
  }

  // Yield everything from the inner generator back to whatever is using us.
  for (var r in innerGen)
    yield r;
}

/**
 * Generator for children of a chrome URL mapped to a jar.
 * @param chromeURL {string} the URL to the chrome dir being mapped
 * @param realURL {nsIURI} the URL to the actual jar thing
 * @yields ChromeFile/ChromeDirectory for each child of the URL
 */
function jarChildrenGenerator(chromeStructure, cDir, realURL)
{
  var zr, entries, desc, prob;
  try {
    [zr, entries] = getEntriesInJARDir(realURL);
  } catch (ex) {
    if (ex && ex.result) {
      if (ex.result == Components.results.NS_ERROR_FILE_TARGET_DOES_NOT_EXIST) {
        desc = getStr("problem.fileNotInJar", [cDir.href, realURL.spec]);
        prob = {desc: desc, manifest: cDir.manifest, severity: "error",
          url: cDir.href, flags: cDir.flags};
        // FIXME document!
        chromeBrowser.addPossibleProblem(prob);
      } else if (ex.result == Components.results.NS_ERROR_FILE_NOT_FOUND) {
        desc = getStr("problem.noJarFile", [cDir.href, realURL.spec]);
        prob = {desc: desc, manifest: cDir.manifest, severity: "error",
          url: cDir.href, flags: cDir.flags};
        chromeBrowser.addProblem(prob);
        delete cDir.parent.directories[cDir.leafName];
      } else {
        logException(ex);
      }
      return;
    }
    logException(ex);
    return;
  }
  while (entries.hasMore())
  {
    var childName = entries.getNext();
    yield getChromeJARFile(cDir, zr, realURL, childName);
  }
  zr.close();
  return;
}

/**
 * Generator for children of a chrome URL mapped to a file.
 * @param cDir {ChromeDirectory} the chrome dir being mapped
 * @param realURL {nsIURI} the URL to the actual directory
 * @yields ChromeFile/ChromeDirectory for each item in the directory
 */
function fileChildrenGenerator(chromeStructure, cDir, realURL)
{
  var fURL = realURL.QueryInterface(Ci.nsIFileURL);
  var f = fURL.file;
  var desc, prob;

  // Assume we only get called once per parse, so throw errors:
  if (!f.exists())
  {
    desc = getStr("problem.noFile", [cDir.href, f.path]);
    prob = {desc: desc, manifest: cDir.manifest, severity: "error",
      url: cDir.href, flags: cDir.flags};
    chromeBrowser.addPossibleProblem(prob);
    return;
  }
  if (!f.isDirectory())
  {
    desc = getStr("problem.mappedToFile", [cDir.href, f.path]);
    prob = {desc: desc, manifest: cDir.manifest, severity: "error"};
    chromeBrowser.addProblem(prob);
    return;
  }

  var children = f.directoryEntries;
  var empty = !children.hasMoreElements();
  while (children.hasMoreElements())
  {
    var child = children.getNext().QueryInterface(Ci.nsIFile);
    yield getChromeFile(cDir, child);
  }

  // If we didn't find anything, that might be a problem:
  if ((cDir.level == 2) && empty)
  {
    desc = getStr("problem.mappedToEmptyDir", [cDir.href, f.path]);
    prob = {desc: desc, manifest: cDir.manifest, severity: "warning"};
    chromeBrowser.addProblem(prob);
  }
  return;
}

/**
 * Create a file object given the containing directory and the child
 * @param containingDir {ChromeDirectory} the chrome directory this file belongs to.
 * @param child {nsIFile} the file corresponding to the child in this chrome directory.
 * @returns {ChromeDirectory OR ChromeFile} the object corresponding to the child.
 * @note does NOT add the file to the list of children for the directory!!
 */
function getChromeFile(containingDir, child)
{
  var fileName = encodeURIComponent(child.leafName);
  var size;
  // Try to get a normal filesize, but for all we know this may fail.
  try
  {
    size = child.fileSize;
  }
  catch (ex) { size = 0; }
  if (!child.isDirectory())
    return new ChromeFile(containingDir, fileName, size);
  return new ChromeDirectory(containingDir, fileName);
}

/**
 * Create a file given the containing directory and the child's JARURI
 * @param containingDir {ChromeDirectory} the chrome directory this file belongs to.
 * @param zr {nsIZipReader} the zip reader that has the jar opened.
 * @param parentURL {nsIURI} the URL to the parent directory in the jar.
 * @param childName {string} the entry in the JAR file (INCLUDING the dir info!).
 * @returns {ChromeDirectory OR ChromeFile} the object corresponding to the child.
 * @note does NOT add the file to the list of children for the directory!!
 */
function getChromeJARFile(containingDir, zr, parentURL, childName)
{
  parentURL.QueryInterface(Ci.nsIJARURI);
  var parentEntry = parentURL.JAREntry;
  var child = zr.getEntry(childName).QueryInterface(Ci.nsIZipEntry);
  var leafName = encodeURIComponent(childName.substring(parentEntry.length));

  if (childName[childName.length - 1] == "/")
  {
    leafName = encodeURIComponent(childName.substring(parentEntry.length,
          childName.length - 1));
    return new ChromeDirectory(containingDir, leafName)
  }

  var size;
  try
  {
    size = child.realSize;
  }
  catch (ex) { size = 0; }
  return new ChromeFile(containingDir, leafName, size);
}

function filterOverrides(chromeStructure, filterURL)
{
  // Gives back a list of overrides:
  return chromeStructure.overrides.filter(function cof(item) { return item[0].indexOf(filterURL) == 0; });
}
