; Instalador de Lumen (Inno Setup 6). Lo compila tools/build.py:
;   ISCC.exe /DAppVersion=1.2.0 tools\installer.iss
; Instala para el usuario actual, sin pedir permisos de administrador.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6B0F3C2E-8D4A-4E57-9B1F-4C1A7E2D5F90}
AppName=Lumen
AppVersion={#AppVersion}
AppVerName=Lumen {#AppVersion}
AppPublisher=GuisoDev
AppPublisherURL=https://github.com/guisodev/lumen
AppSupportURL=https://github.com/guisodev/lumen/issues
AppUpdatesURL=https://github.com/guisodev/lumen/releases
DefaultDirName={localappdata}\Programs\Lumen
DefaultGroupName=Lumen
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=Lumen-Setup
SetupIconFile=..\web\icon.ico
UninstallDisplayIcon={app}\Lumen.exe
UninstallDisplayName=Lumen
LicenseFile=..\LICENSE
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
#ifdef SIGN
; build.py pasa /Slumen=... con tools/sign.ps1 cuando hay certificado
SignTool=lumen
SignedUninstaller=yes
#endif

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Una actualización borra primero la versión anterior del programa (no los ajustes,
; que están en %APPDATA%\Lumen), para que no queden librerías viejas mezcladas.
Source: "..\dist\Lumen\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
Type: filesandordirs; Name: "{app}\_internal"

[Icons]
Name: "{autoprograms}\Lumen"; Filename: "{app}\Lumen.exe"; AppUserModelID: "lumen.downloader"
Name: "{autodesktop}\Lumen"; Filename: "{app}\Lumen.exe"; Tasks: desktopicon

[Registry]
; Enlaces lumen:// (el marcador «Descargar con Lumen» del navegador).
; Lumen.exe también lo registra al abrirse; aquí queda hecho desde el principio
; y se borra al desinstalar.
Root: HKCU; Subkey: "Software\Classes\lumen"; ValueType: string; ValueName: ""; ValueData: "URL:Lumen"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\lumen"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\lumen\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\Lumen.exe"",0"
Root: HKCU; Subkey: "Software\Classes\lumen\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Lumen.exe"" ""%1"""

[Run]
Filename: "{app}\Lumen.exe"; Description: "{cm:LaunchProgram,Lumen}"; Flags: nowait postinstall skipifsilent
; Lumen se actualiza a sí mismo con /SILENT /LAUNCH: al terminar se vuelve a abrir
Filename: "{app}\Lumen.exe"; Flags: nowait; Check: LaunchRequested

[Code]
function LaunchRequested: Boolean;
begin
  Result := Pos('/LAUNCH', UpperCase(GetCmdTail)) > 0;
end;
