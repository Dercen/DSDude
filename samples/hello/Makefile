# SPDX-License-Identifier: CC0-1.0
#
# samples/hello: the DSDude toolchain smoke ROM (C14, WS1). It has the BlocksDS rom_arm9 shape, like
# runtime/Makefile, so buildRuntime() drives both the same way (bash.exe -lc 'make -jN', PLAN.md 6 WS1).
# The ELF is build/hello.elf; fixtures/runtime/hello/arm9.elf is a copy of it.

BLOCKSDS	?= /opt/wonderful/thirdparty/blocksds/core

NAME		:= hello
GAME_TITLE	:= hello
GAME_SUBTITLE	:= DSDude toolchain check
GAME_AUTHOR	:= DSDude
GAME_ICON	:= $(BLOCKSDS)/sys/icon.bmp

SOURCEDIRS	:= source
NITROFSDIR	:= nitrofs

include $(BLOCKSDS)/sys/default_makefiles/rom_arm9/Makefile
