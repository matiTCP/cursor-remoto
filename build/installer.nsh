; Pasos extra del instalador de Mouse Final (los incluye electron-builder).

!macro customInstall
  ; Permite que los celulares de la red se conecten sin que Windows muestre el
  ; aviso del Firewall. Solo en redes privadas (casa), no en las públicas.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Mouse Final"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Mouse Final" dir=in action=allow program="$INSTDIR\MouseFinal.exe" enable=yes profile=private'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Mouse Final"'
  ; Quita el "Iniciar con Windows" si estaba activado.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MouseFinal"
!macroend
