# vendor/

Local-only binaries. Everything in this folder except this README is gitignored (`vendor/*`, `!vendor/README.md`) and `.githooks/pre-push` refuses any push whose history adds a file here. Nothing in `vendor/` ever reaches git, GitHub or the product (PLAN.md sections 2.2 and 2.11).

| Path | What | Status |
|---|---|---|
| `mwccarm/` | Metrowerks CodeWarrior ARM compilers (`1.2/`, `2.0/`) | proprietary, not redistributable, **not part of the pipeline** |
| `dsd/dsd-windows-x86_64.exe` | `dsd`, a toolkit for decompiled retail DS ROMs | reference only, **not part of the pipeline** |
| tools-pack staging | grit/mmutil/ndstool builds staged by `tools/fetch-vendor.ps1` (WS1, then WS8) | local staging |
| emulator zips | melonDS 1.1 and DeSmuME 0.9.13 archives before they are unpacked into `<DSDUDE_HOME>\emulators\` | local staging |

## Notes

- **mwccarm hangs silently without `LM_LICENSE_FILE`.** If you ever run it for a comparison, set `LM_LICENSE_FILE` to its `license.dat` first and give the process a timeout.
- **Neither mwccarm nor dsd is in the pipeline** (PLAN.md section 2.2). DSDude builds with BlocksDS 1.24.0 (GCC 16.2.0); `dsd` only handles decompiled retail ROMs.
- **Nothing from mwccarm or NitroSDK enters git, GitHub or the product** (PLAN.md section 2.11). That includes NitroSDK `.lcf.template` files, `license.dat` and any `dsd-*.exe`.
- This folder is never pushed. Check with `git log --format= --name-only origin/main -- vendor ':(exclude)vendor/README.md'`, which must print nothing.
