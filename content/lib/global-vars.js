let {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/Promise.jsm");

// Chrome stuff
let chromeStructure, chromeOverrides;
// UI stuff
let chrometree, chromedirtree;

// Unique ID stuff:
const ThunderbirdUUID = "{3550f703-e582-4d05-9a08-453d09bdfdc6}";
const FlockUUID = "{a463f10c-3994-11da-9945-000d60ca027b}";
const FirefoxUUID = "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

XPCOMUtils.defineLazyServiceGetter(this, "chromeReg", "@mozilla.org/chrome/chrome-registry;1", "nsIToolkitChromeRegistry");
XPCOMUtils.defineLazyServiceGetter(this, "atomsvc", "@mozilla.org/atom-service;1", "nsIAtomService");
XPCOMUtils.defineLazyServiceGetter(this, "protosvc", "@mozilla.org/uriloader/external-protocol-service;1", "nsIExternalProtocolService");
XPCOMUtils.defineLazyServiceGetter(this, "ClipboardHelper", "@mozilla.org/widget/clipboardhelper;1", "nsIClipboardHelper");

let ZipReader = Components.Constructor("@mozilla.org/libjar/zip-reader;1", "nsIZipReader", "open");
let NestedZipReader = Components.Constructor("@mozilla.org/libjar/zip-reader;1", "nsIZipReader", "openInner");
let LocalFile = Components.Constructor("@mozilla.org/file/local;1", "nsILocalFile", "initWithPath");


