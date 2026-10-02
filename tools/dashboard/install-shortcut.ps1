<#
.SYNOPSIS
  바탕화면에 "eOrth 작업 궤도" 바로가기를 만든다(콘솔 창 없이 pythonw로 dashboard.py 실행).
.EXAMPLE
  .\tools\dashboard\install-shortcut.ps1
#>
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = (Resolve-Path (Join-Path $here '..\..')).Path

$py = (Get-Command python).Source
$pyw = Join-Path (Split-Path $py) 'pythonw.exe'
if (-not (Test-Path $pyw)) { $pyw = $py }

# 앱 아이콘 → .ico
$ico = Join-Path $here 'app.ico'
if (-not (Test-Path $ico)) {
  & $py -c "from PIL import Image; im=Image.open(r'$root\assets\icon.png').convert('RGBA'); im.save(r'$ico', sizes=[(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)])"
}

$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'eOrth 작업 궤도.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = $pyw
$s.Arguments = '"' + (Join-Path $here 'dashboard.py') + '"'
$s.WorkingDirectory = $here
$s.IconLocation = $ico
$s.Description = 'eOrth에서 한 일·진행 중·할 일을 한 화면에'
$s.Save()
Write-Host "바로가기 생성: $lnk"
