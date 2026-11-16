# install-autostart.ps1
# Crea un acceso directo en la carpeta de Inicio de Windows que arranca el
# servidor Cursor Remoto al iniciar sesion, sin mostrar ninguna ventana de consola.

$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$vbsPath = Join-Path $projectDir 'scripts\start-hidden.vbs'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'MouseFinalRemote.lnk'

$wscriptPath = Join-Path $env:SystemRoot 'System32\wscript.exe'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $wscriptPath
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $projectDir
$shortcut.Description = 'Arranca el servidor de control remoto Cursor Remoto'
$shortcut.Save()

Write-Output "Listo. Se creo '$shortcutPath'."
Write-Output "El servidor va a arrancar solo (sin ventana visible) la proxima vez que inicies sesion en Windows."
Write-Output "Para probarlo ahora mismo: wscript.exe `"$vbsPath`""
