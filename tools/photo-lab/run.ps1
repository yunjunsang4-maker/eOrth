<#
.SYNOPSIS
  사진 폴더 → 신호 추출(파이썬) → 앱 JS 층(tsx) → report.html 열기
.EXAMPLE
  .\tools\photo-lab\run.ps1 "D:\사진\오사카"
.EXAMPLE
  .\tools\photo-lab\run.ps1 "D:\사진\오사카" -ReportOnly     # taxonomy·판정기 튜닝 루프(신호 재계산 없음)
.EXAMPLE
  .\tools\photo-lab\run.ps1 "D:\사진\오사카" -Golden osaka   # 결과가 맞다고 확정한 여행을 골든셋으로 저장
#>
param(
  [Parameter(Mandatory = $true)][string]$PhotoDir,
  [switch]$ReportOnly,   # extract.py 생략, report.ts만
  [switch]$Force,        # 신호 캐시 무시, 전체 재계산
  [switch]$NoModel,      # CLIP·얼굴 없이 순수 지표만(의존성 설치 전 확인용)
  [string]$Golden,       # 골든 이름 → src/services/photoAI/goldens/golden-<이름>.json
  [switch]$NoOpen        # 브라우저 열지 않음
)
$ErrorActionPreference = 'Stop'
$lab = $PSScriptRoot
$root = Resolve-Path (Join-Path $lab '..\..')
$name = Split-Path (Resolve-Path $PhotoDir) -Leaf
$out = Join-Path $lab "out\$name"

if (-not $ReportOnly) {
  $py = @((Join-Path $lab 'extract.py'), $PhotoDir, $out)
  if ($Force) { $py += '--force' }
  if ($NoModel) { $py += '--no-model' }
  python @py
  if ($LASTEXITCODE) { exit $LASTEXITCODE }
}

$reg = ([uri](Join-Path $lab 'register.mjs')).AbsoluteUri
$node = @('--import', 'tsx', '--import', $reg, (Join-Path $lab 'report.ts'), $out)
if ($Golden) { $node += @('--golden', $Golden) }
Push-Location $root
try { node @node } finally { Pop-Location }
if ($LASTEXITCODE) { exit $LASTEXITCODE }

if (-not $NoOpen) { Start-Process (Join-Path $out 'report.html') }
