# 행사 당일 매칭 자동 실행 래퍼 (Windows 작업 스케줄러가 부른다)
#
# 현재 프로세스는 **하루 1회 17:30(KST) 일괄 매칭**이다 — -Slot/-Boundary 는 주지 않는다.
#
#   # 1일차 (17:30) — 이 실행이 이월 명단 파일을 만든다
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\event-day-run.ps1 `
#       -From "2026-09-09 00:00"
#   # 2일차·최종일 (17:30) — 1일차 이월 명단 파일을 읽고, 다음 날이 없으므로 -LastDay
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\event-day-run.ps1 `
#       -From "2026-09-10 00:00" -CarryFile "event-carry-2026-09-09.local.json" -LastDay
#
#   # 수동 폴백 — 하루를 두 타임으로 끊을 때만 -Slot·-Boundary 를 함께 준다(둘은 항상 짝이다)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\event-day-run.ps1 `
#       -Slot 1 -Boundary "2026-09-09 14:00" -From "2026-09-09 00:00"
#
# 왜 래퍼가 필요한가 — 자동화 범위는 "정시에 매칭 실행 → 리포트가 브라우저에 자동으로 열림"까지다.
# 부스 현장에서 **콘솔은 아무도 안 본다.** 성공하면 리포트를, 실패하면 실패 사유를 담은 HTML을
# 기본 브라우저로 띄워야 스태프가 알아챈다. 조용히 실패하면 아무도 모른 채 발송 시각을 놓친다.
#
# PowerShell 5.1(기본 Windows PowerShell) 호환으로 쓴다 — 작업 스케줄러가 부르는 powershell.exe는
# 7.x(pwsh)가 아니라 5.1이다. 5.1에 없는 문법(`??`, `?:`, `&&`, `||`)은 쓰지 않는다.
# 이 파일은 **UTF-8 BOM**으로 저장해야 한다. 5.1은 BOM이 없으면 ANSI 코드페이지로 읽어
# 한글 주석·문자열이 전부 깨진다(파싱까지 어긋날 수 있다).

param(
  # -Slot·-Boundary 는 **두 타임 폴백에서만** 준다. 하루 1회 일괄 매칭에서는 비워 둔다
  # (비면 CLI 에 --slot/--boundary 를 아예 안 붙인다 — 빈 문자열을 넘기면 CLI 가 형식 오류로 멈춘다).
  # 둘 중 하나만 주면 CLI 가 "--slot 과 --boundary 는 함께 써야 합니다"로 멈춘다.
  # ValidateSet 은 그대로 둔다 — 인자를 **안 주면** 검사 자체가 돌지 않고($Slot 은 빈 문자열),
  # 주면 1·2 만 통과한다(5.1 실측 확인). 그래서 '' 를 집합에 넣을 필요가 없다.
  [ValidateSet('1', '2')][string]$Slot,
  [string]$Boundary,
  [Parameter(Mandatory = $true)][string]$From,
  # 전날 이월 명단 파일(2일차 실행에만 준다). 전날 17:30 실행이 만들어 둔 파일이다.
  # 1일차 실행에서는 비워 둔다. 파일이 없으면 CLI 가 멈추고 실패 화면을 띄운다(조용히 넘어가지 않는다).
  [string]$CarryFile,
  # 행사 **마지막 날** 실행에만 준다. CLI 에 --last-day 를 붙여 이월 파일 생성을 막고,
  # 미매칭 안내를 "오늘로 끝"으로 바꾼다. 안 주면 최종일 리포트가 "내일 매칭에 자동 합류합니다"를
  # 그대로 찍어 **그분이 아무것도 못 받는다**(다음 날이 없다).
  [switch]$LastDay,
  # 스태프 시연 제출 등을 뺄 때. 쉼표로 구분한 인스타 아이디.
  # ⚠️ 1일차에 이걸 썼다면 **2일차에도 같은 값을 줘야** 한다 — 그날 풀이 달라지면 리포트가 어긋난다.
  [string]$Exclude,
  [string]$EventCode = 'popup01'
)

# 여기서 Stop이면 node의 stderr(2>&1로 파이프라인에 섞임)가 예외로 튀어 실패 HTML을 못 만든다
$ErrorActionPreference = 'Continue'
# node가 UTF-8로 뱉는 한글 출력을 그대로 받는다. 안 하면 실패 HTML에 사유가 깨져 나온다.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# 저장소 루트 = scripts/ 의 부모. event-match.mjs 는 .env 와 docs/event.html 을 **상대 경로**로
# 읽으므로 반드시 루트에서 실행해야 한다(스케줄러의 시작 폴더를 믿지 않는다).
$repo = Split-Path -Parent $PSScriptRoot
$matchScript = Join-Path $repo 'scripts\event-match.mjs'
$errorPage = Join-Path $repo 'event-error.local.html'

# CLI 인자를 배열로 조립한다 — 선택 인자는 값이 있을 때만 붙인다.
# 빈 문자열을 그대로 넘기면 CLI 가 "형식이 올바르지 않습니다"로 멈춘다(1일차 실행이 전부 실패한다).
$cliArgs = @('--event', $EventCode, '--from', $From)
if ($Slot) { $cliArgs += @('--slot', $Slot) }
if ($Boundary) { $cliArgs += @('--boundary', $Boundary) }
if ($CarryFile) { $cliArgs += @('--carry-file', $CarryFile) }
# 값 없는 스위치라 인자를 하나만 붙인다(CLI 의 flag() 는 뒤에 값이 없어도 잡는다)
if ($LastDay) { $cliArgs += '--last-day' }
if ($Exclude) { $cliArgs += @('--exclude', $Exclude) }

