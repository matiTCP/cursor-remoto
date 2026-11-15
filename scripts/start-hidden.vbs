' start-hidden.vbs
' Lanza el servidor Mouse_Final sin mostrar ninguna ventana de consola.
Set objShell = CreateObject("WScript.Shell")
projectDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\scripts\") - 1)
objShell.Run "cmd /c cd /d """ & projectDir & """ && node server.js", 0, False
