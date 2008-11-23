var file = null;
function onLoad()
{
    file = window.arguments[0];
    document.title = document.title + file.leafName;
    document.getElementById("chrome-url-text").value = file.href;
    document.getElementById("resolved-url-text").value = file.resolvedURI;
    document.getElementById("resolved-file-text").value = file.path; 
    document.getElementById("resolved-jarfile-text").value = file.path;
    if (file.scheme == "jar")
        document.getElementById("resolved-file").hidden = true;
    else if (file.scheme == "file")
        document.getElementById("resolved-jarfile").hidden = true;

    if (file.TYPE == "ChromeDirectory")
        document.getElementById("file-size").hidden = true;
    else
        document.getElementById("file-size-text").value = file.size/1000 + " KB";
    document.getElementById("manifest-text").value = file.getManifest();
}
