/**
 * Generates fixtures/assets/tone-44k.mp3 (the MP3 effect fixture): 0.25 s, mono, 44100 Hz, 128 kbps, a 440 Hz
 * triangle wave. lamejs is only the generator, never a dependency of the pipeline (it is LGPL; the pipeline decodes
 * MP3 with the MIT @audio/decode-mp3). The fixture is committed, so this runs only to regenerate it:
 *
 *   mkdir /tmp/mp3gen && cd /tmp/mp3gen && npm init -y && npm install lamejs@1.2.1
 *   node <repo>/packages/asset-pipeline/scripts/make-mp3-fixture.cjs <repo>/fixtures/assets/tone-44k.mp3
 *
 * (run from /tmp/mp3gen so require() finds lamejs). lamejs 1.2.1's module build fails under Node ("MPEGMode is not
 * defined"), so its bundled lame.all.js is loaded as a script, which defines the global `lamejs`.
 */
const vm = require("node:vm");
const fs = require("node:fs");

// lamejs comes from the current directory's node_modules (see above); lame.all.js defines the global `lamejs`.
vm.runInThisContext(fs.readFileSync(require.resolve("lamejs/lame.all.js", { paths: [process.cwd()] }), "utf8"));

/** Source sample rate, Hz (above 22050, so the pipeline must resample). */
const RATE = 44100;
/** Length of the tone, seconds. */
const SECONDS = 0.25;
/** Tone frequency, Hz. */
const TONE_HZ = 440;
/** Peak amplitude of the triangle wave, in 16-bit sample units. */
const AMPLITUDE = 12000;
/** MP3 bit rate, kbit/s. */
const KBPS = 128;
/** Samples per MP3 frame (MPEG-1 layer III), the encoder's natural block size. */
const FRAME_SAMPLES = 1152;
/** Mono. */
const CHANNELS = 1;

/** A deterministic triangle wave (no Math.sin), -AMPLITUDE..AMPLITUDE. */
function triangle(i) {
  const period = RATE / TONE_HZ;
  const phase = (i % period) / period;
  return Math.round(AMPLITUDE * (phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase));
}

const count = Math.round(RATE * SECONDS);
const pcm = Int16Array.from({ length: count }, (_, i) => triangle(i));
const encoder = new lamejs.Mp3Encoder(CHANNELS, RATE, KBPS);
const parts = [];
for (let i = 0; i < count; i += FRAME_SAMPLES) {
  const chunk = encoder.encodeBuffer(pcm.subarray(i, i + FRAME_SAMPLES));
  if (chunk.length > 0) parts.push(Buffer.from(chunk));
}
const tail = encoder.flush();
if (tail.length > 0) parts.push(Buffer.from(tail));
const mp3 = Buffer.concat(parts);
fs.writeFileSync(process.argv[2], mp3);
console.log(`wrote ${process.argv[2]} (${mp3.length} bytes)`);
