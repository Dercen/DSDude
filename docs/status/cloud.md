# Cloud-stream registry

WS0 keeps this file current (docs/kickoff/README.md section 8). One line per cloud stream, in this form:

    - WS4: environment `dsdude-ws4`; session <url>; push target `<ref>`; started <date>; last merged <sha>

`tools/cloud/start.sh` and `tools/checkpoint.ps1` read the push target from these lines; `tools/adr-pending.ts`
greps it. A stream that reports a NEW push target records it as `Cloud push target: \`<ref>\`` under the title of
its own `docs/status/wsN.md`; WS0 then updates its line here.

## Streams

- WS2: environment `dsdude-ws2`; session https://claude.ai/code/session_01UQP5ApgJ5KffdkvUkBKc2A (opened on `main`; start.sh adopts the stream line); push target `ws2-runtime-core`; started 2026-09-25 (`start-ws2` at 57efe6c); last merged 9308b03 (2026-09-26)
- WS4: environment `dsdude-ws4`; session https://claude.ai/code/session_012JYcY9ehVdLYuqmugJcqmm (opened on `main`; start.sh adopts the stream line); push target `ws4-compiler`; started 2026-09-25 (`start-ws4` at 57efe6c); last merged 5fab99f (2026-09-26)
- WS5: environment `dsdude-ws5`; session https://claude.ai/code/session_01GkN34Fn94o6GRuzGiXK4EW (opened on `ws5-assets`); push target `ws5-assets`; started 2026-09-26 (`start-ws5`, early: all its inputs were on main and it is on the CP-B/M2 critical path); last merged -

Not yet launched: WS7 (CP-A, D+3), WS6b (CP-B, D+7, if usage limits allow).
