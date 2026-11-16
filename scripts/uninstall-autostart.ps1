# uninstall-autostart.ps1
# Quita el acceso directo de auto-inicio de Cursor Remoto de la carpeta de Inicio.

$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'MouseFinalRemote.lnk'

if (Test-Path $shortcutPath) {
    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($shortcutPath, 'OnlyErrorDialogs', 'SendToRecycleBin')
    Write-Output "Acceso directo eliminado (mandado a la Papelera). El servidor ya no arrancara solo."
} else {
    Write-Output "No se encontro el acceso directo (puede que ya este desinstalado)."
}
