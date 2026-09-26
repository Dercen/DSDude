# Spike 1 (docs/kickoff/ws0.md task 3): prove the commit hooks, the merge exemption, pre-push and LF checkouts
# in a throwaway worktree. ASCII only. Run from the repo root: powershell -NoProfile -File tools\phase0\spike1-hooks.ps1
# Everything it creates (two worktrees, a bare repo, three branches) is removed in the finally block.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$parent = Split-Path -Parent $repo
$wt = Join-Path $parent 'DSDude-spike1'
$wtb = Join-Path $parent 'DSDude-spike1b'
$bare = Join-Path $parent 'DSDude-spike1.git'
$results = New-Object System.Collections.Generic.List[object]

function Quote([string]$a) {
  if ($a -eq '') { return '""' }
  if ($a -match '[\s"]') { return '"' + ($a -replace '"', '\"') + '"' }
  return $a
}

function Run([string]$cwd, [string]$exe, [string[]]$argv, [int]$timeoutMs = 180000) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.Arguments = ($argv | ForEach-Object { Quote $_ }) -join ' '
  $psi.WorkingDirectory = $cwd
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $o = $p.StandardOutput.ReadToEndAsync()
  $e = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit($timeoutMs)) { $p.Kill(); throw ('timeout: {0} {1}' -f $exe, $psi.Arguments) }
  $p.WaitForExit()
  return [pscustomobject]@{ Code = $p.ExitCode; Out = ($o.Result + $e.Result).Trim() }
}

function G([string[]]$argv, [string]$cwd = $wt) { return Run $cwd 'git' $argv }

function Check([string]$name, [bool]$ok, [string]$detail) {
  $results.Add([pscustomobject]@{ Step = $name; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail })
}

function Last([string]$s) { return (($s -split "`n") | Where-Object { $_.Trim() } | Select-Object -Last 1) }

function Grep([string]$s, [string]$pattern) {
  return ((($s -split "`n") | Where-Object { $_ -match $pattern } | Select-Object -First 2) -join ' / ')
}

function Trailer() { return (G @('log', '-1', '--format=%(trailers:key=DSDude-WS)')).Out }

function WriteBytes([string]$rel, [string]$text) {
  $f = Join-Path $wt $rel
  New-Item -ItemType Directory -Force (Split-Path -Parent $f) | Out-Null
  [System.IO.File]::WriteAllBytes($f, [System.Text.Encoding]::ASCII.GetBytes($text))
}

function ReplaceInLock([string]$from, [string]$to) {
  $f = Join-Path $wt 'package-lock.json'
  $t = [System.IO.File]::ReadAllText($f)
  $i = $t.IndexOf($from)
  if ($i -lt 0) { throw "not in lockfile: $from" }
  [System.IO.File]::WriteAllText($f, $t.Substring(0, $i) + $to + $t.Substring($i + $from.Length))
}

function RemoveJunction([string]$path) {
  if (Test-Path $path) { cmd /c rmdir "$path" | Out-Null }   # removes the link only, never the target
}

