function startChromeList()
{
  window.openDialog("chrome://chromelist/content/chromelist.xul",
      "chrome-browser", "resizable,dialog=no,status",
      {url: "chrome://"});
}
