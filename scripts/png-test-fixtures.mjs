import { deflateSync } from "node:zlib";
import {
  createPngChunk,
  pngSignatureBytes
} from "./png-evidence.mjs";

export function createRgbaPngFixture(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowLength = 1 + width * 4;
  const raw = Buffer.alloc(rowLength * height);
  for (let offset = 0; offset < raw.length; offset += rowLength) {
    raw[offset] = 0;
  }

  return Buffer.concat([
    pngSignatureBytes(),
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", deflateSync(raw)),
    createPngChunk("IEND")
  ]);
}
