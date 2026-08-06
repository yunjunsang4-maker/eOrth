# 퍼즐 모드 기본 아트 생성 — assets/intro2-band.png 중앙 정사각 크롭 → 800px JPEG q70 → base64
# 실행: powershell -ExecutionPolicy Bypass -File scripts/build-puzzle-art.ps1
# 출력: scripts/puzzle-art-b64.txt (src/data/puzzleArt.ts에 붙여넣을 base64 본문)
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$src = [System.Drawing.Image]::FromFile((Join-Path $root 'assets\intro2-band.png'))
$side = [Math]::Min($src.Width, $src.Height)
$cropX = [int](($src.Width - $side) / 2)
$cropY = [int](($src.Height - $side) / 2)
$bmp = New-Object System.Drawing.Bitmap 800, 800
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
# 원본 PNG의 투명 영역이 JPEG에서 시커멓게 뭉개지지 않게 앱 톤 배경을 먼저 깐다
$gfx.Clear([System.Drawing.ColorTranslator]::FromHtml('#141024'))
$destRect = New-Object System.Drawing.Rectangle 0, 0, 800, 800
$srcRect = New-Object System.Drawing.Rectangle $cropX, $cropY, $side, $side
$gfx.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 70L)
$tmp = Join-Path $root 'scripts\puzzle-art-tmp.jpg'
$bmp.Save($tmp, $enc, $p)
$gfx.Dispose(); $bmp.Dispose(); $src.Dispose()
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($tmp))
Set-Content -Path (Join-Path $root 'scripts\puzzle-art-b64.txt') -Value $b64 -NoNewline
Remove-Item $tmp
Write-Host "base64 길이: $($b64.Length)"
