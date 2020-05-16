function onClickNew(){
    //document.getElementById("new").click();
    document.getElementById("MyText").value = ""
    document.getElementById("name").value = ""
    //var fetchp = document.getElementById("div1");
    //var pp = document.createElement("p")
    //console.log(document.getElementById("MyText").value)
    //var node = document.createTextNode(document.getElementById("MyText").value);
    //pp.appendChild(node);
    //fetchp.appendChild(pp);
}

function onClickSave(){
    var para = document.getElementById("MyText").value
    console.log(para)
    var ext = document.getElementById("ext").value
    var filename
    if(ext == "python"){
        filename = document.getElementById("name").value + ".py"
        console.log(filename)
    }
    else if(ext == "text"){
        filename = document.getElementById("name").value + ".txt"
        console.log(filename)
    }
    else if(ext == "java"){
        filename = document.getElementById("name").value + ".java"
        console.log(filename)
    }
    else if(ext == "cpp"){
        filename = document.getElementById("name").value + ".cpp"
        console.log(filename)
    }
    else{
        filename = document.getElementById("name").value + ".html"
    }
    var blob = new Blob([para], {type: "text/plain;charset=utf-8"});
      saveAs(blob, filename);
      delete blob;
}