/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/ 
 * 
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License. 
 *
 * The Original Code is FireFTP
 * 
 * The Initial Developer of the Original Code is
 * Mime Cuvalo
 * Portions created by Mime Cuvalo are Copyright (C) 2004 Mime Cuvalo.
 *
 * Alternatively, the contents of this file may be used under the
 * terms of the GNU Public License (the "GPL"), in which case the
 * provisions of the GPL are applicable instead of those above.
 * If you wish to allow use of your version of this file only
 * under the terms of the GPL and not to allow others to use your
 * version of this file under the MPL, indicate your decision by
 * deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL.  If you do not delete
 * the provisions above, a recipient may use your version of this
 * file under either the MPL or the GPL.
 *
 * Contributor(s):
 *  Gijs Kruitbosch, <gijskruitbosch@gmail`com>
 */
/*
 * Large portions of this code are taken literally or partially from code for
 * the FireFTP extension by Mime Cuvalo. Many thanks to him for writing the
 * original code.
 */

var bytesMode = false;

var chromeTree = {
    data:                 new Array(),
    displayData:          new Array(),
    rowCount:             0,
    getCellText:          ct_getCellText,
    getCellProperties:    ct_getCellProperties,
    getExtension:         ct_getExtension,
    getImageSrc:          ct_getImageSrc,
    getFileIcon:          ct_getFileIcon,
    cycleHeader:          ct_cycleHeader,
    updateView:           ct_updateView,
    getParentIndex:       function(row)               { return -1; },
    getColumnProperties:  function(colid, col, props) {},
    getLevel:             function(row)               { return 0; },
    getRowProperties:     function(row, props)        {},
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
    _url:                 ""
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
            return this.displayData[row].leafName;
        case "chromefilesize":
            return this.displayData[row].size;
        case "chromefiletype":
            return this.displayData[row].extension;
        default:
            return " "; // shouldn't get here
    }
}

function ct_getCellProperties(row, col, props)
{
    if (row == -1)
        return;
    if (col.id == "chromefilename" && this.data[row].isDirectory)
    {
        var atomsvc = getService("@mozilla.org/atom-service;1", "nsIAtomService");
        props.AppendElement(atomsvc.getAtom("isFolder"));
    }
}

// Get the extension on a (f)ile path.
function ct_getExtension(f)
{
    if (f.lastIndexOf(".") != -1)
        return f.substring(f.lastIndexOf(".") + 1, f.length).toLowerCase();
    else
        return "";
}

// Get the icons for the files
function ct_getImageSrc(row, column)
{
    if (row == -1)
        return "";
    if (column.id == "chromefilename" && this.displayData[row].icon)
        return this.displayData[row].icon;
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

function ct_sort()
{
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

    delete this.displayData;
    this.displayData = new Array;
    for (var row = 0; row < this.data.length; ++row)
    {
        var fName = this.data[row].leafName;
        var fSize = this.getFormattedFileSize(row);
        var fExt = this.getExtension(this.data[row].leafName);
        var fIcon = this.getFileIcon(row);
        var formattedData = { leafName : fName, size: fSize, extension: fExt, icon: fIcon };
        this.displayData.push(formattedData);
    }

    this.treebox.rowCountChanged(0, -this.rowCount);
    this.rowCount = this.data.length;
    this.treebox.rowCountChanged(0, this.rowCount);
}

function ct_updateView(column, direction)
{
    var localTreeItems = new Array;
    var url = this.currentURL;
    var position = chromeStructure.findURL(url);
    if (position)
    {
        var dirs = position.directories;
        for (var key in dirs)
            localTreeItems.push(dirs[key]);
        var files = position.files;
        for (var key in files)
            localTreeItems.push(files[key]);
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
    else
        return (Math.floor(this.data[row].size / 1024) + 1) + " KB  ";
}

function ct_getFileIcon(row)
{
    if (this.data[row].isDirectory)
        return "";
    // Thanks to Alex Sirota!
    var url = "moz-icon://" + this.data[row].leafName + "?size=16";
    dump(url);
    return url;
}

function ct_popupShowing(event)
{
    // return early for submenus, don't need to do anything.
    if (event.target != document.getElementById("chromemenu"))
        return true;

    if (this.selection.count != 1)
        return false; // cancel, we can't do anything? :S

    var selectedItem = this.data[this.selection.currentIndex];

    // Can't open or save a dir, nor copy contents:
    var isDir = selectedItem.isDirectory;
    document.getElementById("cx-open").setAttribute("disabled", isDir);
    document.getElementById("cx-saveas").setAttribute("disabled", isDir);

    // Can't open in tabs, current tab, or window when not in Fx:
    if (chromeBrowser.host != "Firefox")
    {
        document.getElementById("cx-open-ext").hidden = false;
        document.getElementById("cx-open").hidden = true;
        if (chromeBrowser.host == "Toolkit")
            document.getElementById("cx-saveas").hidden = true;
    }

    // Only show the file or jar items, depending on the kind of mapping.
    if (selectedItem.scheme == "file")
    {
        document.getElementById("cx-copyjarurl").hidden = true;
        document.getElementById("cx-copyjarpath").hidden = true;
        document.getElementById("cx-copyfilepath").hidden = false;
        document.getElementById("cx-copyfileurl").hidden = false;
    }
    else if (selectedItem.scheme == "jar")
    {
        document.getElementById("cx-copyjarurl").hidden = false;
        document.getElementById("cx-copyjarpath").hidden = false;
        document.getElementById("cx-copyfilepath").hidden = true;
        document.getElementById("cx-copyfileurl").hidden = true;
    }
    //document.getElementById("cx-copycontent").setAttribute("disabled", isDir);
    //document.getElementById("cx-copycontentdata").setAttribute("disabled", isDir);
    return true;
}

function ct_getCurrentHref()
{
    if (this.selection.count != 1)
        return "";
    var selectedItem = this.data[this.selection.currentIndex];
    return selectedItem.href;
}

function ct_getCurrentAbsoluteHref()
{
    if (this.selection.count != 1)
        return "";
    var selectedItem = this.data[this.selection.currentIndex];
    return selectedItem.resolvedURI;
}

function ct_getCurrentItem()
{
    if (this.selection.count != 1)
        return null;
    return this.data[this.selection.currentIndex];
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

    var i = this.selection.currentIndex;
    if (this.data[i].isDirectory) // Open directories
    {
        chromeDirTree.changeDir(this.data[i].href);
    }
    else // View file sources.
    {
        // View the source of rdf, dtd, xul or js files by default.
        if ((/xul|js|rdf|dtd/).test(this.getExtension(this.data[i].leafName)))
        {
            chromeBrowser.viewSourceOf(this.data[i].href);
        }
        else if (chromeBrowser.host == "Firefox")
        {
            chromeBrowser.view(this.data[i].href);
        }
        else
        {
            chromeBrowser.view(this.data[i].resolvedURI);
        }
    }
}

function ct_keypress(event)
{
    if (event.keyCode == 13)
    {
        var e = {button: 0, originalTarget: {localName: "treechildren"}};
        // Hack-er-tee-hack:
        this.dblClick(e);
    }
}
