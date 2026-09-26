/**
 * Reading what mmutil wrote (C3 section 5): the ids in `soundbank.h`, and the entry sizes in `soundbank.bin` that
 * give each sound's RAM bytes. Also the tracker-module checks and the estimates used when mmutil did not run.
 * Pure TypeScript.
 *
 * soundbank.bin (maxmod "MSL") layout, as read here: u16 sample count, u16 song count, the 8 bytes "*maxmod*", then
 * one u32 file offset per sample and per song. Each entry starts with an 8-byte prefix {u32 size; u8 type;
 * u8 version; u16 reserved} followed by `size` bytes, which is what maxmod mallocs when it loads the entry. A song
 * (MAS) begins with {order, instrument, sample, pattern counts; ...} and, 276 bytes in, the offset tables of its
 * instruments, samples and patterns; each sample record holds the `msl_id` of the bank sample it uses at byte 10.
 * WS0 checks these figures against a real soundbank at integration; any mismatch here falls back to estimates.
 */

/** Everything mmutil defines in soundbank.h, name -> value (SFX_*, MOD_*, MSL_NSAMPS, ...). */
export function parseSoundbankHeader(text: string): Map<string, number> {
  const defines = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*#define\s+(\w+)\s+(\d+)\s*$/.exec(line);
    if (m !== null) defines.set(m[1] as string, Number(m[2]));
  }
  return defines;
}

/** The soundbank.h define of an effect or a music module (the name upper-cased; C1 names need no other change). */
export function soundDefine(name: string, kind: "effect" | "music"): string {
  return `${kind === "effect" ? "SFX" : "MOD"}_${name.toUpperCase()}`;
}

/** Entry sizes read from a soundbank. */
export interface SoundbankSizes {
  /** Payload bytes of each bank sample, by sample id. */
  samples: number[];
  /** Payload bytes of each song, by song id, plus the bank sample ids the song uses. */
  songs: { bytes: number; sampleIds: number[] }[];
}

/** Bytes before the offset tables: two u16 counts and the 8-byte "*maxmod*" tag. */
const MSL_HEADER_BYTES = 12;
/** The signature at byte 4 of soundbank.bin. */
const MSL_TAG = "*maxmod*";
/** Bytes of each entry's prefix {u32 size; u8 type; u8 version; u16 reserved}. */
const MAS_PREFIX_BYTES = 8;
/** MAS song header bytes before its offset tables (12 fields + 32 volumes + 32 pans + 200 orders). */
const MAS_SONG_HEADER_BYTES = 276;
/** Where the instrument and sample counts sit in the MAS song header. */
const MAS_INSTRUMENT_COUNT = 1;
const MAS_SAMPLE_COUNT = 2;
/** Byte offset of msl_id in a MAS sample record; 0xFFFF means the sample is embedded in the song. */
const MAS_SAMPLE_MSL_ID = 10;
const MSL_ID_EMBEDDED = 0xffff;
/** Bytes per offset-table entry. */
const U32_BYTES = 4;

/**
 * Reads the entry sizes of a soundbank.bin, or returns null when the bytes do not look like one (the caller then
 * uses estimates).
 */
export function parseSoundbank(bytes: Uint8Array): SoundbankSizes | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const inRange = (at: number, n: number): boolean => at >= 0 && at + n <= bytes.length;
  if (!inRange(0, MSL_HEADER_BYTES)) return null;
  const tag = String.fromCharCode(...bytes.subarray(U32_BYTES, MSL_HEADER_BYTES));
  if (tag !== MSL_TAG) return null;
  const sampleCount = view.getUint16(0, true);
  const songCount = view.getUint16(2, true);
  if (!inRange(MSL_HEADER_BYTES, (sampleCount + songCount) * U32_BYTES)) return null;
  const entry = (tableIndex: number): { at: number; size: number } | null => {
    const offset = view.getUint32(MSL_HEADER_BYTES + tableIndex * U32_BYTES, true);
    if (!inRange(offset, MAS_PREFIX_BYTES)) return null;
    const size = view.getUint32(offset, true);
    return inRange(offset + MAS_PREFIX_BYTES, size) ? { at: offset + MAS_PREFIX_BYTES, size } : null;
  };
  const samples: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const e = entry(i);
    if (e === null) return null;
    samples.push(e.size);
  }
  const songs: SoundbankSizes["songs"] = [];
  for (let i = 0; i < songCount; i++) {
    const e = entry(sampleCount + i);
    if (e === null || e.size < MAS_SONG_HEADER_BYTES) return null;
    const instruments = bytes[e.at + MAS_INSTRUMENT_COUNT] as number;
    const songSamples = bytes[e.at + MAS_SAMPLE_COUNT] as number;
    const sampleTable = e.at + MAS_SONG_HEADER_BYTES + instruments * U32_BYTES;
    if (!inRange(sampleTable, songSamples * U32_BYTES)) return null;
    const ids = new Set<number>();
    for (let s = 0; s < songSamples; s++) {
      const record = e.at + view.getUint32(sampleTable + s * U32_BYTES, true);
      if (!inRange(record, MAS_SAMPLE_MSL_ID + 2)) return null;
      const id = view.getUint16(record + MAS_SAMPLE_MSL_ID, true);
      if (id === MSL_ID_EMBEDDED) continue;
      if (id >= sampleCount) return null;
      ids.add(id);
    }
    songs.push({ bytes: e.size, sampleIds: [...ids].sort((a, b) => a - b) });
  }
  return { samples, songs };
}

