# SPDX-License-Identifier: Zlib
#
# runtime/Makefile: the DS build of the DSDude runtime (WS3; PLAN.md 6 WS3 and 3.3; contracts/runtime-artifact.md).
# The BlocksDS rom_arm9 shape, so buildRuntime() (C4) drives it with `bash.exe -lc 'make -jN'` from runtime/.
#
#   make -j4                  the C8 artifact: dist/arm9.elf (stripped), dist/arm9-debug.elf
#   make -j4 DSD_VM_BL=1      the M1 switch: vm.arm.c without -mlong-calls (plain BL to builtins)
#   make clean
#
# `npm run build:runtime -w runtime` runs this through buildRuntime(), then writes dist/VERSION and prints the
# .itcm/.dtcm report (runtime/src/build-runtime.ts). The ROM the default Makefile would pack is never built: games
# are packed by packRom() around dist/arm9.elf.

BLOCKSDS	?= /opt/wonderful/thirdparty/blocksds/core

# The runtime semver comes from runtime/package.json (one source; the READY line and dist/VERSION use it).
DSD_RUNTIME_VERSION := $(shell sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' package.json | head -n 1)

NAME		:= dsdude_runtime
GAME_TITLE	:= DSDude runtime
GAME_SUBTITLE	:= DSDude
GAME_AUTHOR	:= DSDude

SOURCEDIRS	:= core/src platform/ds/src
INCLUDEDIRS	:= core/include gen
# The built-in 8x8 UI font (runtime/data/*.bin, linked through bin2c). $(wildcard) keeps find quiet without it.
BINDIRS		:= $(wildcard data)

LIBS		:= -lmm9 -lnds9
# maxmod9.h and -lmm9; the default Makefile appends $(BLOCKSDS)/libs/libnds and -lc itself.
LIBDIRS		:= $(BLOCKSDS)/libs/maxmod

# ---- Flags (set before the include, which appends its own) ----------------------------------------------------
# The same language flags as runtime/Makefile.host (PLAN.md 2.4); no floats in the core.
# -ffile-prefix-map drops the worktree path from debug info, so every worktree builds the same arm9-debug.elf.
DSD_SRCROOT	:= $(shell cygpath -m "$(CURDIR)" 2>/dev/null || echo "$(CURDIR)")
CFLAGS		:= -std=c11 -fwrapv -fno-strict-aliasing -funsigned-char -Wextra \
		   -ffile-prefix-map=$(DSD_SRCROOT)/= -ffile-prefix-map=$(CURDIR)/=
DEFINES		:= -DDSD_RUNTIME_VERSION=\"$(DSD_RUNTIME_VERSION)\"

# ---- DTCM layout (PLAN.md 3.3; $(BLOCKSDS)/sys/crts/ds_arm9.ld) ------------------------------------------------
# DTCM is 16 KB at 0x02FF4000. With __dtcm_data_size > 0 the linker puts .dtcm/.sbss at the top (below the IRQ and
# SVC stacks and the 0x40 reserved bytes) and the user C stack below them, growing down: the stack can never grow
# into the VM's DTCM data, and the link fails ("DTCM data overflow") if that data outgrows its size.
#   DTCM data: the 4 KB VM register stack (512 cells, DTCM_BSS) + the dispatch table (DTCM_DATA) + slack = 4.5 KB.
#   C stack:   16384 - 0x40 - 0x100 - 0x100 - 0x1200 = 11200 bytes (~11 KB), its high-water mark in DSD|MEM.
DSD_DTCM_DATA_SIZE	?= 0x1200
LDFLAGS		:= -Wl,--defsym=__dtcm_data_size=$(DSD_DTCM_DATA_SIZE) \
		   -Wl,--defsym=__svc_stack_size=0x100 -Wl,--defsym=__irq_stack_size=0x100

include $(BLOCKSDS)/sys/default_makefiles/rom_arm9/Makefile

# libnds headers use the GNU `asm` keyword (ndstypes.h COMPILER_MEMORY_BARRIER), which strict -std=c11 rejects.
# The core never includes libnds and keeps -std=c11 (the same as the host build); only the platform layer, which
# is DS-only, compiles as gnu11 (the later -std wins).
$(BUILDDIR)/platform/%.o: CFLAGS += -std=gnu11

# ---- M1 switch: builtin calls from the dispatch loop by -mlong-calls (default) or plain BL ---------------------
# The BlocksDS *.arm.c rule compiles ARM code with -marm -mlong-calls. BL from ITCM (0x01000000) reaches main RAM,
# so DSD_VM_BL=1 drops -mlong-calls for vm.arm.c only; the M1 benchmark keeps the faster one (PLAN.md 6 WS3).
DSD_VM_BL	?= 0
ifeq ($(DSD_VM_BL),1)
$(BUILDDIR)/core/src/vm.arm.c.o : core/src/vm.arm.c
	@echo "  CC      $< (BL)"
	@$(MKDIR) -p $(@D)
	$(V)$(CC) $(CFLAGS) -MMD -MP -marm -c -o $@ $<
endif

# ---- The C8 artifact ----------------------------------------------------------------------------------------
STRIP		:= $(PREFIX)strip
DIST		:= dist

.DEFAULT_GOAL	:= runtime
.PHONY: runtime

runtime: $(DIST)/arm9.elf $(DIST)/arm9-debug.elf

$(DIST)/arm9-debug.elf: $(ELF)
	@$(MKDIR) -p $(@D)
	@echo "  CP      $@"
	$(V)cp $< $@

# Stripped of symbols and debug info; ndstool copies only the loadable segments, so the ROM bytes are the same.
$(DIST)/arm9.elf: $(ELF)
	@$(MKDIR) -p $(@D)
	@echo "  STRIP   $@"
	$(V)$(STRIP) --strip-all -o $@ $<
