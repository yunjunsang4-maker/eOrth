# 이틀 행사 자동 매칭 — Windows 작업 스케줄러 등록 (행사용 PC에서 **한 번만** 실행)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\event-schedule-register.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\event-schedule-register.ps1 -Unregister   # 행사 후 정리
#
# 프로세스: **하루 1회 17:30(KST) 일괄 매칭** — 작업 2건이다(2026-08-31 운영 결정으로
# 하루 2타임 4건 체제를 폐기했다). 옛 4건이 남아 있으면 14:00·18:05에 그대로 또 돌아
# **같은 사람에게 문구가 두 번 나간다** — 그래서 등록·해제 양쪽에서 옛 이름을 명시적으로 지운다.
#
# ── 전제 조건 (하나라도 빠지면 당일 정시에 조용히 실패한다) ─────────────────────────
#  1. **이 저장소가 PC에 clone** 되어 있어야 한다. 등록되는 경로는 이 스크립트가 있는
#     위치 기준이라, 나중에 폴더를 옮기면 작업 2건을 다시 등록해야 한다.
#  2. 저장소 루트에 `.env` 가 있고 두 값이 **운영 프로젝트** 것이어야 한다:
#       EXPO_PUBLIC_SUPABASE_URL   (docs/event.html 이 하드코딩한 값과 같아야 한다 — 다르면 CLI가 즉시 멈춘다)
#       SUPABASE_SERVICE_ROLE_KEY  (Supabase 대시보드 > Project Settings > API. 절대 커밋 금지)
#     `.env` 는 추적되지 않으므로 clone 만으로는 생기지 않는다. USB/OneDrive로 직접 옮긴다.
#  3. `node` 가 PATH 에 있어야 한다. 확인: `node -v`
#  4. **그 시각에 PC가 켜져 있고 로그인되어 있어야 한다.** 리포트를 눈에 보이는 브라우저로
#     띄우는 것이 목적이라 작업을 대화형(Interactive)으로 등록한다 — 잠금 화면이거나 로그아웃
#     상태면 실행되지 않는다. 절전(sleep)은 -WakeToRun 이 깨우지만, **최대 절전(hibernate)과
#     완전 종료는 깨우지 못한다.** 행사 전날 전원 옵션에서 최대 절전을 꺼 두는 것이 안전하다.
#
# PowerShell 5.1 호환으로 쓴다(작업 스케줄러가 부르는 powershell.exe 는 5.1이다).
# 이 파일은 **UTF-8 BOM**으로 저장한다 — 5.1은 BOM이 없으면 ANSI로 읽어 한글이 전부 깨진다.

param(
  [switch]$Unregister,
  # 스태프 시연 제출 등을 2건 전부에서 뺄 때. 쉼표로 구분한 인스타 아이디.
  # ⚠️ 일부 실행에만 걸면 그 실행만 풀이 달라져 리포트가 어긋난다 — 걸려면 2건 전부에 건다.
  # (여기서 등록하면 자동으로 2건 모두에 같은 값이 들어간다.)
  [string]$Exclude,
  [string]$EventCode = 'popup01'
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$repo = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $repo 'scripts\event-day-run.ps1'
$prefix = 'eOrth-event-'

# ── 실행 시각과 매칭 하한은 **서로 다른 축이다. 헷갈리면 안 된다.** ──────────────
#  · `AtKst`   = 작업 스케줄러 트리거 시각. **KST로 적고, 등록 직전에 이 PC의 로컬 시각으로
#                변환해서 넣는다**(아래 ConvertTime). 독일 PC에서 등록해도 한국 17:30에 돈다.
#                키 이름에 Kst 를 박아 둔 이유: 여기만 변환 대상이라는 걸 읽는 순간 알게 하려고.
#  · `From`    = CLI 의 `--from`. **변환하지 않는다** — CLI 가 이 문자열을 항상 KST로 해석한다
#                (event-match-core.mjs 의 kstToMs). 여기까지 변환하면 하한이 이중으로 밀린다.
#
# 17:30 인 이유: 행사 종료는 18:00 이지만, 결과를 받아 **행사장에서 실제로 만날 시간**을 남겨야
# 한다. 대가는 명확하다 — **17:30~18:00 제출자는 그날 매칭에서 빠진다.**
# 1일차라면 폼에서 "다음 날 자동 참여"에 체크한 사람만 이월되고, 2일차라면 매칭이 없다.
# (스태프는 17:30 이후 제출자에게 그 사실을 현장에서 안내한다.)
#
# 2일차에만 CarryFile 을 준다 — 1일차(d1) 실행이 만들어 둔 이월 명단이다.
# 그 파일에는 1일차 최종 미매칭자 중 폼에서 "다음 날 자동 참여"에 체크한 사람만 담긴다.
# 1일차는 전날이 없으므로 비워 둔다(빈 값이면 래퍼가 --carry-file 을 아예 안 붙인다).
#
# ⚠️ **2일차에는 LastDay 를 반드시 준다.** 안 주면 최종일 리포트가 "내일 매칭에 자동 합류합니다 /
# 지금 아무것도 보내지 마세요"를 그대로 찍고, **다음 날이 없어 그분은 아무것도 못 받는다.**
# LastDay 는 이월 파일 생성을 막고 안내를 "오늘로 끝"으로 바꾼다.
# 1일차에는 절대 주면 안 된다 — 주면 이월 파일이 안 생겨 2일차가 통째로 멈춘다.
#
# ⚠️ **d1 이 반드시 먼저 성공해야 한다.** 그 실행이 파일을 만들지 못하면 d2 는
# "이월 파일이 없습니다"로 멈추고 실패 화면을 띄운다(조용히 이월 0명으로 넘어가지 않는다).
# 그래서 **1·2일차를 같은 PC에서 돌려야 한다** — 파일은 실행한 PC에만 생긴다.
$jobs = @(
  @{ Name = 'd1'; AtKst = '2026-09-09 17:30'; From = '2026-09-09 00:00'; CarryFile = ''; LastDay = $false; Desc = '1일차 매칭 (17:30 KST · 이월 명단 파일을 만든다)' },
  @{ Name = 'd2'; AtKst = '2026-09-10 17:30'; From = '2026-09-10 00:00'; CarryFile = 'event-carry-2026-09-09.local.json'; LastDay = $true; Desc = '2일차 매칭 (17:30 KST · 1일차 이월 명단 합류 · 행사 최종 · 이월 없음)' }
)

# 옛 프로세스(하루 2타임, 14:00·18:05)의 작업 이름. 노트북에 이미 등록돼 있다.
# **등록할 때도 해제할 때도 지운다.** 안 지우면 옛 4건이 그대로 살아 새 2건과 함께 돌아
# 같은 사람에게 문구가 두 번 나간다(이 프로젝트에서 가장 비싼 실패).
# 옛 이름이 $jobs 에서 사라졌으므로 배열 기반 삭제만으로는 절대 지워지지 않는다.
$legacyNames = @('d1-slot1', 'd1-slot2', 'd2-slot1', 'd2-slot2')

function Remove-EventTask {
  param([string]$TaskName)
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "  - 기존 작업 삭제: $TaskName"
    return $true
  }
  return $false
}

