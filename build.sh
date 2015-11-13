#!/bin/sh

rm chromelist.xpi

zip -r9 chromelist.xpi content/ skin/ locale/ defaults/ license.txt chrome.manifest install.rdf -x *.swp

