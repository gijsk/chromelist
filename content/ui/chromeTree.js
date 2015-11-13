/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/*
 * Large portions of this code are taken literally or partially from code for
 * the FireFTP extension by Mime Cuvalo. Many thanks to him for writing the
 * original code.
 */

var bytesMode = false;

var chromeTree = {
  data:                 new Array(),
  rowCount:             0,
  getCellText:          ct_getCellText,
  getCellProperties:    ct_getCellProperties,
  getExtension:         ct_getExtension,
  getImageSrc:          ct_getImageSrc,
  getFileIcon:          ct_getFileIcon,
  cycleHeader:          ct_cycleHeader,
  updateView:           ct_updateView,
  getParentIndex:       function(row)               { return -1; },
  getColumnProperties:  function(colid, col)        {},
  getLevel:             function(row)               { return 0; },
  getRowProperties:     ct_getRowProperties,
  isContainer:          function(row)               { return false; },
  isSeparator:          function(row)               { return false; },
  isSorted:             function(row)               { return false; },
  setTree:              function(treebox)           { this.treebox = treebox; },
  sort:                 ct_sort,
  getFormattedFileSize: ct_getFormattedFileSize,
  click:                function() {},
  dblClick:             ct_dblClick,
  keypress:             ct_keypress,
  popupShowing:         ct_popupShowing,
  getCurrentHref:       ct_getCurrentHref,
  getCurrentAbsoluteHref: ct_getCurrentAbsoluteHref,
  getCurrentItem:       ct_getCurrentItem,
  mouseOver:            function() {},
  cut:                  function() {},
  copy:                 function() {},
  paste:                function() {},
  canDrop:              function (aIndex, aOrientation) { return false; },
  drop:                 function (aIndex, aOrientation) { },
  _url:                 "",
}

chromeTree.__defineSetter__("currentURL", setChromeTreeURL);
chromeTree.__defineGetter__("currentURL", getChromeTreeURL);

function setChromeTreeURL(newURL)
{
  this._url = newURL;
}

function getChromeTreeURL()
{
  return this._url;
}


// Functions used by chromeTree
// Get the text to display in any given cell.
function ct_getCellText(row, column)
{
  if (row == -1)
    return " ";
  switch(column.id)
  {
    case "chromefilename":
      return this.data[row].leafName;
    case "chromefilesize":
      return this.data[row].size;
    case "chromefiletype":
      return this.data[row].extension;
    default:
      return " "; // shouldn't get here
  }
}

function ct_getCellProperties(row, col)
{
  if (row == -1)
    return;
  let rv = [];
  if (col.id == "chromefilename" && this.data[row].isDirectory) {
    rv.push("isFolder");
  }
  rv.push(this.data[row].filtered ? "filtered" : "unfiltered");
  return rv.join(' ');
}

function ct_getRowProperties(row)
{
  let rv = [];
  if (this.data[row].isDirectory) {
    rv.push("isFolder");
  }
  rv.push(this.data[row].filtered ? "filtered" : "unfiltered");
  return rv.join(' ');
}

// Get the extension on a (f)ile path.
function ct_getExtension(f)
{
  if (f.lastIndexOf(".") != -1)
    return f.substring(f.lastIndexOf(".") + 1, f.length).toLowerCase();
  return "";
}

// Get the icons for the files
function ct_getImageSrc(row, column)
{
  if (row == -1)
    return "";
  if (column.id == "chromefilename" && this.data[row].icon) {
    return this.data[row].icon;
  }
  return "";
}

function ct_cycleHeader(column)
{
  var sortDir = column.element.getAttribute("sortDirection");
  var sortDirection = (sortDir == "ascending" || sortDir == "natural") ? "descending" : "ascending";
  document.getElementById('chromefilename').setAttribute("sortDirection", "natural");
  document.getElementById('chromefilesize').setAttribute("sortDirection", "natural");
  document.getElementById('chromefiletype').setAttribute("sortDirection", "natural");
  column.element.setAttribute("sortDirection", sortDirection);
  this.sort();
}