/** RAM of a loaded effect: its bank sample's payload. */
export function effectRamBytes(sizes: SoundbankSizes, id: number): number | null {
  return sizes.samples[id] ?? null;
}

/** RAM of a loaded song: its payload plus every bank sample it uses. */
export function musicRamBytes(sizes: SoundbankSizes, id: number): number | null {
  const song = sizes.songs[id];
  if (song === undefined) return null;
  return song.sampleIds.reduce((sum, s) => sum + (sizes.samples[s] ?? 0), song.bytes);
}

/** Bytes of a MAS sample header ahead of the PCM data (loop start, loop length, format, repeat, rate). */
const MAS_SAMPLE_HEADER_BYTES = 12;
/** maxmod keeps sample data word-aligned. */
const MAS_DATA_ALIGN = 4;
/** Bytes per 16-bit sample. */
const PCM16_BYTES = 2;

/** Estimated RAM of an effect before mmutil ran: sample header plus 16-bit data, word-aligned. */
export function estimateEffectRam(samples: number): number {
  const data = samples * PCM16_BYTES;
  return MAS_SAMPLE_HEADER_BYTES + Math.ceil(data / MAS_DATA_ALIGN) * MAS_DATA_ALIGN;
}

/** Estimated RAM of a music module before mmutil ran: the module file's size (its patterns and samples). */
export function estimateMusicRam(fileBytes: number): number {
  return fileBytes;
}

// ---------------------------------------------------------------------------------------------------------
// Tracker modules (music): passed through unchanged, but checked so garbage is E409 rather than an mmutil error

/** Tracker extensions the DS plays (C1). */
export const MUSIC_EXTENSIONS = [".xm", ".mod", ".it", ".s3m"] as const;

/** Where each format's signature sits. */
const XM_TAG = "Extended Module: ";
const IT_TAG = "IMPM";
const S3M_TAG = "SCRM";
const S3M_TAG_OFFSET = 44;
/** A MOD's 4-character format tag (M.K., 8CHN, ...) sits after 31 sample records and the order table. */
const MOD_TAG_OFFSET = 1080;
const MOD_TAG_BYTES = 4;
/** Printable ASCII bounds for the MOD tag. */
const ASCII_PRINTABLE_MIN = 0x20;
const ASCII_PRINTABLE_MAX = 0x7e;

function asciiAt(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

/** True when `bytes` look like a module of the extension's format. */
export function isTrackerModule(bytes: Uint8Array, extension: string): boolean {
  switch (extension) {
    case ".xm":
      return asciiAt(bytes, 0, XM_TAG.length) === XM_TAG;
    case ".it":
      return asciiAt(bytes, 0, IT_TAG.length) === IT_TAG;
    case ".s3m":
      return asciiAt(bytes, S3M_TAG_OFFSET, S3M_TAG.length) === S3M_TAG;
    case ".mod": {
      if (bytes.length < MOD_TAG_OFFSET + MOD_TAG_BYTES) return false;
      const tag = bytes.subarray(MOD_TAG_OFFSET, MOD_TAG_OFFSET + MOD_TAG_BYTES);
      return tag.every((b) => b >= ASCII_PRINTABLE_MIN && b <= ASCII_PRINTABLE_MAX);
    }
    default:
      return false;
  }
}
