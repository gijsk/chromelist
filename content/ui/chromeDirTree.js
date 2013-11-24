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

var chromeDirTree = {
  data:                   new Array(),
  generateData:           cdt_generateData,
  getCellText:            cdt_getCellText,
  getLevel:               cdt_getLevel,
  getParentIndex:         cdt_getParentIndex,
  getImageSrc:            function(row,col)         {},
  getCellProperties:      function(row,col)         {},
  getColumnProperties:    function(colid,col)       {},
  getRowProperties:       function(row)             {},
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
  click:                  cdt_click,
  // Steal from chromeTree:
  matchesSearch:          ct_matchesSearch
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
    for (var x = this.data[row].children.length - 1; x >= 0; --x)
      this.data.splice(row + 1, 0, this.data[row].children[x]);

    // Clean up
    this.updateParentIndices();
    this.rowCount = this.data.length;
    this.treebox.rowCountChanged(row + 1, this.data[row].children.length);
    this.data[row].open = true;
    this.treebox.invalidateRow(row);
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
    this.data = this.generateData(chromeBrowser.chromeStructure);
    this.data.sort(dirSort);
    this.rowCount = this.data.length;
    this.treebox.rowCountChanged(0, this.data.length);
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

function cdt_generateData(obj)
{
  var data = [];
  if (!obj || !obj.directories)
    return data;
  var directories = obj.directories;
  var parentHRef = obj.href;
  if (parentHRef == "chrome://")
    parentHRef = "";
  for (var dir in directories)
  {
    var dirObj = directories[dir];
    var childData = this.generateData(dirObj);
    if (childData.length > 0)
      childData[childData.length - 1].hasNext = false;
    var dataObj = {leafName: dirObj.leafName, parent: parentHRef,
      href: dirObj.href, open: false, level: dirObj.level,
      empty: (childData.length == 0), children: childData,
      hasNext: (parentHRef), parentIndex: -1};
    data.push(dataObj);
  }
  return data.sort(dirSort);
}

function cdt_filter(expr)
{
  for (var i = 0; i < this.data.length; i++)
  {
    var obj = this.data[i];

  }
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
