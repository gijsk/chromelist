del chromelist.xpi
rem this is fugly, but who cares.
ls | sed s/build\.bat// | sed s/preview.png// | sed s/preview-small.png// | xargs 7z a -tzip "chromelist.xpi" -r -mx=9 -x!*CVS*
