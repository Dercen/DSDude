# DSDude checkpoint / daily integration (docs/kickoff/ws0.md tasks 3 and 8). ASCII only.
#   tools\checkpoint.ps1 -MemoryOnly [-Since '2026-09-25T09:00']   memory gate summary (restarts a stale sampler)
#   tools\checkpoint.ps1 -AdrOnly                                   ADR-pending inventory
#   tools\checkpoint.ps1                                            full integration (task 8; Day-1 part: checks only)
[CmdletBinding()]
param(
  [switch]$MemoryOnly,
  [switch]$AdrOnly,
  [string]$Since = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$log = Join-Path $repo '.dsdude\memsampler.log'
$sampler = Join-Path $repo 'tools\memsampler.ps1'
$gateMB = 1536

function Write-OneDriveWarning {
  # Risk 10: if OneDrive syncs the repo, node_modules, .git and .dsdude lock.
  $od = $env:OneDrive
  if ($od -and $repo.StartsWith($od, [System.StringComparison]::OrdinalIgnoreCase) -and
      (Get-Process OneDrive -ErrorAction SilentlyContinue)) {
    Write-Warning ("OneDrive.exe is running and the repo is under {0}. Pause the instances and turn Desktop sync off (risk 10)." -f $od)
  }
}

function Start-Sampler {
  Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile', '-File', $sampler | Out-Null
}

function Get-LastCheckpointTime {
  $files = Get-ChildItem (Join-Path $repo 'docs\status') -Filter 'checkpoint-*.md' -ErrorAction SilentlyContinue
  if (-not $files) { return $null }
  $newest = $files | Sort-Object { [int]($_.BaseName -replace '\D', '') } | Select-Object -Last 1
  $iso = & git -C $repo log -1 --format=%cI -- ("docs/status/" + $newest.Name)
  if ($iso) { return [datetime]$iso }
  return $newest.LastWriteTime
}

function Show-Memory {
  if (-not (Test-Path $log)) {
    Write-Host 'memsampler.log does not exist yet: starting the sampler.'
    Start-Sampler
    return
  }
  if (((Get-Date) - (Get-Item $log).LastWriteTime).TotalMinutes -gt 5) {
    Write-Host 'memsampler.log is more than 5 minutes old: restarting the sampler.'
    Start-Sampler
  }
  $from = $null
  if ($Since) { $from = [datetime]$Since } else { $from = Get-LastCheckpointTime }
  $rows = foreach ($line in Get-Content $log) {
    if ($line -match '^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d),(\d+),(\d+)$') {
      $t = [datetime]::ParseExact($Matches[1], 'yyyy-MM-ddTHH:mm:ss', $null)
      if ($from -eq $null -or $t -ge $from) {
        [pscustomobject]@{ Time = $t; AvailMB = [int64]$Matches[2]; Commit = [int64]$Matches[3] }
      }
    }
  }
  if (-not $rows) { Write-Host 'No samples in the window yet.'; return }
  $min = $rows | Sort-Object AvailMB | Select-Object -First 1
  $peak = $rows | Sort-Object Commit | Select-Object -Last 1
  $label = 'the start of the log'
  if ($from) { $label = $from.ToString('yyyy-MM-ddTHH:mm') }
  Write-Host ('Memory since {0} ({1} samples):' -f $label, @($rows).Count)
  Write-Host ('  minimum available: {0} MB at {1:yyyy-MM-ddTHH:mm}' -f $min.AvailMB, $min.Time)
  Write-Host ('  peak commit charge: {0:N1} GB at {1:yyyy-MM-ddTHH:mm}' -f ($peak.Commit / 1GB), $peak.Time)
  if ($min.AvailMB -gt $gateMB) {
    Write-Host ('  memory gate: PASS (minimum stayed above {0} MB; a local launch is allowed)' -f $gateMB)
  } else {
    Write-Host ('  memory gate: FAIL (minimum fell to {0} MB <= {1} MB; do not add a local instance)' -f $min.AvailMB, $gateMB)
  }
}

function Show-Adr {
  & node (Join-Path $repo 'tools\adr-pending.ts')
}

Write-OneDriveWarning
if ($MemoryOnly) { Show-Memory; exit 0 }
if ($AdrOnly) { Show-Adr; exit 0 }

Write-Host 'Full integration (task 8) is not implemented yet: run -MemoryOnly or -AdrOnly.'
Show-Memory
Show-Adr
exit 0
