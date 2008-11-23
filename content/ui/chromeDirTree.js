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

var chromeDirTree = {
    data:                   new Array,
    getCellText:            cdt_getCellText,
    getLevel:               cdt_getLevel,
    getParentIndex:         cdt_getParentIndex,
    getImageSrc:            function(row,col)         {},
    getCellProperties:      function(row,col,props)   {},
    getColumnProperties:    function(colid,col,props) {},
    getRowProperties:       function(row,props)       {},
    hasNextSibling:         function(row,nextrow)     { return this.data[row].hasNext; },
    isContainer:            function(row)             { return true; },
    isContainerEmpty:       cdt_isContainerEmpty,
    isContainerOpen:        function(row)             { return this.data[row].open; },
    isSeparator:            function(row)             { return false; },
    isSorted:               function(row)             { return false; },
    setTree:                function(treebox)         { this.treebox = treebox; },
    toggleOpenState:        cdt_toggleOpenState,
    updateParentIndices:    cdt_updateParentIndices,
    cdup:                   cdt_cdup,
    reselectCurrentDirectory: cdt_reselectCurrentDirectory,
    changeDir:              cdt_changeDir,
    indexOfURL:             cdt_indexOfURL,
    canDrop:                function (aIndex, aOrientation) { return false; },
    keypress:               cdt_keypress,
    click:                  cdt_click
}


function cdt_getCellText(row,column)
{
    return row == -1 ? "" : this.data[row].leafName;
}

function cdt_getLevel(row)
{
    if ((row < 0) || (row >= this.data.length))
        return 0; // Don't feed bogus, please.

    return this.data[row].level - 1; // Woo! Decrement because <tree> assumes lowest level is 0.
}

function cdt_isContainerEmpty(row)
{ 
    if ((row < 0) || (row >= this.data.length)) // rows we don't know are empty.
        return true; 
    return this.data[row].empty;
}

function cdt_getParentIndex(row)
{
    if (row <= 0)
        return -1;
    return this.data[row].parentIndex;
}

function cdt_toggleOpenState(row)
{
    // Don't feed us nonsense.
    if (row < 0 || row > this.data.length)
        return;

    if (this.isContainerOpen(row))
    {
        // The container is open, find all children and remove them.
        var currentLevel = this.getLevel(row);
        // last child to remove:
        var lastChild = row;
        // Find the last child's index (within the limits of the data and with a higher level):
        while ((lastChild + 1 < this.rowCount) && (this.getLevel(lastChild + 1) > currentLevel))
            ++lastChild;
        // Remove the subdirectories and clean up:
        this.data[row].children = this.data.splice(row + 1, lastChild - row);
        this.updateParentIndices();
        this.rowCount = this.data.length;
        this.treebox.rowCountChanged(row, -(lastChild - row));

        // Alright, it's no longer open:
        this.data[row].open = false;
        // Update the row:
        this.treebox.invalidateRow(row);

        // Technically, we can be asked to collapse a node above the node we're
        // viewing. We need to cope with that:
        if (chromeTree.currentURL.indexOf(this.data[row].href) == 0
            && chromeTree.currentURL != this.data[row].href
            && chromeTree.currentLevel > this.getLevel(row))
        {
            chromeTree.currentURL = this.data[row].href;
            chromeTree.updateView();
            this.selection.select(row);
            this.treebox.ensureRowIsVisible(row);
        }
        else if (chromeTree.currentURL == this.data[row].href)
        {
            this.selection.select(row);
            this.treebox.ensureRowIsVisible(row);
        }
    }
    else // Okay, this node was closed, we open it, we need to add the children.
    {
        // Do we have stored data on the children from before? Pretty please? :-D
        if (this.data[row].children)
        {
            for (var x = this.data[row].children.length - 1; x >= 0; --x)
                this.data.splice(row + 1, 0, this.data[row].children[x]);

            // Clean up
            this.updateParentIndices();
            this.rowCount = this.data.length;
            this.treebox.rowCountChanged(row + 1, this.data[row].children.length);
            this.data[row].children = null;
            this.data[row].open = true;
            this.treebox.invalidateRow(row);
        }
        else // Awwwww. :-(. Well, let's do it the hard way then.
        {
            var dirNode = chromeStructure.findURL(this.data[row].href);
            var subDirs = [];
            for (var k in dirNode.directories)
            {
                subDirs.push( {leafName: k, parent: dirNode.href, href: dirNode.directories[k].href,
                               level: dirNode.directories[k].level,
                               open: false, empty: false, children: null, hasNext: true, parentIndex: -1 });
            }
            if (subDirs.length == 0)
            {
                this.data[row].empty = true;
                this.data[row].open = false;
                this.treebox.invalidateRow(row);
                return;
            }
            subDirs.sort(dirSort);
            subDirs[subDirs.length - 1].hasNext = false; // Last element doesn't have a next item.

            for (var x = subDirs.length - 1; x >= 0; --x)
                this.data.splice(row + 1, 0, subDirs[x]);
            this.rowCount = this.data.length;
            this.treebox.rowCountChanged(row + 1, subDirs.length);
            this.data[row].open = true;
            this.treebox.invalidateRow(row);
        }
    }
}

