#define AppName "Authenik8 Studio"
#define AppVersion GetEnv("APP_VERSION")
#define AppStage GetEnv("APP_STAGE")

[Setup]
AppId={{A3EAD2AF-4B76-4B6E-9E73-1F76962C38B1}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Authenik8
DefaultDirName={localappdata}\Programs\Authenik8 Studio
DefaultGroupName=Authenik8 Studio
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
OutputDir={#AppStage}
OutputBaseFilename=Authenik8-Studio-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}

[Files]
Source: "{#AppStage}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Authenik8 Studio"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\launcher.vbs"""; WorkingDir: "{app}"
Name: "{group}\Stop Authenik8 Studio"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\stop-studio.vbs"""; WorkingDir: "{app}"
Name: "{group}\Uninstall Authenik8 Studio"; Filename: "{uninstallexe}"

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\launcher.vbs"""; WorkingDir: "{app}"; Description: "Launch Authenik8 Studio"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\stop-studio.vbs"""; WorkingDir: "{app}"; Flags: runhidden waituntilterminated
