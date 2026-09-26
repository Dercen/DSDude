# DSDude memory sampler (PLAN.md 7.2 memory gate). Appends one CSV line per minute:
#   yyyy-MM-ddTHH:mm:ss,availableMB,committedBytes
# to <repo>\.dsdude\memsampler.log. Start it detached (the one process without a timeout):
#   Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-File','<repo>\tools\memsampler.ps1'
# ASCII only: Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI.
$ErrorActionPreference = 'Continue'
$dir = Join-Path (Split-Path -Parent $PSScriptRoot) '.dsdude'
$log = Join-Path $dir 'memsampler.log'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
$created = $false
$mutex = New-Object System.Threading.Mutex($false, 'Local\DSDudeMemSampler', [ref]$created)
if (-not $mutex.WaitOne(0)) { exit 0 }   # another sampler is already running
try {
  while ($true) {
    try {
      $s = (Get-Counter '\Memory\Available MBytes', '\Memory\Committed Bytes' -ErrorAction Stop).CounterSamples
      $avail = [int64]$s[0].CookedValue
      $commit = [int64]$s[1].CookedValue
      Add-Content -Path $log -Encoding ascii -Value ('{0},{1},{2}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $avail, $commit)
    } catch {
      Add-Content -Path $log -Encoding ascii -Value ('# {0} sample failed: {1}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $_.Exception.Message)
    }
    Start-Sleep -Seconds 60
  }
} finally {
  $mutex.ReleaseMutex()
}
