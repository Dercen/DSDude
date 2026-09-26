<#
.SYNOPSIS
  Builds vendor\tools-pack\ from the local BlocksDS install, pinned by tools\tools-pack.json (PLAN.md 6 WS1, 2.11;
  docs/research/verification.md claim 7). With -Test, also runs the clean-PATH test (spike 5).

.DESCRIPTION
  Every file in tools-pack.json is copied from its source root, and its SHA-256 must match.
  - DLLs come only from C:\msys64\opt\wonderful\bin (Wonderful's runtime-gcc-libs, the same UCRT/GCC 16 build as
    the tools), never from C:\msys64\ucrt64\bin or Git's mingw64\bin.
  - A recursive `objdump -p` import walk over the three exes must find exactly the pinned DLLs (KERNEL32 and
    api-ms-win-* are the system's), and every DLL must import api-ms-win-crt-* and not msvcrt.dll. ldd is not used.
  - The licence texts are downloaded and SHA-256-checked into vendor\tools-pack\licenses\ (-SkipLicenses to work
    offline). tools-pack.json itself is copied along.

  -Test copies the pack into a folder whose path has spaces and runs the tools with PATH=C:\Windows\System32:
  - `ndstool -V`, `grit -V` and `mmutil -V` exit 0;
  - ndstool repacks the hello fixture byte for byte (fixtures\build\hello);
  - without the DLLs, ndstool and grit exit 0xC0000135 and mmutil still runs.

  vendor\ is gitignored and never pushed. Windows PowerShell 5.1, ASCII only; every process is time-limited.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\fetch-vendor.ps1 -Test
#>
[CmdletBinding()]
param(
  [string]$Msys2 = 'C:\msys64',
  # Default <repo>\vendor\tools-pack (set below: $PSScriptRoot is empty in 5.1 parameter defaults).
  [string]$Out = '',
  [switch]$SkipLicenses,
  [switch]$Test
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Out) { $Out = Join-Path $repo 'vendor\tools-pack' }
$pinFile = Join-Path $PSScriptRoot 'tools-pack.json'
$pin = Get-Content $pinFile -Raw | ConvertFrom-Json
$source = Join-Path $Msys2 'opt\wonderful'
$objdump = Join-Path $Msys2 'ucrt64\bin\objdump.exe'
$failures = New-Object System.Collections.ArrayList

function Fail([string]$Text) { [void]$failures.Add($Text); Write-Host ('FAIL   ' + $Text) }
function Pass([string]$Text) { Write-Host ('PASS   ' + $Text) }
function Hash([string]$Path) { return (Get-FileHash $Path -Algorithm SHA256).Hash.ToLower() }

# Runs a program with a timeout and an optional PATH override; returns @{ Code; Out }.
function Invoke-Tool([string]$Exe, [string]$Arguments, [string]$Cwd, [string]$PathValue, [int]$TimeoutSec = 60) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Exe
  $psi.Arguments = $Arguments
  $psi.WorkingDirectory = $Cwd
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  if ($PathValue) { $psi.EnvironmentVariables['PATH'] = $PathValue }
  $p = [System.Diagnostics.Process]::Start($psi)
  $stdout = $p.StandardOutput.ReadToEndAsync()
  $stderr = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit($TimeoutSec * 1000)) {
    & taskkill.exe /T /F /PID $p.Id | Out-Null
    throw ($Exe + ' timed out after ' + $TimeoutSec + ' s')
  }
  $p.WaitForExit()
  return @{ Code = $p.ExitCode; Out = ($stdout.Result + $stderr.Result) }
}

function Get-Imports([string]$File) {
  $r = Invoke-Tool $objdump ('-p "' + $File + '"') $repo ((Join-Path $Msys2 'ucrt64\bin') + ';' + $env:SystemRoot + '\System32')
  if ($r.Code -ne 0) { throw ('objdump failed on ' + $File) }
  return @($r.Out -split "`r?`n" | ForEach-Object { if ($_ -match '^\s+DLL Name: (.+)$') { $Matches[1].Trim() } })
}

