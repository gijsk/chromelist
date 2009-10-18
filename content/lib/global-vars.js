// Chrome stuff
var chromeStructure, chromeOverrides;
// Services
var iosvc, chromeReg, consoleService, extManager;
// UI stuff
var chrometree, chromedirtree;

// Unique ID stuff:
const ThunderbirdUUID = "{3550f703-e582-4d05-9a08-453d09bdfdc6}";
const FlockUUID = "{a463f10c-3994-11da-9945-000d60ca027b}";
const FirefoxUUID = "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

// Components
const nsIJARURI = Components.interfaces.nsIJARURI;
const nsIFileURL = Components.interfaces.nsIFileURL;
const nsIZipReader = Components.interfaces.nsIZipReader;
const nsIZipEntry = Components.interfaces.nsIZipEntry;

// Initialize all of this...
function initGlobalVars()
{
    chrometree = document.getElementById("chrometree");
    chromedirtree = document.getElementById("chromedirtree");
    iosvc = getService("@mozilla.org/network/io-service;1", "nsIIOService");
    chromeReg = getService("@mozilla.org/chrome/chrome-registry;1",
                           "nsIToolkitChromeRegistry");

    consoleService = getService("@mozilla.org/consoleservice;1",
                                "nsIConsoleService");
    
    extManager = getService("@mozilla.org/extensions/manager;1",
                            "nsIExtensionManager");
}
