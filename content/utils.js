/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is JSIRC Library.
 *
 * The Initial Developer of the Original Code is
 * New Dimensions Consulting, Inc.
 * Portions created by the Initial Developer are Copyright (C) 1999
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Robert Ginda, rginda@ndcico.com, original author
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

// A large portion of the original code has been snipped.
// A large portion of this code wasn't in the original code. The license header
// is here for legal reasons, I think. If you want to look at the original,
// refer to http://lxr.mozilla.org/seamonkey/source/extensions/irc/js/lib/utils.js
// and its cvs history there.


function getWindowByType(windowType)
{
    const MEDIATOR_CONTRACTID = "@mozilla.org/appshell/window-mediator;1";
    const nsIWindowMediator  = Components.interfaces.nsIWindowMediator;

    var windowManager =
        Components.classes[MEDIATOR_CONTRACTID].getService(nsIWindowMediator);

    return windowManager.getMostRecentWindow(windowType);
}

function stringTrim(s)
{
    if (!s)
        return "";
    s = s.replace(/^\s+/, "");
    return s.replace(/\s+$/, "");
}

function getService(contractID, iface)
{
    var rv;
    var cls = Components.classes[contractID];

    if (!cls)
        return null;

    switch (typeof iface)
    {
        case "undefined":
            rv = cls.getService();
            break;

        case "string":
            rv = cls.getService(Components.interfaces[iface]);
            break;

        case "object":
            rv = cls.getService(iface);
            break;

        default:
            rv = null;
            break;
    }

    return rv;
}

function newObject(contractID, iface)
{
    var rv;
    var cls = Components.classes[contractID];

    if (!cls)
        return null;

    switch (typeof iface)
    {
        case "undefined":
            rv = cls.createInstance();
            break;

        case "string":
            rv = cls.createInstance(Components.interfaces[iface]);
            break;

        case "object":
            rv = cls.createInstance(iface);
            break;

        default:
            rv = null;
            break;
    }

    return rv;
}

function dumpObjectTree (o, recurse, compress, level)
{
    var s = "";
    var pfx = "";

    if (typeof recurse == "undefined")
        recurse = 0;
    if (typeof level == "undefined")
        level = 0;
    if (typeof compress == "undefined")
        compress = true;
    
    for (var i = 0; i < level; i++)
        pfx += (compress) ? "| " : "|  ";

    var tee = (compress) ? "+ " : "+- ";

    for (i in o)
    {
        var t, ex;
        
        try
        {
            t = typeof o[i];
        }
        catch (ex)
        {
            t = "ERROR";
        }
        
        switch (t)
        {
            case "function":
                var sfunc = String(o[i]).split("\n");
                if (sfunc[2] == "    [native code]")
                    sfunc = "[native code]";
                else
                    if (sfunc.length == 1)
                        sfunc = String(sfunc);
                    else
                        sfunc = sfunc.length + " lines";
                s += pfx + tee + i + " (function) " + sfunc + "\n";
                break;

            case "object":
                s += pfx + tee + i + " (object)\n";
                if (!compress)
                    s += pfx + "|\n";
                if ((i != "parent") && (recurse))
                    s += dumpObjectTree (o[i], recurse - 1,
                                         compress, level + 1);
                break;

            case "string":
                if (o[i].length > 200)
                    s += pfx + tee + i + " (" + t + ") " + 
                        o[i].length + " chars\n";
                else
                    s += pfx + tee + i + " (" + t + ") '" + o[i] + "'\n";
                break;

            case "ERROR":
                s += pfx + tee + i + " (" + t + ") ?\n";
                break;

            default:
                s += pfx + tee + i + " (" + t + ") " + o[i] + "\n";

        }
        if (!compress)
            s += pfx + "|\n";
    }
    s += pfx + "*\n";
    return s;
}

function getFileFromURLSpec(url)
{
    const nsIFileProtocolHandler = Components.interfaces.nsIFileProtocolHandler;
    var handler = iosvc.getProtocolHandler("file");
    handler = handler.QueryInterface(nsIFileProtocolHandler);
    return handler.getFileFromURLSpec(url);
}


// This would be my own cruft:

function glimpseEscape(str)
{
    return str.replace(/([\$\^\*\[\|\(\)\!\\;,#><\-.])/g, "\\$1");
}

function getStr(id)
{
    return document.getElementById("locale-strings").getString(id);
}

function setStatusText(str)
{
    document.getElementById("status-text").setAttribute("label", str);
}

function setStatusProgress(n)
{
    var progressMeter = document.getElementById("status-progress-bar");
    if (n == -1)
    {
        progressMeter.parentNode.parentNode.setAttribute("hidden", "true");
    }
    else
    {
        progressMeter.setAttribute("value", String(n));
        progressMeter.parentNode.parentNode.setAttribute("hidden", "false");
    }
}

