!macro customInit
  ; Close a running Asset360 before install/upgrade so files can be replaced.
  nsExec::ExecToLog 'taskkill /F /IM Asset360.exe /T'
  Sleep 800
!macroend

!macro customInstallMode
!macroend
