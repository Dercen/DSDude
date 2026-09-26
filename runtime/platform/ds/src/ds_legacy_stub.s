@ SPDX-License-Identifier: Zlib
@
@ Writable RAM stub for the legacy no$gba debug-message signature (C8, DeSmuME and hardware):
@     mov r12, r12 ; b 1f ; .hword 0x6464 ; .hword 0 ; <NUL-terminated text> ; 1: bx lr
@ The emulator prints the text that starts 4 bytes after the 0x6464 halfword. ds_log.c copies each line into
@ dsd_legacy_text and calls dsd_legacy_stub(). It lives in .data (main RAM): melonDS and DeSmuME read the text
@ through the ARM9 bus, which does not map DTCM. Adapted from WS1's samples/hello (CC0).

    .section .data.dsd_legacy_stub, "aw"
    .arm
    .balign 4

    .global dsd_legacy_stub
    .type dsd_legacy_stub, %function
dsd_legacy_stub:
    mov     r12, r12
    b       1f
    .hword  0x6464
    .hword  0

    .global dsd_legacy_text
    .type dsd_legacy_text, %object
dsd_legacy_text:
    .space  1024
    .size dsd_legacy_text, 1024

1:
    bx      lr
    .size dsd_legacy_stub, . - dsd_legacy_stub