# 실패 화면에 그대로 보여줄 명령 — 스태프가 이걸 복붙해 수동 폴백할 수 있어야 한다.
# 공백이 있는 값만 따옴표로 감싼다.
$quoted = $cliArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
$cmdText = 'node scripts/event-match.mjs ' + ($quoted -join ' ')

Write-Host "[event-day-run] $cmdText"

$exitCode = 1
$outputText = ''
Push-Location $repo
try {
  # 2>&1 로 stdout·stderr 를 한 덩어리로 받는다 — 실패 사유는 대부분 stderr 에만 있다.
  $lines = & node $matchScript @cliArgs 2>&1
  $exitCode = $LASTEXITCODE
  if ($null -eq $exitCode) { $exitCode = 1 }
  # stderr 줄은 ErrorRecord 로 들어온다. 그대로 ToString() 하면 **빈 줄이**
  # "System.Management.Automation.RemoteException" 이라는 잡음으로 찍혀 사유를 읽기 어려워진다.
  # ErrorRecord 는 .Exception.Message 가 원래 줄 내용이다.
  $outputText = (($lines | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { $_.ToString() }
      }) -join "`r`n")
}
catch {
  # node 자체가 없을 때(PATH 미설정) 여기로 온다 — 스케줄러 환경에서 실제로 잘 나는 실패다
  $outputText = "실행 자체가 실패했습니다: " + $_.Exception.Message
  $exitCode = 1
}
finally {
  Pop-Location
}

Write-Host $outputText

# 산출 파일명은 event-match.mjs 가 REPORT_FILE= 줄로 알려준다(ASCII 고정).
# 여기서 이름을 다시 계산하지 않는 이유: --from 유무로 파일명 규칙이 갈려서, 규칙을 두 곳에
# 복사해 두면 한쪽만 바뀌었을 때 "성공했는데 옛 리포트를 여는" 최악의 형태로 조용히 어긋난다.
$reportPath = $null
$m = [regex]::Match($outputText, 'REPORT_FILE=(.+)')
if ($m.Success) {
  $reportPath = Join-Path $repo ($m.Groups[1].Value.Trim())
}

if ($exitCode -eq 0 -and $reportPath -and (Test-Path -LiteralPath $reportPath)) {
  Write-Host "[event-day-run] 리포트를 브라우저로 엽니다: $reportPath"
  Start-Process -FilePath $reportPath
  exit 0
}

# ── 여기부터 실패 경로 ──
# 종료코드가 0인데 리포트 파일이 없는 경우도 실패로 친다. 그냥 넘기면 스태프가
# "열렸겠거니" 하고 넘어가 발송 시각을 통째로 놓친다.
if ($exitCode -eq 0) {
  $outputText = $outputText + "`r`n`r`n(종료코드는 0이지만 리포트 파일을 찾지 못했습니다.)"
}

$esc = {
  param($s)
  if ($null -eq $s) { return '' }
  return ([string]$s).Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
}

$template = @'
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>매칭 실행 실패 — eOrth 부스</title><style>
body{background:#0A0A0F;color:#fff;font-family:system-ui,sans-serif;margin:0;padding:32px;line-height:1.6}
h1{color:#FF3B30;font-size:34px;margin:0 0 4px}
.sub{color:#A1A1B0;font-size:18px;margin-bottom:24px}
h2{color:#BF85FC;font-size:20px;margin:28px 0 8px}
pre{background:#2E2E3B;border:1px solid #1A1A26;border-left:4px solid #FF3B30;border-radius:10px;
    padding:16px;font-size:16px;white-space:pre-wrap;word-break:break-all;overflow-x:auto}
pre.cmd{border-left-color:#BF85FC;font-size:17px}
ol{font-size:17px} li{margin-bottom:6px}
</style></head><body>
<h1>매칭 실행 실패</h1>
<div class="sub">@@TIME@@ · 종료코드 @@CODE@@ · 자동 실행이 리포트를 만들지 못했습니다.</div>
<h2>지금 할 일</h2>
<ol>
<li>아래 명령을 저장소 폴더에서 <b>직접 복붙해 실행</b>하세요(수동 폴백).</li>
<li>그래도 안 되면 <code>.env</code>의 <code>EXPO_PUBLIC_SUPABASE_URL</code>이 운영 프로젝트인지,
    <code>SUPABASE_SERVICE_ROLE_KEY</code>가 들어 있는지 확인하세요.</li>
<li>발송은 사람이 합니다 — 리포트가 안 나왔다고 아무것도 보내지 마세요.</li>
</ol>
<h2>실행한 명령</h2>
<pre class="cmd">@@CMD@@</pre>
<h2>출력(stdout + stderr)</h2>
<pre>@@OUT@@</pre>
</body></html>
'@

$html = $template.Replace('@@TIME@@', (& $esc (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')))
$html = $html.Replace('@@CODE@@', (& $esc $exitCode))
$html = $html.Replace('@@CMD@@', (& $esc $cmdText))
$html = $html.Replace('@@OUT@@', (& $esc $outputText))

# 5.1의 -Encoding utf8 은 BOM을 붙이지만 브라우저는 <meta charset>과 함께 정상 표시한다
Set-Content -LiteralPath $errorPage -Value $html -Encoding UTF8
Write-Host "[event-day-run] 실패 — 사유 화면을 엽니다: $errorPage"
Start-Process -FilePath $errorPage
exit 1
