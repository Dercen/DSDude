# runtime/data

Binary data linked into `arm9.elf` (the Makefile's `BINDIRS := data`; BlocksDS `bin2c` makes `<name>_bin` and
`<name>_bin_size`).

## font8x8.bin: the UI layer's built-in 8x8 font

- 768 bytes: 96 glyphs for ASCII 0x20-0x7F, 8 bytes each (one byte per row, top to bottom), 1 bit per pixel with
  bit 0 the leftmost pixel. `runtime/platform/ds/src/ds_ui.c` expands it to 4bpp BG0 tiles at boot.
- Source: libnds's default console font, the `default_fontTiles` symbol of `default_font.png.o` in
  `libs/libnds/lib/libnds9.a` of BlocksDS 1.24.0, extracted unchanged with
  `arm-none-eabi-objcopy -O binary -j .rodata.default_fontTiles default_font.png.o font8x8.bin`.
  SHA-256 `8d12f62ad11d657d33398755255a1dd80f54593e65f53516d33ba6eb1dac5be4`.
- Licence: libnds is under the zlib licence (`libs/libnds/licenses/LICENSE` in BlocksDS), the same licence as the
  DSDude runtime:

  > Copyright (C) 2005-2025 the libnds authors (Michael Noland, Jason Rogers, Dave Murphy, Michael Chisholm,
  > Richard Eric M. Lope, fincs, Gericom, Adrian "asie" Siekierka, Antonio Niño Díaz, Epicpkmn11, profi200).
  >
  > This software is provided 'as-is', without any express or implied warranty. In no event will the authors be
  > held liable for any damages arising from the use of this software. Permission is granted to anyone to use this
  > software for any purpose, including commercial applications, and to alter it and redistribute it freely,
  > subject to the following restrictions: 1. The origin of this software must not be misrepresented; you must not
  > claim that you wrote the original software. If you use this software in a product, an acknowledgment in the
  > product documentation would be appreciated but is not required. 2. Altered source versions must be plainly
  > marked as such, and must not be misrepresented as being the original software. 3. This notice may not be
  > removed or altered from any source distribution.
