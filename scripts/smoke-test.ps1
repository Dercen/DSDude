<#
.SYNOPSIS
  Smoke-tests the BlocksDS install (PLAN.md 6 WS1, spike 6): builds SDK examples with make from outside the
  Wonderful shell, checks each ROM's header, and optionally screenshots one in py-desmume.

.DESCRIPTION
  The examples are copied to a temp folder first, so the SDK tree stays untouched. Each build runs
  C:\msys64\usr\bin\bash.exe -lc 'make VERBOSE=1 -jN' with SHLVL removed (as under Electron) and the Wonderful
  environment, with a 10-minute limit. The NitroFS examples must carry the 'NitroFS!' mark after their FAT.

  graphics_2d/bg_regular_nitrofs is not used: in BlocksDS 1.24.0 it builds with ArchitectDS (build.py), not make.

  Windows PowerShell 5.1. ASCII only. Inner bash strings use single quotes only.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
  powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1 -Screenshot
#>
[CmdletBinding()]
param(
  [string]$Msys2 = 'C:\msys64',
  [int]$Jobs = $(if ($env:DSDUDE_MAKE_JOBS) { [int]$env:DSDUDE_MAKE_JOBS } else { 4 }),
  [string]$WorkDir = (Join-Path $env:TEMP ('dsdude-smoke-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))),
  [switch]$Screenshot
)
$ErrorActionPreference = 'Stop'

# Example folder, ROM name (the Makefile's NAME), whether it packs NitroFS.
$Examples = @(
  @{ Dir = 'graphics_2d/bg_regular_8bit'; Rom = 'bg_regular_8bit.nds'; NitroFS = $false },
  @{ Dir = 'filesystem/nitrofs'; Rom = 'fs_nitrofs.nds'; NitroFS = $true },
  @{ Dir = 'maxmod/nitrofs'; Rom = 'maxmod_nitrofs.nds'; NitroFS = $true }
)

$Bash = Join-Path $Msys2 'usr\bin\bash.exe'
$wfBin = Join-Path $Msys2 'opt\wonderful\bin'
if (-not (Test-Path (Join-Path $Msys2 'opt\wonderful\thirdparty\blocksds\core\tools\ndstool\ndstool.exe'))) {
  throw 'BlocksDS is not installed: run scripts\install-toolchain.ps1 first'
}

$env:MSYSTEM = 'UCRT64'; $env:MSYS2_PATH_TYPE = 'inherit'; $env:CHERE_INVOKING = '1'
$env:BLOCKSDS = '/opt/wonderful/thirdparty/blocksds/core'
$env:BLOCKSDSEXT = '/opt/wonderful/thirdparty/blocksds/external'
$env:WONDERFUL_TOOLCHAIN = '/opt/wonderful'
$env:PATH = $wfBin + ';' + ((($env:PATH -split ';') | Where-Object { $_ -and ($_ -ne $wfBin) }) -join ';')
Remove-Item Env:SHLVL -ErrorAction SilentlyContinue

function Invoke-Bash([string]$Command, [string]$Cwd, [int]$TimeoutMin) {
  if ($Command.Contains('"')) { throw 'no double quotes inside bash commands' }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Bash
  $psi.Arguments = '-lc "' + $Command + '"'
  $psi.UseShellExecute = $false
  $psi.WorkingDirectory = $Cwd
  $proc = [System.Diagnostics.Process]::Start($psi)
  if (-not $proc.WaitForExit($TimeoutMin * 60000)) {
    & taskkill.exe /T /F /PID $proc.Id | Out-Null
    throw ('timed out after ' + $TimeoutMin + ' min: ' + $Command)
  }
  $proc.WaitForExit()
  return $proc.ExitCode
}

# The same checks as packRom(): FNT/FAT offsets >= 0x8000, FAT size > 0, 'NitroFS!' at FAT offset + size.
function Test-NitroFS([string]$Rom) {
  $bytes = [IO.File]::ReadAllBytes($Rom)
  $fnt = [BitConverter]::ToUInt32($bytes, 0x40)
  $fatOff = [BitConverter]::ToUInt32($bytes, 0x48)
  $fatSize = [BitConverter]::ToUInt32($bytes, 0x4C)
  $at = $fatOff + $fatSize
  $magic = if ($at + 8 -le $bytes.Length) { [Text.Encoding]::ASCII.GetString($bytes, $at, 8) } else { '' }
  return ($fnt -ge 0x8000) -and ($fatOff -ge 0x8000) -and ($fatSize -gt 0) -and ($magic -eq 'NitroFS!')
}

New-Item -ItemType Directory -Force $WorkDir | Out-Null
$failed = 0
foreach ($ex in $Examples) {
  $parent = Join-Path $WorkDir ($ex.Dir.Split('/')[0])
  New-Item -ItemType Directory -Force $parent | Out-Null
  $code = Invoke-Bash ('cp -r $BLOCKSDS/examples/' + $ex.Dir + ' .') $parent 2
  if ($code -ne 0) { throw ('copy of ' + $ex.Dir + ' failed') }
  $dir = Join-Path $WorkDir ($ex.Dir.Replace('/', '\'))
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $code = Invoke-Bash ('make VERBOSE=1 -j' + $Jobs + ' > make.log 2>&1') $dir 10
  $rom = Join-Path $dir $ex.Rom
  $ok = ($code -eq 0) -and (Test-Path $rom)
  if ($ok -and $ex.NitroFS) { $ok = Test-NitroFS $rom }
  $size = if (Test-Path $rom) { (Get-Item $rom).Length } else { 0 }
  Write-Host ('{0,-6} {1,-30} exit={2} {3,5:N1}s {4} bytes' -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $ex.Dir, $code, $sw.Elapsed.TotalSeconds, $size)
  if (-not $ok) { $failed++; Write-Host ('  see ' + (Join-Path $dir 'make.log')) }
}

if ($Screenshot) {
  $env:SDL_VIDEODRIVER = 'dummy'; $env:SDL_AUDIODRIVER = 'dummy'
  $script = Join-Path $PSScriptRoot '..\tools\screenshot.py'
  $rom = Join-Path $WorkDir 'graphics_2d\bg_regular_8bit\bg_regular_8bit.nds'
  $out = Join-Path $WorkDir 'screenshot'
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'python'
  $psi.Arguments = '"' + $script + '" "' + $rom + '" --frames 300 --out "' + $out + '"'
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  if (-not $proc.WaitForExit(120000)) { & taskkill.exe /T /F /PID $proc.Id | Out-Null; throw 'screenshot timed out' }
  $json = Join-Path $out 'screenshot.json'
  if (($proc.ExitCode -ne 0) -or -not (Test-Path $json)) { $failed++; Write-Host 'FAIL   screenshot' }
  else {
    $r = Get-Content $json -Raw | ConvertFrom-Json
    if ($r.uniform.top) { $failed++; Write-Host ('FAIL   screenshot: the top screen is one colour ' + $r.top) }
    else { Write-Host ('PASS   screenshot ' + $r.top) }
  }
}

Write-Host ('Work folder: ' + $WorkDir)
if ($failed -gt 0) { Write-Host ($failed.ToString() + ' check(s) failed'); exit 1 }
Write-Host 'Smoke test passed.'
exit 0
