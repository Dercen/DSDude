/**
 * The part of pngjs 7 the tests use as a reference decoder (the package ships no types and @types/pngjs is not a
 * dependency). The pipeline itself decodes with src/image/png.ts.
 */
declare module "pngjs" {
  interface PngOptions {
    width?: number;
    height?: number;
    colorType?: number;
    bitDepth?: number;
    inputHasAlpha?: boolean;
  }
  export class PNG {
    constructor(options?: PngOptions);
    width: number;
    height: number;
    /** RGBA8 pixels. */
    data: Buffer;
    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG, options?: PngOptions): Buffer;
    };
  }
}
