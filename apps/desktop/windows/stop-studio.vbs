Option Explicit

Dim shell, files, localRoot, stopFile, request, deadline
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
localRoot = files.BuildPath(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%"), "Authenik8\Studio")
stopFile = files.BuildPath(localRoot, "stop.request")

If Not files.FileExists(stopFile & ".pid") Then WScript.Quit 0
Set request = files.CreateTextFile(stopFile, True)
request.WriteLine "Stop Authenik8 Studio"
request.Close

deadline = Timer + 15
Do While files.FileExists(stopFile) Or files.FileExists(stopFile & ".pid")
  WScript.Sleep 300
  If Timer > deadline Then Exit Do
Loop
