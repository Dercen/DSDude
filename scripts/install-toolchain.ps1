<#
.SYNOPSIS
  Installs BlocksDS 1.24.0 through the Wonderful toolchain tarball into C:\msys64\opt\wonderful (PLAN.md 2.1, 7.1),
  then melonDS 1.1, DeSmuME 0.9.13 and py-desmume 0.0.9 for DSDude development.

.DESCRIPTION
  No UAC prompt and no change to the user's MSYS2 packages: only C:\msys64\opt\wonderful, C:\msys64\tmp,
  <DSDUDE_HOME>\emulators and the Python user site are written. Every step is exit-code checked and time-limited
  (30 min for the blocksds-toolchain download). Safe to re-run: finished steps are skipped.

  If a wf-pacman step times out or is interrupted, its lock C:\msys64\opt\wonderful\pacman\db\db.lck stays behind.
  Do not delete it while any wf-pacman process runs; ask before retrying.

  Windows PowerShell 5.1. ASCII only. Inner bash strings use single quotes only.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-toolchain.ps1
  powershell -ExecutionPolicy Bypass -File scripts\install-toolchain.ps1 -SkipEmulators -SkipPython
#>
[CmdletBinding()]
param(
  [string]$Msys2 = 'C:\msys64',
  # Where the emulators go; default <DSDUDE_HOME>\emulators, else %LOCALAPPDATA%\DSDude\emulators.
  [string]$DsdudeHome = $(if ($env:DSDUDE_HOME) { $env:DSDUDE_HOME } else { Join-Path $env:LOCALAPPDATA 'DSDude' }),
  [string]$DesmumeSource = (Join-Path $env:USERPROFILE 'Downloads\desmume-0.9.13-win64'),
  [string]$LogFile = (Join-Path $env:TEMP 'dsdude-install-toolchain.log'),
  [switch]$SkipEmulators,
  [switch]$SkipPython
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Windows PowerShell 5.1's progress bar slows downloads badly

$BootstrapUrl = 'https://wonderful.asie.pl/bootstrap/wf-bootstrap-windows-x86_64.tar.gz'
$MelonUrl = 'https://github.com/melonDS-emu/melonDS/releases/download/1.1/melonDS-1.1-windows-x86_64.zip'
$MelonSha256 = '9F3F8A244103BE20B5B657AF5B0ED1B2A66BB20A7181476A6D294C9A53D4F8C8'
$ExpectBlocksds = 'v1.24.0'
$ExpectGcc = '16.2.0'

$Bash = Join-Path $Msys2 'usr\bin\bash.exe'
$Wonderful = Join-Path $Msys2 'opt\wonderful'
$WfPacman = Join-Path $Wonderful 'bin\wf-pacman.exe'
$WfConfig = Join-Path $Wonderful 'bin\wf-config'
$Core = Join-Path $Wonderful 'thirdparty\blocksds\core'
$Ndstool = Join-Path $Core 'tools\ndstool\ndstool.exe'
$Gcc = Join-Path $Wonderful 'toolchain\gcc-arm-none-eabi\bin\arm-none-eabi-gcc.exe'
$DbLock = Join-Path $Wonderful 'pacman\db\db.lck'

function Write-Log([string]$Text) {
  $line = '[' + (Get-Date -Format 'HH:mm:ss') + '] ' + $Text
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding ascii
}

function ConvertTo-PosixPath([string]$Path) {
  $full = [IO.Path]::GetFullPath($Path)
  return '/' + $full.Substring(0, 1).ToLower() + $full.Substring(2).Replace('\', '/')
}

# The Wonderful environment of wonderful_shell.cmd (PLAN.md 6 WS1), applied to child processes of this script.
$env:MSYSTEM = 'UCRT64'; $env:MSYS2_PATH_TYPE = 'inherit'; $env:CHERE_INVOKING = '1'
$env:BLOCKSDS = '/opt/wonderful/thirdparty/blocksds/core'
$env:BLOCKSDSEXT = '/opt/wonderful/thirdparty/blocksds/external'
$env:WONDERFUL_TOOLCHAIN = '/opt/wonderful'
$wfBin = Join-Path $Wonderful 'bin'
$env:PATH = $wfBin + ';' + ((($env:PATH -split ';') | Where-Object { $_ -and ($_ -ne $wfBin) }) -join ';')
Remove-Item Env:SHLVL -ErrorAction SilentlyContinue   # as under Electron; CHERE_INVOKING keeps the cwd

# Runs a native program with a timeout; returns its exit code. On timeout the process tree is killed and it throws.
function Invoke-Native([string]$Exe, [string]$Arguments, [int]$TimeoutMin, [string]$Name) {
  Write-Log ("STEP " + $Name + " (timeout " + $TimeoutMin + " min)")
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Exe
  $psi.Arguments = $Arguments
  $psi.UseShellExecute = $false
  $psi.WorkingDirectory = (Get-Location).Path
  $proc = [System.Diagnostics.Process]::Start($psi)
  if (-not $proc.WaitForExit($TimeoutMin * 60000)) {
    & taskkill.exe /T /F /PID $proc.Id | Out-Null
    throw ($Name + ' timed out after ' + $TimeoutMin + ' min. If it was wf-pacman, ' + $DbLock + ' may be left behind: stop and check before retrying.')
  }
  $proc.WaitForExit()
  Write-Log ("END " + $Name + " exit=" + $proc.ExitCode)
  return $proc.ExitCode
}

# bash -lc '<cmd>' with output teed into the log. <cmd> must not contain double quotes.
function Invoke-Bash([string]$Command, [int]$TimeoutMin, [string]$Name) {
  if ($Command.Contains('"')) { throw 'Invoke-Bash: no double quotes inside bash commands' }
  $log = ConvertTo-PosixPath $LogFile
  $wrapped = '{ ' + $Command + '; } 2>&1 | tee -a ' + "'" + $log + "'" + '; exit ${PIPESTATUS[0]}'
  return Invoke-Native $Bash ('-lc "' + $wrapped + '"') $TimeoutMin $Name
}

function Assert-Exit([int]$Code, [string]$What) { if ($Code -ne 0) { throw ($What + ' failed with exit code ' + $Code + '; see ' + $LogFile) } }

Set-Content -Path $LogFile -Value ('install-toolchain.ps1 started ' + (Get-Date -Format o)) -Encoding ascii
if (-not (Test-Path $Bash)) { throw ('MSYS2 not found: ' + $Bash + ' is missing') }
if ((Test-Path $DbLock) -and (Get-Process wf-pacman -ErrorAction SilentlyContinue)) { throw 'wf-pacman is already running' }
if (Test-Path $DbLock) { throw ('Stale wf-pacman lock ' + $DbLock + ': an earlier run was interrupted. Check that no wf-pacman runs, delete the lock, then re-run.') }

# 1. Bootstrap: only when wf-pacman is absent (re-extracting would downgrade an installed wf-pacman).
if (-not (Test-Path $WfPacman)) {
  New-Item -ItemType Directory -Force (Join-Path $Msys2 'tmp') | Out-Null
  $tarball = Join-Path $Msys2 'tmp\wf-bootstrap.tar.gz'
  Write-Log ('Downloading ' + $BootstrapUrl)
  Invoke-WebRequest -UseBasicParsing $BootstrapUrl -OutFile $tarball -TimeoutSec 600
  Assert-Exit (Invoke-Bash 'mkdir -p /opt/wonderful && tar -xzf /tmp/wf-bootstrap.tar.gz -C /opt/wonderful' 5 'extract bootstrap') 'extract'
} else { Write-Log 'wf-pacman present: bootstrap skipped' }

# 2. wf-tools. Run 1 only upgrades wf-pacman itself and exits 0 (verification.md claim 1), so loop until wf-config exists.
for ($i = 1; ($i -le 3) -and -not (Test-Path $WfConfig); $i++) {
  Assert-Exit (Invoke-Bash 'wf-pacman -Syu --noconfirm wf-tools' 10 ('wf-tools run ' + $i)) ('wf-pacman run ' + $i)
}
if (-not (Test-Path $WfConfig)) { throw 'wf-tools not installed after 3 wf-pacman runs' }

# 3. BlocksDS.
if (-not (Test-Path $Ndstool)) {
  Assert-Exit (Invoke-Bash 'wf-config repo enable blocksds' 3 'repo enable blocksds') 'wf-config repo enable'
  Assert-Exit (Invoke-Bash 'wf-pacman -Syu --noconfirm' 15 'wf-pacman -Syu') 'wf-pacman -Syu'
  Assert-Exit (Invoke-Bash 'wf-pacman -S --noconfirm --needed blocksds-toolchain blocksds-docs' 30 'install blocksds-toolchain') 'blocksds-toolchain install'
} else { Write-Log 'ndstool present: BlocksDS install skipped' }
if (-not ((Test-Path $WfConfig) -and (Test-Path $Ndstool))) { throw 'BlocksDS not installed: wf-config or ndstool.exe missing' }

# 4. Versions: GCC 16.2.0 and tools at v1.24.0.
$gccVersion = (& $Gcc --version | Select-Object -First 1)
Write-Log ('gcc: ' + $gccVersion)
if ($gccVersion -notmatch [regex]::Escape($ExpectGcc)) { throw ('Expected arm-none-eabi-gcc ' + $ExpectGcc) }
foreach ($tool in 'ndstool', 'grit', 'mmutil') {
  $exe = Join-Path $Core ('tools\' + $tool + '\' + $tool + '.exe')
  $ErrorActionPreference = 'Continue'   # 5.1 turns native stderr into ErrorRecords under 2>&1
  $v = (& $exe -V 2>&1 | Select-Object -First 1) -as [string]
  $ErrorActionPreference = 'Stop'
  Write-Log ($tool + ': ' + $v)
  if ($v -notmatch [regex]::Escape($ExpectBlocksds)) { throw ('Expected ' + $tool + ' ' + $ExpectBlocksds) }
}

# 5. Emulators under <DSDUDE_HOME>\emulators (each worktree keeps its own configs).
if (-not $SkipEmulators) {
  $emu = Join-Path $DsdudeHome 'emulators'
  $melonDir = Join-Path $emu 'melonDS-1.1'
  if (-not (Test-Path (Join-Path $melonDir 'melonDS.exe'))) {
    $zip = Join-Path $env:TEMP 'melonDS-1.1-windows-x86_64.zip'
    Write-Log ('Downloading ' + $MelonUrl)
    Invoke-WebRequest -UseBasicParsing $MelonUrl -OutFile $zip -TimeoutSec 600
    $hash = (Get-FileHash $zip -Algorithm SHA256).Hash
    if ($hash -ne $MelonSha256) { Remove-Item $zip; throw ('melonDS hash mismatch: ' + $hash) }
    New-Item -ItemType Directory -Force $melonDir | Out-Null
    Expand-Archive $zip $melonDir -Force
  }
  Write-Log ('melonDS: ' + (Join-Path $melonDir 'melonDS.exe'))
  $desDir = Join-Path $emu 'desmume-0.9.13'
  $desExe = Join-Path $desDir 'DeSmuME_0.9.13_x64.exe'
  if (-not (Test-Path $desExe)) {
    $src = Join-Path $DesmumeSource 'DeSmuME_0.9.13_x64.exe'
    if (Test-Path $src) {
      New-Item -ItemType Directory -Force $desDir | Out-Null
      Copy-Item $src $desDir
    } else { Write-Log ('DeSmuME not found at ' + $src + ': skipped (optional profile)') }
  }
  if (Test-Path $desExe) { Write-Log ('DeSmuME: ' + $desExe) }
}

# 6. py-desmume 0.0.9 into the Python user site (headless screenshots).
if (-not $SkipPython) {
  $py = (Get-Command python -ErrorAction SilentlyContinue)
  if (-not $py) { throw 'python not on PATH (expected the Microsoft Store CPython 3.13)' }
  Assert-Exit (Invoke-Native $py.Source '-m pip install --user --disable-pip-version-check py-desmume==0.0.9' 10 'pip install py-desmume') 'py-desmume install'
}

Write-Log 'Toolchain installed.'
exit 0
