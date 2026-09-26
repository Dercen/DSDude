# Cloud-stream registry

WS0 keeps this file current (docs/kickoff/README.md section 8). One line per cloud stream, in this form:

    - WS4: environment `dsdude-ws4`; session <url>; push target `<ref>`; started <date>; last merged <sha>

`tools/cloud/start.sh` and `tools/checkpoint.ps1` read the push target from these lines; `tools/adr-pending.ts`
greps it. A stream that reports a NEW push target records it as `Cloud push target: \`<ref>\`` under the title of
its own `docs/status/wsN.md`; WS0 then updates its line here.

## Streams

(none launched yet: WS2 and WS4 launch at the `phase0` tag, WS5 and WS7 at CP-A, WS6b at CP-B if usage limits allow)