if ($Unregister) {
  Write-Host '행사 자동 매칭 작업 해제'
  $n = 0
  foreach ($j in $jobs) {
    if (Remove-EventTask ($prefix + $j.Name)) { $n++ }
  }
  # 옛 4건도 함께 지운다 — 해제했다고 생각했는데 옛 작업만 남아 도는 것이 최악이다
  foreach ($legacy in $legacyNames) {
    if (Remove-EventTask ($prefix + $legacy)) { $n++ }
  }
  Write-Host ''
  Write-Host "해제 완료: $n 건"
  Write-Host '남아 있는지 확인: Get-ScheduledTask -TaskName "eOrth-event-*"'
  exit 0
}

if (-not (Test-Path -LiteralPath $runner)) {
  Write-Error "실행 래퍼를 찾을 수 없습니다: $runner"
  exit 1
}
# 등록만 되고 당일에 조용히 실패하는 것이 최악이라, 전제 조건을 지금 확인해 둔다.
if (-not (Test-Path -LiteralPath (Join-Path $repo '.env'))) {
  Write-Warning ".env 가 없습니다: $repo\.env — 행사 전에 반드시 넣으세요(EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Warning 'node 를 PATH 에서 찾지 못했습니다. 행사 전에 `node -v` 로 확인하세요.'
}

# -WakeToRun: 절전 중이면 깨운다. -AllowStartIfOnBatteries / -DontStopIfGoingOnBatteries:
#   기본값은 "배터리면 시작 안 함 + 배터리로 바뀌면 중단"이다 — 부스에서 콘센트를 못 쓰면
#   그대로 아무것도 안 돌아간다. -StartWhenAvailable: 노트북이 꺼져 있어 시각을 놓쳤으면
#   켜진 직후 곧바로 실행한다(놓친 채로 넘어가는 것보다 늦게라도 도는 편이 낫다).
$settings = New-ScheduledTaskSettingsSet `
  -WakeToRun `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