function ct_sort() {
  var expr = this._expr = chromeBrowser.search.expr;
  for (var row = 0; row < this.data.length; ++row) {
    let rowObject = this.data[row];
    let origData = rowObject.orig;
    rowObject.leafName = origData.leafName;
    rowObject.href = origData.href;
    rowObject.filtered = origData && origData.filtered && origData.filtered.indexOf(expr) > -1;
    rowObject.isDirectory = origData.isDirectory;
    if (!("icon" in rowObject)) {
      rowObject.icon = this.getFileIcon(row);
    }
    if (typeof rowObject.size == "undefined") {
      rowObject.size = rowObject.orig.size;
      rowObject.size = this.getFormattedFileSize(row);
    }
    if (typeof rowObject.extension == "undefined") {
      rowObject.extension = this.getExtension(rowObject.leafName);
    }
  }

  if (document.getElementById('chromefilename').getAttribute("sortDirection") &&
      document.getElementById('chromefilename').getAttribute("sortDirection") != "natural")
  {
    this.data.sort(compareName);
    if (document.getElementById('chromefilename').getAttribute("sortDirection") == "ascending")
      this.data.reverse();
  }
  if (document.getElementById('chromefilesize').getAttribute("sortDirection") && 
      document.getElementById('chromefilesize').getAttribute("sortDirection") != "natural")
  {
    this.data.sort(compareSize);
    if (document.getElementById('chromefilesize').getAttribute("sortDirection") == "ascending")
      this.data.reverse();
  }
  if (document.getElementById('chromefiletype').getAttribute("sortDirection") &&
      document.getElementById('chromefiletype').getAttribute("sortDirection") != "natural")
  {
    this.data.sort(compareType);
    if (document.getElementById('chromefiletype').getAttribute("sortDirection") == "ascending")
      this.data.reverse();
  }


  this.treebox.rowCountChanged(0, -this.rowCount);
  this.rowCount = this.data.length;
  this.treebox.rowCountChanged(0, this.rowCount);
}

function ct_updateView(column, direction)
{
  var localTreeItems = new Array();
  var url = this.currentURL;
  var position = chromeBrowser.chromeStructure.findURL(url);
  if (position)
  {
    var dirs = position.directories;
    for (var key in dirs)
      localTreeItems.push({orig: dirs[key]});
    var files = position.files;
    for (var key in files)
      localTreeItems.push({orig: files[key]});
  }
  this.currentLevel = position.level;

  this.data = localTreeItems;
  this.sort();

  chromeDirTree.reselectCurrentDirectory();  // select directory in chromeDirTree
  if (this.data.length)
    this.selection.select(0); // Select the first item.
}

function ct_getFormattedFileSize(row)
{
  if (this.data[row].isDirectory)
    return "";
  if (this.data[row].size == 0)
    return "0" + (bytesMode ? "  " : " KB  ");
  if (bytesMode)
    return this.data[row].size + "  ";
  return (Number(this.data[row].size / 1024).toFixed(2)) + " KB  ";
}

function ct_getFileIcon(row)
{
  if (this.data[row].isDirectory)
    return "";
  // Thanks to Alex Sirota!
  var url = "moz-icon://" + this.data[row].leafName + "?size=16";
  return url;
}

