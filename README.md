# DSDude

A GameMaker-Studio-style IDE for Nintendo DS homebrew. Games are written in DSS (`.dss`), a GML-flavoured
language that compiles to DSDB bytecode; a C VM inside a prebuilt BlocksDS runtime runs it on the DS.

- `CLAUDE.md`: the rules every Claude Code instance follows (start here).
- `PLAN.md`: the build plan (large: read only the sections your brief cites).
- `docs/kickoff/README.md`: how the workstreams are launched; `docs/kickoff/wsN.md` per stream.
- `contracts/`: the interfaces between streams (`contracts/README.md` is the index).

Licensing: the IDE and TypeScript packages are MIT (`LICENSE`); the runtime C code is Zlib
(`runtime/LICENSE`). Nothing from `vendor/` is ever committed or pushed.

Development: Node 24, npm 11. `npm install` (never `npm ci`), then `npm run check` and `npm test`.
