; Pasos extra del instalador de Cursor Remoto (los incluye electron-builder).

!macro customInstall
  ; Permite que los celulares de la red se conecten sin que Windows muestre el
  ; aviso del Firewall. Solo en redes privadas (casa), no en las públicas.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Cursor Remoto"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Cursor Remoto" dir=in action=allow program="$INSTDIR\CursorRemoto.exe" enable=yes profile=private'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Cursor Remoto"'
  ; Quita el "Iniciar con Windows" si estaba activado.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CursorRemoto"
!macroend
