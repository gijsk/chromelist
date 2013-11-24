/**
 * Obtain the chrome registry's mapping for the URI given
 * @param uri the string or nsIURI uri to get the mapping for
 * @returns the chrome registry's info about the URI
 */
function getMappedURI(uri) {
  if (typeof uri == "string")
    uri = Services.io.newURI(uri, null, null);
  return chromeReg.convertChromeURL(uri);
}

/**
 * Obtain a real (file/jar) URI for the given URI.
 * @param uri the string or nsIURI uri to get a mapping for
 * @returns the corresponding URI
 */
function getRealURI(uri) {
  if (typeof uri == "string")
    uri = Services.io.newURI(uri, null, null)

      while (uri.scheme == "chrome")
        uri = chromeReg.convertChromeURL(uri);
  return uri;
  //if (typeof uri == "string")
  //    return iosvc.newChannel(uri, null, null).URI;
  //return iosvc.newChannelFromURI(uri).URI;
}

/**
 * Get a path to the jar file for a given jar: URI
 * @param uri {nsIURI OR string} the string or nsIURI uri to get a file path for
 * @returns {string} the corresponding path
 */
function getJARFileForURI(uri) {
  if (typeof uri == "string")
    uri = Services.io.newURI(uri, null, null);

  uri.QueryInterface(Components.interfaces.nsIJARURI);
  var file = getFileFromURLSpec(uri.JARFile.spec);
  return file.path;
}

/**
 * Get a path to the 'file' for anything:
 * @param uri to something
 * @returns the corresponding file path (to the jar if applicable)
 */
function getPathForURI(uri) {
  if (uri.substring(0, 4) == "file")
    return getFileFromURLSpec(uri).path;
  if (uri.substring(0, 3) == "jar")
    return getJARFileForURI(uri);
  return "";
}

/**
 * Get the entry path for a JAR URI
 * @param uri the jar URI (string or nsIURI)
 * @returns the entry path (string)
 */
function getDirInJAR(uri) {
  if (typeof uri == "string")
    uri = Services.io.newURI(uri, null, null);
  uri.QueryInterface(Components.interfaces.nsIJARURI);
  return uri.JAREntry;
}

/**
 * Get an enumerator for the entries in a dir in a JAR:
 * @param uri {nsIJARURI} the jar URI to find entries for
 * @returns {nsISimpleEnumerator} an enumerator of the entries.
 * @note modelled after nsJARDirectoryInputStream::Init
 */
function getEntriesInJARDir(fullURI) {
  fullURI.QueryInterface(Components.interfaces.nsIJARURI);
  let jarFileURL = fullURI.JARFile;
  let zr;
  if (jarFileURL.scheme == "jar") {
    jarFileURL.QueryInterface(Ci.nsIJARURI);
    let outerURL = jarFileURL.JARFile;
    outerURL.QueryInterface(Ci.nsIFileURL);
    let outerReader = new ZipReader(outerURL.file);
    zr = new NestedZipReader(outerReader, jarFileURL.JAREntry);
  } else {
    jarFileURL.QueryInterface(Ci.nsIFileURL);
    zr = new ZipReader(jarFileURL.file);
  }
  var strEntry = fullURI.JAREntry;
  // Be careful about empty entry (root of jar); nsIZipReader.getEntry balks
  if (strEntry)
  {
    var realEntry = zr.getEntry(strEntry);
    if (!realEntry.isDirectory)
      throw strEntry + " is not a directory!";
  }

  var escapedEntry = escapeJAREntryForFilter(strEntry);

  var filter = escapedEntry + "?*~" + escapedEntry + "?*/?*";
  return [zr, zr.findEntries(filter)];
}

/**
 * Escape all the characters that have a special meaning for nsIZipReader's special needs.
 * @param {string} original entry name
 * @returns {string} escaped entry name
 */
function escapeJAREntryForFilter(entryName) {
  return entryName.replace(/([\*\?\$\[\]\^\~\(\)\\])/g, "\\$1");
}

function getFileFromURLSpec(url) {
  let handler = Services.io.getProtocolHandler("file");
  handler = handler.QueryInterface(Ci.nsIFileProtocolHandler);
  let uri = Services.io.newURI(url, null, null);
  while (uri.scheme == "jar") {
    uri.QueryInterface(Ci.nsIJARURI);
    uri = uri.JARFile;
  }
  let rv = handler.getFileFromURLSpec(uri.spec);
  return rv;
}

/**
 * Get the spec of the URL from a file.
 * @param file {nsIFile OR string} the path to the file, or a file object
 * @returns the URL spec for the file.
 */
function getURLSpecFromFile (file) {
  if (!file)
    return null;

  if (typeof file == "string")
    file = new LocalFile(file);

  let fileHandler = Services.io.getProtocolHandler("file");
  fileHandler = fileHandler.QueryInterface(Ci.nsIFileProtocolHandler);
  return fileHandler.getURLSpecFromFile(file);
}
