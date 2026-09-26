# Cloud-stream registry

WS0 keeps this file current (docs/kickoff/README.md section 8). One line per cloud stream, in this form:

    - WS4: environment `dsdude-ws4`; session <url>; push target `<ref>`; started <date>; last merged <sha>

`tools/cloud/start.sh` and `tools/checkpoint.ps1` read the push target from these lines; `tools/adr-pending.ts`
greps it. A stream that reports a NEW push target records it as `Cloud push target: \`<ref>\`` under the title of
its own `docs/status/wsN.md`; WS0 then updates its line here.

## Streams

- WS2: environment `dsdude-ws2`; session (pending: the user sends the URL); push target `ws2-runtime-core`; started 2026-09-25 (`start-ws2` at 57efe6c); last merged -
- WS4: environment `dsdude-ws4`; session (pending: the user sends the URL); push target `ws4-compiler`; started 2026-09-25 (`start-ws4` at 57efe6c); last merged -

Not yet launched: WS5 and WS7 (CP-A, D+3), WS6b (CP-B, D+7, if usage limits allow).
