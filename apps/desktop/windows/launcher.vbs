Option Explicit

Dim shell, files, installDir, nodeExe, entryPoint, documents, sandboxDir, localRoot, stopFile, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")

installDir = files.GetParentFolderName(WScript.ScriptFullName)
nodeExe = files.BuildPath(installDir, "runtime\node.exe")
entryPoint = files.BuildPath(installDir, "app\packages\create-authenik8-studio\bin.mjs")
documents = shell.SpecialFolders("MyDocuments")
sandboxDir = files.BuildPath(documents, "Authenik8 Studio\workspace")
localRoot = files.BuildPath(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%"), "Authenik8\Studio")

If Not files.FolderExists(sandboxDir) Then
  If Not files.FolderExists(files.BuildPath(documents, "Authenik8 Studio")) Then
    files.CreateFolder files.BuildPath(documents, "Authenik8 Studio")
  End If
  files.CreateFolder sandboxDir
End If
If Not files.FolderExists(localRoot) Then
  If Not files.FolderExists(files.BuildPath(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%"), "Authenik8")) Then
    files.CreateFolder files.BuildPath(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%"), "Authenik8")
  End If
  files.CreateFolder localRoot
End If
stopFile = files.BuildPath(localRoot, "stop.request")

Dim environment
Set environment = shell.Environment("PROCESS")
environment("SANDBOX_DIR") = sandboxDir
environment("PORT") = "4870"
environment("AUTHENIK8_STOP_FILE") = stopFile

shell.CurrentDirectory = installDir
command = Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & entryPoint & Chr(34)
shell.Run command, 0, False