# Interactive: 로그인한 세션에서 돌아야 브라우저가 **눈에 보이는 화면에** 뜬다.
# S4U/Service 로 등록하면 실행은 되는데 창이 안 보여 "안 돌았다"고 오해하게 된다.
$principal = New-ScheduledTaskPrincipal `
  -UserId ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME) `
  -LogonType Interactive `
  -RunLevel Limited

# ── 시간대 변환 준비 ──────────────────────────────────────────────────────────
# $jobs 의 AtKst 는 **KST 벽시계**다. 작업 스케줄러 트리거는 **PC 로컬 시각**으로 해석되므로,
# 시간대가 다른 PC(예: 독일 운영자)에서 등록하면 그대로 넣었을 때 실행 시각이 어긋난다.
# 그래서 등록 직전에 KST → 로컬로 변환한다. PC가 이미 KST면 변환 결과가 같아 기존과 동일하다.
# 'Korea Standard Time' 은 Windows 표준 ID 로 5.1/.NET Framework 에서 그대로 동작한다.
$kstZone = [System.TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
Write-Host "저장소: $repo"
Write-Host "래퍼:   $runner"
Write-Host ("이 PC 시간대: {0}" -f [System.TimeZoneInfo]::Local.Id)
Write-Host ''

foreach ($j in $jobs) {
  $taskName = $prefix + $j.Name
  # 재실행 안전 — 같은 이름이 있으면 지우고 새로 만든다(설정을 고친 뒤 다시 돌릴 수 있어야 한다)
  [void](Remove-EventTask $taskName)

  # -File 뒤 인자에 공백이 있으므로("2026-09-09 00:00") 반드시 따옴표로 감싼다.
  # 안 감싸면 스케줄러가 "2026-09-09" 와 "00:00" 을 별개 인자로 쪼개 CLI가 형식 오류로 멈춘다.
  # -Slot·-Boundary 는 붙이지 않는다 — 하루 1회 일괄 매칭이다(래퍼에서도 선택 인자다).
  $argLine = '-NoProfile -ExecutionPolicy Bypass -File "' + $runner + '"' +
    ' -From "' + $j.From + '"'
  # 1일차는 빈 값이다 — 빈 문자열을 넘기면 CLI 가 형식 오류로 멈추므로 인자 자체를 안 붙인다
  if ($j.CarryFile) { $argLine += ' -CarryFile "' + $j.CarryFile + '"' }
  # 값 없는 스위치 — 마지막 날(d2)에만 붙는다
  if ($j.LastDay) { $argLine += ' -LastDay' }
  if ($Exclude) { $argLine += ' -Exclude "' + $Exclude + '"' }
  $argLine += ' -EventCode ' + $EventCode

  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argLine -WorkingDirectory $repo
  # InvariantCulture 를 명시한다 — $null 을 넘기면 CurrentCulture 를 쓰므로, '-'·':' 를 다르게
  # 다루는 로캘로 설정된 PC 에서 등록하면 예외로 죽는다. 등록은 PC마다 한 번뿐이라
  # 그때 죽으면 예약이 통째로 안 걸린다.
  # ParseExact 결과의 Kind 는 Unspecified 라 ConvertTime 이 sourceTimeZone(KST)을 그대로 믿는다.
  $kstAt = [datetime]::ParseExact(
      $j.AtKst, 'yyyy-MM-dd HH:mm', [System.Globalization.CultureInfo]::InvariantCulture)
  $localAt = [System.TimeZoneInfo]::ConvertTime($kstAt, $kstZone, [System.TimeZoneInfo]::Local)
  $trigger = New-ScheduledTaskTrigger -Once -At $localAt

  [void](Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
      -Settings $settings -Principal $principal -Description ('eOrth 단대축제 부스 — ' + $j.Desc))
  $prevNote = if ($j.LastDay) { '  [이월 파일 읽음 · 최종일이라 새로 만들지 않음]' }
    elseif ($j.CarryFile) { '  [이월 파일 읽음]' }
    else { '  [이월 파일 생성]' }
  # 운영자가 "내 시간으로 몇 시에 도는지"를 눈으로 확인해야 한다 — 변환 결과를 반드시 찍는다.
  Write-Host ("  + 등록: {0}  @ KST {1}  =  이 PC 로컬 {2}{3}" -f `
      $taskName, $j.AtKst, $localAt.ToString('yyyy-MM-dd HH:mm'), $prevNote)
}

# 옛 4건(하루 2타임 체제)이 남아 있으면 지운다 — 새 2건과 함께 돌면 중복 발송이다.
# $jobs 루프와 따로 도는 이유: 옛 이름은 이제 $jobs 에 없어 배열 기반 삭제가 닿지 않는다.
$legacyRemoved = 0
foreach ($legacy in $legacyNames) {
  if (Remove-EventTask ($prefix + $legacy)) { $legacyRemoved++ }
}
if ($legacyRemoved) {
  Write-Host ("  ! 옛 하루 2타임 작업 {0}건을 삭제했습니다(14:00·18:05) — 남겨두면 중복 발송입니다." -f $legacyRemoved)
}

Write-Host ''
Write-Host '── 등록된 작업 2건 ──'
Get-ScheduledTask -TaskName ($prefix + '*') |
  Select-Object TaskName, State, @{ N = '실행예정'; E = { (Get-ScheduledTaskInfo -TaskName $_.TaskName).NextRunTime } } |
  Format-Table -AutoSize

Write-Host '위 "실행예정"은 이 PC의 로컬 시각입니다 — KST 17:30 에 해당하는 시각인지 눈으로 확인하세요.'
Write-Host '수동 확인: Start-ScheduledTask -TaskName "eOrth-event-d1"  (지금 바로 한 번 돌려본다)'
Write-Host '전체 해제: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\event-schedule-register.ps1 -Unregister'
Write-Host '⚠ 다른 PC에서도 등록해 두었다면 그쪽을 반드시 해제하세요 — 두 PC가 각각 돌면 중복 발송입니다.'