# 1. Copy and check the pinned files.
if (-not (Test-Path $source)) { throw ('BlocksDS is not installed at ' + $source + ': run scripts\install-toolchain.ps1') }
New-Item -ItemType Directory -Force $Out | Out-Null
foreach ($f in $pin.files) {
  $from = Join-Path $source ($f.from.Replace('/', '\'))
  $to = Join-Path $Out $f.name
  if (-not (Test-Path $from)) { Fail ($f.name + ': ' + $from + ' is missing'); continue }
  Copy-Item $from $to -Force
  $h = Hash $to
  if ($h -ne $f.sha256) { Fail ($f.name + ': SHA-256 ' + $h + ', pinned ' + $f.sha256); Remove-Item $to }
  else { Pass ($f.name + ' ' + $h.Substring(0, 12)) }
}
Copy-Item $pinFile (Join-Path $Out 'tools-pack.json') -Force

# 2. The import walk must find exactly the pinned DLLs, all on the UCRT.
if (-not (Test-Path $objdump)) { Fail ('objdump not found at ' + $objdump) }
else {
  $pinned = @($pin.files | Where-Object { $_.dll } | ForEach-Object { $_.name.ToLower() })
  $found = @{}
  $queue = New-Object System.Collections.Queue
  foreach ($exe in 'ndstool.exe', 'grit.exe', 'mmutil.exe') { $queue.Enqueue((Join-Path $Out $exe)) }
  while ($queue.Count -gt 0) {
    $file = $queue.Dequeue()
    if (-not (Test-Path $file)) { continue }
    $imports = Get-Imports $file
    if ($file.EndsWith('.dll')) {
      $crt = @($imports | Where-Object { $_ -like 'api-ms-win-crt-*' }).Count
      $msvcrt = @($imports | Where-Object { $_ -ieq 'msvcrt.dll' }).Count
      if ($crt -eq 0 -or $msvcrt -gt 0) { Fail ((Split-Path $file -Leaf) + ' is not a UCRT build (msvcrt.dll or no api-ms-win-crt-*)') }
    }
    foreach ($d in $imports) {
      $name = $d.ToLower()
      if ($name -eq 'kernel32.dll' -or $name.StartsWith('api-ms-win-') -or $found.ContainsKey($name)) { continue }
      $found[$name] = $true
      $queue.Enqueue((Join-Path $Out $d))
    }
  }
  $walked = @($found.Keys | Sort-Object)
  $expected = @($pinned | Sort-Object)
  if (($walked -join ',') -ne ($expected -join ',')) { Fail ('import walk found [' + ($walked -join ', ') + '], pinned [' + ($expected -join ', ') + ']') }
  else { Pass ('import walk: ' + ($walked -join ', ') + ' (all UCRT)') }
}

# 3. Licence texts.
if ($SkipLicenses) { Write-Host 'SKIP   licence texts (-SkipLicenses)' }
else {
  $lic = Join-Path $Out 'licenses'
  New-Item -ItemType Directory -Force $lic | Out-Null
  foreach ($l in $pin.licenses) {
    $to = Join-Path $lic $l.name
    try { Invoke-WebRequest -UseBasicParsing $l.url -OutFile $to -TimeoutSec 120 } catch { Fail ($l.name + ': download failed: ' + $_.Exception.Message); continue }
    $h = Hash $to
    if ($h -ne $l.sha256) { Fail ($l.name + ': SHA-256 ' + $h + ', pinned ' + $l.sha256); Remove-Item $to }
    else { Pass ('licence ' + $l.name) }
  }
}

# 4. Clean-PATH test from a folder with spaces.
if ($Test) {
  $clean = $env:SystemRoot + '\System32'
  $dir = Join-Path $env:TEMP ('dsdude tools pack test ' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force $dir | Out-Null
  Get-ChildItem $Out -File | Copy-Item -Destination $dir
  foreach ($t in 'ndstool', 'grit', 'mmutil') {
    $r = Invoke-Tool (Join-Path $dir ($t + '.exe')) '-V' $dir $clean
    $first = ($r.Out -split "`r?`n" | Where-Object { $_ } | Select-Object -First 1)
    if ($r.Code -eq 0 -and $first -match 'v1\.24\.0') { Pass ($t + ' -V with PATH=System32: ' + $first) }
    else { Fail ($t + ' -V with PATH=System32 exited ' + $r.Code + ': ' + $first) }
  }
  $fx = Join-Path $repo 'fixtures\build\hello'
  $rom = Join-Path $dir 'hello test.nds'
  $args7 = '-c "' + $rom + '" -9 "' + (Join-Path $repo 'fixtures\runtime\hello\arm9.elf') + '" -7 "' + (Join-Path $dir 'arm7_maxmod.elf') + '" -b "' + (Join-Path $dir 'icon.bmp') + '" "hello;DSDude;DSDude" -d "' + (Join-Path $fx 'nitrofs') + '"'
  $r = Invoke-Tool (Join-Path $dir 'ndstool.exe') $args7 $dir $clean
  $want = (Get-Content (Join-Path $fx 'packrom.json') -Raw | ConvertFrom-Json).sha256
  if ($r.Code -eq 0 -and (Test-Path $rom) -and (Hash $rom) -eq $want) { Pass 'ndstool repacks the hello fixture byte for byte (PATH=System32, spaces in the path)' }
  else { Fail ('ndstool repack: exit ' + $r.Code + ', ROM ' + $(if (Test-Path $rom) { Hash $rom } else { 'missing' }) + ', fixture ' + $want) }
  Get-ChildItem $dir -Filter '*.dll' | Remove-Item
  foreach ($t in 'ndstool', 'grit') {
    $r = Invoke-Tool (Join-Path $dir ($t + '.exe')) '-V' $dir $clean
    # 0xC0000135 (STATUS_DLL_NOT_FOUND) arrives as the signed Int32 -1073741515.
    if ($r.Code -eq -1073741515) { Pass ($t + ' without its DLLs exits 0xC0000135') }
    else { Fail ($t + ' without its DLLs exited 0x' + ('{0:X8}' -f $r.Code) + ', expected 0xC0000135') }
  }
  $r = Invoke-Tool (Join-Path $dir 'mmutil.exe') '-V' $dir $clean
  if ($r.Code -eq 0) { Pass 'mmutil runs without the DLLs (it needs none)' } else { Fail ('mmutil without the DLLs exited ' + $r.Code) }
  Remove-Item -LiteralPath $dir -Recurse -Force
}

Write-Host ('Tools pack: ' + (Resolve-Path $Out).Path)
if ($failures.Count -gt 0) { Write-Host ($failures.Count.ToString() + ' check(s) failed'); exit 1 }
Write-Host 'Tools pack OK.'
exit 0
