# 이틀 행사 자동 매칭 — Windows 작업 스케줄러 등록 (행사용 노트북에서 **한 번만** 실행)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\event-schedule-register.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\event-schedule-register.ps1 -Unregister   # 행사 후 정리
#
# ── 전제 조건 (하나라도 빠지면 당일 정시에 조용히 실패한다) ─────────────────────────
#  1. **이 저장소가 노트북에 clone** 되어 있어야 한다. 등록되는 경로는 이 스크립트가 있는
#     위치 기준이라, 나중에 폴더를 옮기면 작업 4건을 다시 등록해야 한다.
#  2. 저장소 루트에 `.env` 가 있고 두 값이 **운영 프로젝트** 것이어야 한다:
#       EXPO_PUBLIC_SUPABASE_URL   (docs/event.html 이 하드코딩한 값과 같아야 한다 — 다르면 CLI가 즉시 멈춘다)
#       SUPABASE_SERVICE_ROLE_KEY  (Supabase 대시보드 > Project Settings > API. 절대 커밋 금지)
#     `.env` 는 추적되지 않으므로 clone 만으로는 생기지 않는다. USB/OneDrive로 직접 옮긴다.
#  3. `node` 가 PATH 에 있어야 한다. 확인: `node -v`
#  4. **그 시각에 노트북이 켜져 있고 로그인되어 있어야 한다.** 리포트를 눈에 보이는 브라우저로
#     띄우는 것이 목적이라 작업을 대화형(Interactive)으로 등록한다 — 잠금 화면이거나 로그아웃
#     상태면 실행되지 않는다. 절전(sleep)은 -WakeToRun 이 깨우지만, **최대 절전(hibernate)과
#     완전 종료는 깨우지 못한다.** 행사 전날 전원 옵션에서 최대 절전을 꺼 두는 것이 안전하다.
#
# PowerShell 5.1 호환으로 쓴다(작업 스케줄러가 부르는 powershell.exe 는 5.1이다).
# 이 파일은 **UTF-8 BOM**으로 저장한다 — 5.1은 BOM이 없으면 ANSI로 읽어 한글이 전부 깨진다.