function ct_popupShowing(event)
{
  // return early for submenus, don't need to do anything.
  if (event.target != document.getElementById("chromemenu"))
    return true;

  if (this.selection.count != 1)
    return false; // cancel, we can't do anything? :S

  var selectedItem = this.data[this.selection.currentIndex].orig;

  // Can't open or save a dir, nor copy contents:
  var isDir = selectedItem.isDirectory;
  document.getElementById("cx-open").setAttribute("disabled", isDir);
  document.getElementById("cx-saveas").setAttribute("disabled", isDir);

  document.getElementById("cx-replace").hidden = false;
  document.getElementById("cx-replace-sep").hidden = false;


  // Can't open in tabs, current tab, or window when not in Fx:
  if (chromeBrowser.host != "Firefox")
  {
    document.getElementById("cx-open-ext").hidden = false;
    document.getElementById("cx-open").hidden = true;
    if (chromeBrowser.host == "Toolkit")
      document.getElementById("cx-saveas").hidden = true;
  }

  // Only show the file or jar items, depending on the kind of mapping.
  var isFile = (selectedItem.scheme == "file");
  var isJAR = (selectedItem.scheme == "jar");
  var isData = (selectedItem.scheme == "data");
  var isAddon = (selectedItem.getAddOn() != getStr("not.an.addon")); 
  document.getElementById("cx-copyjarurl").hidden = !isJAR;
  document.getElementById("cx-copyjarpath").hidden = !isJAR;
  document.getElementById("cx-copyfilepath").hidden = !isFile;
  document.getElementById("cx-copyfileurl").hidden = !isFile;
  document.getElementById("cx-copydataurl").hidden = !isData;
  // Can't launch jar files (yet):
  document.getElementById("cx-launch").hidden = !isFile;
  document.getElementById("cx-launch-sep").hidden = !isFile; 
  // Show add-on folder only for add-ons:
  document.getElementById("cx-show-sep").hidden = !isAddon;
  document.getElementById("cx-show-manifest").hidden = !isAddon;

  //document.getElementById("cx-copycontent").setAttribute("disabled", isDir);
  //document.getElementById("cx-copycontentdata").setAttribute("disabled", isDir);
  return true;
}

function ct_getCurrentHref()
{
  if (this.selection.count != 1)
    return "";
  var selectedItem = this.data[this.selection.currentIndex].orig;
  return selectedItem.href;
}

function ct_getCurrentAbsoluteHref()
{
  if (this.selection.count != 1)
    return "";
  var selectedItem = this.data[this.selection.currentIndex].orig;
  return selectedItem.resolvedURI;
}

function ct_getCurrentItem()
{
  if (this.selection.count != 1)
    return null;
  return this.data[this.selection.currentIndex].orig;
}

function compareName(a, b) {
  if (!a.isDirectory && b.isDirectory)
    return 1;
  if (a.isDirectory && !b.isDirectory)
    return -1;
  if (a.leafName.toLowerCase() < b.leafName.toLowerCase())
    return -1;
  if (a.leafName.toLowerCase() > b.leafName.toLowerCase())
    return 1;
  return 0;
}

function compareSize(a, b) {
  if (!a.isDirectory && b.isDirectory)
    return 1;
  if (a.isDirectory && !b.isDirectory)
    return -1;
  if (a.isDirectory && b.isDirectory)
    return 0;
  return a.size - b.size;
}

function compareType(a, b) {
  if (!a.isDirectory && b.isDirectory)
    return 1;
  if (a.isDirectory && !b.isDirectory)
    return -1;
  if (chromeTree.getExtension(a.leafName.toLowerCase()) < chromeTree.getExtension(b.leafName.toLowerCase()))
    return -1;
  if (chromeTree.getExtension(a.leafName.toLowerCase()) > chromeTree.getExtension(b.leafName.toLowerCase()))
    return 1;
  return 0;
}

////////////////////////////////////////////////////

function ct_dblClick(event)
{
  // Nothing to do for weird buttons, no selection or no valid target.
  if (event.button != 0 || event.originalTarget.localName != "treechildren" || this.selection.count == 0)
    return;

  // Select a *useful* element if necessary.
  if (this.selection.currentIndex < 0 || this.selection.currentIndex >= this.rowCount)
    this.selection.currentIndex = this.rowCount - 1;

  var f = this.data[this.selection.currentIndex].orig;
  if (f.isDirectory) // Open directories
  {
    chromeDirTree.changeDir(f.href, true);
  }
  else // View file sources.
  {
    // View the source of rdf, dtd, xul or js files by default.
    if ((/xul|js|rdf|dtd/).test(this.getExtension(f.leafName))) {
      chromeBrowser.viewSourceOf(f.href);
    } else if (chromeBrowser.host == "Firefox") {
      chromeBrowser.view(f.href);
    } else {
      chromeBrowser.view(f.resolvedURI);
    }
  }
}

function ct_keypress(event) {
  if (event.keyCode == 13)
  {
    var e = {button: 0, originalTarget: {localName: "treechildren"}};
    // Hack-er-tee-hack:
    this.dblClick(e);
  }
}