function cdt_updateParentIndices()
{
    for (var x = 0; x < this.data.length; ++x)
    {
        var pIndex = this.data[x].parent ? this.indexOfURL(this.data[x].parent) : -1;
        this.data[x].parentIndex = pIndex;
    }
}

function cdt_cdup()
{
    var parentIndex = this.getParentIndex(this.selection.currentIndex);
    if (parentIndex != -1)
    {
        this.changeDir(this.data[parentIndex].href, false);
        this.selection.select(parentIndex);
    }
}

function cdt_reselectCurrentDirectory()
{
    var index = this.indexOfURL(chromeTree.currentURL);
    this.selection.select(index);
    this.treebox.ensureRowIsVisible(index);
}

function cdt_changeDir(href, forceOpen)
{
    // Hrmmm....
    if (!(/\/$/).test(href)) // No slash at the end? tsk.
        href = href + "/";

    var oldDir = chromeTree.currentURL;
    chromeTree.currentURL = href;
    if (this.data.length == 0) // We need to create the full data array first.
    {
        var elemsAdded = 0;
        for (var dir in chromeStructure.directories)
        {
            var dirObj = chromeStructure.directories[dir];
            this.data.push( {leafName: dir, parent: "", href: dirObj.href, open: false, level: dirObj.level,
                             empty: false, children: null, hasNext:false, parentIndex: -1} );
            elemsAdded++;
        }
        this.data.sort(dirSort);
        this.rowCount = elemsAdded;
        this.treebox.rowCountChanged(0, elemsAdded);
        this.selection.select(0);
    }

    // Now we're sure we have a tree. Do something useful with it.
    var currentLevel = chromeTree.currentLevel;
    // open parent directories til we find the directory
    for (var x = 0; x < this.data.length; ++x)
    {
        for (var y = this.data.length - 1; y >= x; --y)
        {
            // Does the current row have a matching href?
            if (chromeTree.currentURL.indexOf(this.data[y].href) == 0
                // Is the level smaller (parent dir), or do we have an exactly matching URL?
                && (this.getLevel(y) < currentLevel || chromeTree.currentURL == this.data[y].href))
            {
                x = y;
                break;
            }
        }

        if (chromeTree.currentURL.indexOf(this.data[x].href) == 0)
        {
            // If the directory is not open, open it.
            if (!this.data[x].open && forceOpen)
                this.toggleOpenState(x);

            if (chromeTree.currentURL == this.data[x].href) // Woo, we're done!
            {
                chromeTree.updateView();
                return;
            }
        }
    }
    // If we get here, we never found the damn thing, and that's bad.
    // We should go back to where we were previously.
    // XXX: maybe fix this to refresh the entire dir structure (bad, lots of work!)
    chromeTree.currentURL = oldDir;
}

function cdt_indexOfURL(href)
{   // binary search to find an url in the chromeDirTree
    var left = 0;
    var right = this.data.length - 1;
    href = href.replace(/\x2f/g, "\x01").toLowerCase();    // make '/' less than everything (except null)

    while (left <= right) {
        var mid = Math.floor((left + right) / 2);
        var dataHref = this.data[mid].href.replace(/\x2f/g, "\x01").toLowerCase();
        if (dataHref == href || dataHref + "\x01" == href || dataHref == href + "\x01")
            return mid;
        else if (href < dataHref)
            right = mid - 1;
        else if (href > dataHref)
            left = mid + 1;
    }
    return -1;
}

function dirSort(a, b)
{
    // make '/' less than everything (except null)
    var tempA = a.href.replace(/\x2f/g, "\x01").toLowerCase();
    var tempB = b.href.replace(/\x2f/g, "\x01").toLowerCase();

    if (tempA < tempB)
        return -1;
    if (tempA > tempB)
        return 1;
    return 0;
}


//////////////////////////////
// Handlers
//////////////////////////////

function cdt_click(event)
{
    if (event.button == 0 || event.button == 2)
    {
        var row = {};    var col = {};    var child = {};
        this.treebox.getCellAt(event.pageX, event.pageY, row, col, child);
        var index = this.selection.currentIndex;

        // index == row.value in case were collapsing the folder
        if ((index == row.value) && (this.data[index].href != chromeTree.currentURL))
            this.changeDir(this.data[index].href, true);
    }
}

function cdt_keypress(event)
{
    if (event.keyCode == 13)
    {
        var row = {};   var col = {};   var child = {};
        var index = this.selection.currentIndex;
        if (this.data[index].href != chromeTree.currentURL)
        {
            this.changeDir(this.data[index].href, false);
            event.stopPropagation();
            event.preventDefault();
        }
    }
}