try {
  foreach ($p in @($wt, $wtb, $bare)) { if (Test-Path $p) { throw "$p already exists: remove it first" } }
  $r = G @('worktree', 'add', $wt, '-b', 'spike1-tmp', 'main') $repo
  if ($r.Code) { throw $r.Out }
  # pre-commit needs node_modules/.bin/biome: link the main worktree's node_modules (junction, removed in finally)
  cmd /c mklink /J (Join-Path $wt 'node_modules') (Join-Path $repo 'node_modules') | Out-Null
  G @('config', '--worktree', 'dsdude.ws', 'WS1') | Out-Null
  $base = (G @('rev-parse', 'HEAD')).Out

  # 1. a WS1 path passes and gets the trailer
  WriteBytes 'packages/toolchain/src/spike.ts' "export const spike = 1;`n"
  G @('add', 'packages/toolchain/src/spike.ts') | Out-Null
  $r = G @('commit', '-m', 'spike: WS1 path')
  $t = Trailer
  Check '1 WS1 commits packages/toolchain/src/spike.ts' (($r.Code -eq 0) -and ($t -eq 'DSDude-WS: WS1')) ("exit {0}; {1}" -f $r.Code, $t)

  # 2. a foreign path is rejected by pre-commit
  WriteBytes 'runtime/core/spike.c' "int spike;`n"
  G @('add', 'runtime/core/spike.c') | Out-Null
  $r = G @('commit', '-m', 'spike: foreign path')
  Check '2 WS1 commits runtime/core/spike.c' ($r.Code -ne 0) ("exit {0}: {1}" -f $r.Code, (Last $r.Out))
  G @('rm', '--cached', '-q', 'runtime/core/spike.c') | Out-Null
  Remove-Item (Join-Path $wt 'runtime/core/spike.c')

  # 3. a CRLF Makefile in a WS1 path passes and is stored LF
  WriteBytes 'samples/hello/Makefile' "all:`r`n`t@echo hello`r`n"
  G @('add', 'samples/hello/Makefile') | Out-Null
  $r = G @('commit', '-m', 'spike: CRLF Makefile')
  $eol = (G @('ls-files', '--eol', 'samples/hello/Makefile')).Out
  Check '3 WS1 commits samples/hello/Makefile with CRLF bytes' (($r.Code -eq 0) -and ($eol -match '^i/lf')) ("exit {0}; {1}" -f $r.Code, $eol)

  # 4. lockfile: WS0 'wip' rejected, WS0 'chore(deps): regenerate lockfile' passes
  G @('config', '--worktree', 'dsdude.ws', 'WS0') | Out-Null
  ReplaceInLock '"name": "dsdude",' '"name": "dsdude-spike",'
  G @('add', 'package-lock.json') | Out-Null
  $r = G @('commit', '-m', 'wip')
  Check '4a WS0 commits package-lock.json as wip' ($r.Code -ne 0) ("exit {0}: {1}" -f $r.Code, (Last $r.Out))
  $r = G @('commit', '-m', 'chore(deps): regenerate lockfile')
  Check '4b WS0 commits it as chore(deps): regenerate lockfile' ($r.Code -eq 0) ("exit {0}" -f $r.Code)

  # 5. merges bringing a lockfile change and a foreign path pass, without and with a conflict
  G @('config', '--worktree', 'dsdude.ws', 'WS0') | Out-Null
  G @('switch', '-q', '-c', 'spike1-side', $base) | Out-Null
  $lock = Join-Path $wt 'package-lock.json'
  [System.IO.File]::AppendAllText($lock, "`n")
  WriteBytes 'runtime/core/merge1.c' "int merge1;`n"
  G @('add', 'package-lock.json', 'runtime/core/merge1.c') | Out-Null
  $r = G @('commit', '-m', 'chore(deps): regenerate lockfile')
  if ($r.Code) { throw "side commit failed: $($r.Out)" }
  G @('switch', '-q', '-c', 'spike1-side2', $base) | Out-Null
  ReplaceInLock '"name": "dsdude",' '"name": "dsdude-other",'
  WriteBytes 'runtime/core/merge2.c' "int merge2;`n"
  G @('add', 'package-lock.json', 'runtime/core/merge2.c') | Out-Null
  $r = G @('commit', '-m', 'chore(deps): regenerate lockfile')
  if ($r.Code) { throw "side2 commit failed: $($r.Out)" }
  G @('switch', '-q', 'spike1-tmp') | Out-Null
  G @('config', '--worktree', 'dsdude.ws', 'WS1') | Out-Null
  $r = G @('merge', '--no-ff', '-m', 'Merge spike1-side', 'spike1-side')
  Check '5a WS1 merges lockfile + foreign path, no conflict' ($r.Code -eq 0) ("exit {0}" -f $r.Code)
  $r = G @('merge', '--no-ff', '-m', 'Merge spike1-side2', 'spike1-side2')
  $conflicted = $r.Code -ne 0
  G @('checkout', '--theirs', 'package-lock.json') | Out-Null
  G @('add', 'package-lock.json') | Out-Null
  $r = G @('commit', '--no-edit')
  $t = Trailer
  Check '5b WS1 merges it with a conflict (resolved)' ($conflicted -and ($r.Code -eq 0) -and ($t -eq 'DSDude-WS: WS1')) ("conflict {0}; commit exit {1}; {2}" -f $conflicted, $r.Code, $t)

  # 6. pre-push refuses vendor/ anywhere in the pushed history
  $r = G @('init', '--bare', '-q', $bare) $parent
  $r = G @('push', $bare, 'main:refs/heads/clean')
  Check '6a push of clean main to a scratch bare repo' ($r.Code -eq 0) ("exit {0}" -f $r.Code)
  WriteBytes 'vendor/probe.txt' "probe`n"
  G @('add', '-f', 'vendor/probe.txt') | Out-Null
  $r = G @('commit', '--no-verify', '-m', 'spike: vendor probe (the one --no-verify)')
  $r = G @('push', $bare, 'HEAD:refs/heads/probe')
  Check '6b push with vendor/probe.txt committed' ($r.Code -ne 0) ("exit {0}: {1}" -f $r.Code, (Grep $r.Out 'pre-push|vendor'))
  G @('config', '--worktree', 'dsdude.ws', 'WS0') | Out-Null
  G @('rm', '--cached', '-q', 'vendor/probe.txt') | Out-Null
  $r = G @('commit', '-m', 'spike: untrack vendor probe')
  G @('config', '--worktree', 'dsdude.ws', 'WS1') | Out-Null
  $r = G @('push', $bare, 'HEAD:refs/heads/probe')
  Check '6c push after untracking it again' ($r.Code -ne 0) ("exit {0}: {1}" -f $r.Code, (Grep $r.Out 'pre-push|vendor'))

  # 7. a second (detached) worktree checks out Makefiles and hooks with LF
  $r = G @('worktree', 'add', '--detach', $wtb, 'spike1-tmp') $repo
  $eol = (G @('ls-files', '--eol', 'samples/hello/Makefile', '.githooks/pre-commit', '.githooks/commit-msg', '.githooks/pre-push') $wtb).Out
  $crlf = @('samples/hello/Makefile', '.githooks/pre-commit', '.githooks/commit-msg', '.githooks/pre-push') |
    Where-Object { ([System.IO.File]::ReadAllBytes((Join-Path $wtb $_)) -contains 13) }
  Check '7 fresh worktree: Makefile and hooks are LF (index and bytes)' ((-not $crlf) -and -not ($eol -match 'w/crlf')) (($eol -split "`n" | ForEach-Object { ($_ -split '\s+')[0..1] -join ' ' }) -join '; ')
}
finally {
  RemoveJunction (Join-Path $wt 'node_modules')
  foreach ($p in @($wtb, $wt)) {
    if (Test-Path $p) { Run $repo 'git' @('worktree', 'remove', '--force', $p) | Out-Null }
  }
  Run $repo 'git' @('worktree', 'prune') | Out-Null
  if (Test-Path $bare) { Remove-Item -Recurse -Force $bare }
  foreach ($b in @('spike1-tmp', 'spike1-side', 'spike1-side2')) { Run $repo 'git' @('branch', '-D', $b) | Out-Null }
  $results | Format-Table -AutoSize -Wrap | Out-String -Width 200 | Write-Host
  $left = @($wt, $wtb, $bare) | Where-Object { Test-Path $_ }
  $branches = (Run $repo 'git' @('branch', '--list', 'spike1-*')).Out
  Write-Host ('cleanup: leftover paths [{0}], leftover branches [{1}]' -f ($left -join ', '), $branches)
}
if ($results | Where-Object { $_.Result -ne 'PASS' }) { exit 1 }
exit 0
