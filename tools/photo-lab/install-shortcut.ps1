<#
.SYNOPSIS
  바탕화면에 "eOrth 사진 AI 랩" 바로가기를 만든다(콘솔 창 없이 pythonw로 app.py 실행).
.EXAMPLE
  .\tools\photo-lab\install-shortcut.ps1
#>
$ErrorActionPreference = 'Stop'
$lab = $PSScriptRoot
$root = (Resolve-Path (Join-Path $lab '..\..')).Path

# python.exe 옆의 pythonw.exe (콘솔 없음). 없으면 python.exe.
$py = (Get-Command python).Source
$pyw = Join-Path (Split-Path $py) 'pythonw.exe'
if (-not (Test-Path $pyw)) { $pyw = $py }

# 앱 아이콘 → .ico
$ico = Join-Path $lab 'app.ico'
if (-not (Test-Path $ico)) {
  & $py -c "from PIL import Image; im=Image.open(r'$root\assets\icon.png').convert('RGBA'); im.save(r'$ico', sizes=[(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)])"
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'eOrth 사진 AI 랩.lnk'
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = $pyw
$s.Arguments = '"' + (Join-Path $lab 'app.py') + '"'
$s.WorkingDirectory = $lab
$s.IconLocation = $ico
$s.Description = '사진 폴더를 분석하고 정답을 가르쳐 eOrth 사진 AI를 키운다'
$s.Save()
Write-Host "바로가기 생성: $lnk"
Write-Host "실행: $pyw $($s.Arguments)"