param(
  [switch]$Unregister,
  # 스태프 시연 제출 등을 4건 전부에서 뺄 때. 쉼표로 구분한 인스타 아이디.
  # ⚠️ 일부 실행에만 걸면 그 실행만 풀이 달라져 리포트가 어긋난다 — 걸려면 4건 전부에 건다.
  # (여기서 등록하면 자동으로 4건 모두에 같은 값이 들어간다.)
  [string]$Exclude,
  [string]$EventCode = 'popup01'
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$repo = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $repo 'scripts\event-day-run.ps1'
$prefix = 'eOrth-event-'

# 4건 모두 KST **로컬 시각 그대로**다. 노트북 시간대가 한국(UTC+9)이라는 전제이며,
# `--boundary`/`--from` 도 CLI가 KST로 해석한다(event-match-core.mjs 의 kstToMs).
# 시간대가 다른 PC에서 등록하면 실행 시각만 어긋난다(매칭 경계는 안 어긋난다).
#
# 18:05 인 이유: 행사 종료가 18:00 이라 정각에 돌리면 마지막 1~2명의 제출이 안 잡힌다.
#
# 2일차 두 건에만 CarryFile 을 준다 — 1일차 타임②(d1-slot2) 실행이 만들어 둔 이월 명단이다.
# 그 파일에는 1일차 최종 미매칭자 중 폼에서 "다음 날 자동 참여"에 체크한 사람만 담긴다.
# slot 1·2 **둘 다** 같은 파일을 주는 것이 맞다: slot 2 의 풀은 당일 slot 1 풀을 기반으로
# 재계산되므로, slot 2 에만 빠뜨리면 이월자가 타임②에서 조용히 사라진다.
# 1일차 두 건은 전날이 없으므로 비워 둔다(빈 값이면 래퍼가 --carry-file 을 아예 안 붙인다).
#
# ⚠️ **d1-slot2 가 반드시 먼저 성공해야 한다.** 그 실행이 파일을 만들지 못하면 2일차 두 건은
# "이월 파일이 없습니다"로 멈추고 실패 화면을 띄운다(조용히 이월 0명으로 넘어가지 않는다).
$jobs = @(
  @{ Name = 'd1-slot1'; At = '2026-09-09 14:00'; Slot = '1'; Boundary = '2026-09-09 14:00'; From = '2026-09-09 00:00'; CarryFile = ''; Desc = '1일차 타임① 매칭 (경계 14:00 직후)' },
  @{ Name = 'd1-slot2'; At = '2026-09-09 18:05'; Slot = '2'; Boundary = '2026-09-09 14:00'; From = '2026-09-09 00:00'; CarryFile = ''; Desc = '1일차 타임② 매칭 (종료 직후 · 이월 명단 파일을 만든다)' },
  @{ Name = 'd2-slot1'; At = '2026-09-10 14:00'; Slot = '1'; Boundary = '2026-09-10 14:00'; From = '2026-09-10 00:00'; CarryFile = 'event-carry-2026-09-09.local.json'; Desc = '2일차 타임① 매칭 (1일차 이월 명단 합류)' },
  @{ Name = 'd2-slot2'; At = '2026-09-10 18:05'; Slot = '2'; Boundary = '2026-09-10 14:00'; From = '2026-09-10 00:00'; CarryFile = 'event-carry-2026-09-09.local.json'; Desc = '2일차 타임② 매칭 (행사 최종)' }
)

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

Write-Host "저장소: $repo"
Write-Host "래퍼:   $runner"
Write-Host ''

foreach ($j in $jobs) {
  $taskName = $prefix + $j.Name
  # 재실행 안전 — 같은 이름이 있으면 지우고 새로 만든다(설정을 고친 뒤 다시 돌릴 수 있어야 한다)
  [void](Remove-EventTask $taskName)

  # -File 뒤 인자에 공백이 있으므로("2026-09-09 14:00") 반드시 따옴표로 감싼다.
  # 안 감싸면 스케줄러가 "2026-09-09" 와 "14:00" 을 별개 인자로 쪼개 CLI가 형식 오류로 멈춘다.
  $argLine = '-NoProfile -ExecutionPolicy Bypass -File "' + $runner + '"' +
    ' -Slot ' + $j.Slot +
    ' -Boundary "' + $j.Boundary + '"' +
    ' -From "' + $j.From + '"'
  # 1일차는 빈 값이다 — 빈 문자열을 넘기면 CLI 가 형식 오류로 멈추므로 인자 자체를 안 붙인다
  if ($j.CarryFile) { $argLine += ' -CarryFile "' + $j.CarryFile + '"' }
  if ($Exclude) { $argLine += ' -Exclude "' + $Exclude + '"' }
  $argLine += ' -EventCode ' + $EventCode

  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argLine -WorkingDirectory $repo
  # InvariantCulture 를 명시한다 — $null 을 넘기면 CurrentCulture 를 쓰므로, '-'·':' 를 다르게
  # 다루는 로캘로 설정된 PC 에서 등록하면 예외로 죽는다. 등록은 노트북에서 한 번뿐이라
  # 그때 죽으면 예약이 통째로 안 걸린다.
  $trigger = New-ScheduledTaskTrigger -Once -At ([datetime]::ParseExact(
      $j.At, 'yyyy-MM-dd HH:mm', [System.Globalization.CultureInfo]::InvariantCulture))

  [void](Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
      -Settings $settings -Principal $principal -Description ('eOrth 단대축제 부스 — ' + $j.Desc))
  $prevNote = if ($j.CarryFile) { '  [이월 파일 읽음]' } elseif ($j.Slot -eq '2') { '  [이월 파일 생성]' } else { '' }
  Write-Host ("  + 등록: {0}  @ {1}  (slot {2}){3}" -f $taskName, $j.At, $j.Slot, $prevNote)
}

Write-Host ''
Write-Host '── 등록된 작업 4건 ──'
Get-ScheduledTask -TaskName ($prefix + '*') |
  Select-Object TaskName, State, @{ N = '실행예정'; E = { (Get-ScheduledTaskInfo -TaskName $_.TaskName).NextRunTime } } |
  Format-Table -AutoSize

Write-Host '수동 확인: Start-ScheduledTask -TaskName "eOrth-event-d1-slot1"  (지금 바로 한 번 돌려본다)'
Write-Host '전체 해제: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\event-schedule-register.ps1 -Unregister'
