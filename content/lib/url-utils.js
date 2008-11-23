/**
 * Obtain the chrome registry's mapping for the URI given
 * @param uri the string or nsIURI uri to get the mapping for
 * @returns the chrome registry's info about the URI
 */
function getMappedURI(uri)
{
    if (typeof uri == "string")
        uri = iosvc.newURI(uri, null, null);
    return chromeReg.convertChromeURL(uri);
}

/**
 * Obtain a real (file/jar) URI for the given URI.
 * @param uri the string or nsIURI uri to get a mapping for
 * @returns the corresponding URI
 */
function getRealURI(uri)
{
    if (typeof uri == "string")
        uri = iosvc.newURI(uri, null, null)
    
    while (uri.scheme == "chrome")
        uri = chromeReg.convertChromeURL(uri);
    return uri;
    //if (typeof uri == "string")
    //    return iosvc.newChannel(uri, null, null).URI;
    //return iosvc.newChannelFromURI(uri).URI;
}

/**
 * Get a path to the jar file for a given jar: URI
 * @param uri the string or nsIURI uri to get a file path for
 * @returns the corresponding URI
 */
function getJARFileForURI(uri)
{
    if (typeof uri == "string")
        uri = iosvc.newURI(uri, null, null);

    uri.QueryInterface(Components.interfaces.nsIJARURI);
    var file = getFileFromURLSpec(uri.JARFile.spec);
    return file.path;
}

/**
 * Get a path to the 'file' for anything:
 * @param uri to something
 * @returns the corresponding file path (to the jar if applicable)
 */
function getPathForURI(uri)
{
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
function getDirInJAR(uri)
{
    if (typeof uri == "string")
        uri = iosvc.newURI(uri, null, null);
    uri.QueryInterface(Components.interfaces.nsIJARURI);
    // FIXME
}

function getFileFromURLSpec(url)
{
    const nsIFileProtocolHandler = Components.interfaces.nsIFileProtocolHandler;
    var handler = iosvc.getProtocolHandler("file");
    handler = handler.QueryInterface(nsIFileProtocolHandler);
    return handler.getFileFromURLSpec(url);
}

function getURLSpecFromFile (file)
{
    if (!file)
        return null;

    const IOS_CTRID = "@mozilla.org/network/io-service;1";
    const nsIIOService = Components.interfaces.nsIIOService;

    if (typeof file == "string")
        file = localFile(file);

    var service = Components.classes[IOS_CTRID].getService(nsIIOService);
    var nsIFileProtocolHandler = Components.interfaces.nsIFileProtocolHandler;
    var fileHandler = service.getProtocolHandler("file");
    fileHandler = fileHandler.QueryInterface(nsIFileProtocolHandler);
    return fileHandler.getURLSpecFromFile(file);
}

function localFile(path)
{
    const LOCALFILE_CTRID = "@mozilla.org/file/local;1";
    const nsILocalFile = Components.interfaces.nsILocalFile;

    if (typeof path == "string")
    {
        var fileObj =
            Components.classes[LOCALFILE_CTRID].createInstance(nsILocalFile);
        fileObj.initWithPath(path);
        return fileObj;
    }
    return null;
}
