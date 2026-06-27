import { inflateSync } from "node:zlib";

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const defaultMaxPngPixels = 50_000_000;
const defaultMaxInflatedBytes = 256_000_000;

export function isPngSignature(content) {
  return Buffer.isBuffer(content) && content.length >= pngSignature.length && content.subarray(0, pngSignature.length).equals(pngSignature);
}

export function readPngEvidence(
  content,
  { validateImageData = true, maxPixels = defaultMaxPngPixels, maxInflatedBytes = defaultMaxInflatedBytes } = {}
) {
  if (!isPngSignature(content)) {
    return invalidPng("missing PNG signature");
  }

  let offset = pngSignature.length;
  let chunkIndex = 0;
  let ihdr = null;
  let seenIdat = false;
  let seenIend = false;
  const idatChunks = [];

  while (offset < content.length) {
    if (offset + 12 > content.length) {
      return invalidPng("truncated PNG chunk header");
    }

    const length = content.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (dataEnd < dataStart || crcEnd > content.length) {
      return invalidPng("truncated PNG chunk data");
    }

    const type = content.toString("ascii", typeStart, dataStart);
    if (!/^[A-Za-z]{4}$/.test(type)) {
      return invalidPng("invalid PNG chunk type");
    }
    const storedCrc = content.readUInt32BE(dataEnd);
    const actualCrc = pngCrc32(content.subarray(typeStart, dataEnd));
    if (storedCrc !== actualCrc) {
      return invalidPng(`CRC mismatch in ${type} chunk`);
    }

    if (chunkIndex === 0 && type !== "IHDR") {
      return invalidPng("PNG first chunk is not IHDR");
    }

    if (type === "IHDR") {
      if (ihdr) {
        return invalidPng("duplicate IHDR chunk");
      }
      if (length !== 13) {
        return invalidPng("invalid IHDR length");
      }
      ihdr = readIhdr(content, dataStart);
      const ihdrFailure = validateIhdr(ihdr, maxPixels);
      if (ihdrFailure) {
        return invalidPng(ihdrFailure);
      }
    } else if (type === "IDAT") {
      if (!ihdr) {
        return invalidPng("IDAT chunk appears before IHDR");
      }
      if (seenIend) {
        return invalidPng("IDAT chunk appears after IEND");
      }
      seenIdat = true;
      idatChunks.push(content.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      if (length !== 0) {
        return invalidPng("invalid IEND length");
      }
      if (!seenIdat) {
        return invalidPng("PNG has no IDAT chunk");
      }
      seenIend = true;
      offset = crcEnd;
      if (offset !== content.length) {
        return invalidPng("trailing data after IEND");
      }
      break;
    }

    offset = crcEnd;
    chunkIndex += 1;
  }

  if (!ihdr) {
    return invalidPng("missing IHDR chunk");
  }
  if (!seenIend) {
    return invalidPng("missing IEND chunk");
  }

  if (validateImageData) {
    const dataFailure = validatePngImageData(ihdr, idatChunks, maxInflatedBytes);
    if (dataFailure) {
      return invalidPng(dataFailure);
    }
  }

  return {
    valid: true,
    width: ihdr.width,
    height: ihdr.height,
    bitDepth: ihdr.bitDepth,
    colorType: ihdr.colorType
  };
}

export function pngCrc32(content) {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createPngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

export function pngSignatureBytes() {
  return Buffer.from(pngSignature);
}

function readIhdr(content, dataStart) {
  return {
    width: content.readUInt32BE(dataStart),
    height: content.readUInt32BE(dataStart + 4),
    bitDepth: content[dataStart + 8],
    colorType: content[dataStart + 9],
    compression: content[dataStart + 10],
    filter: content[dataStart + 11],
    interlace: content[dataStart + 12]
  };
}

function validateIhdr(ihdr, maxPixels) {
  if (!Number.isFinite(ihdr.width) || !Number.isFinite(ihdr.height) || ihdr.width <= 0 || ihdr.height <= 0) {
    return "invalid PNG dimensions";
  }
  if (ihdr.width * ihdr.height > maxPixels) {
    return `PNG dimensions exceed ${maxPixels} pixels`;
  }
  if (ihdr.compression !== 0 || ihdr.filter !== 0) {
    return "unsupported PNG compression or filter method";
  }
  if (ihdr.interlace !== 0) {
    return "interlaced PNG evidence is unsupported";
  }
  if (!supportedBitDepthsByColorType[ihdr.colorType]?.has(ihdr.bitDepth)) {
    return "unsupported PNG color type or bit depth";
  }
  return "";
}

function validatePngImageData(ihdr, idatChunks, maxInflatedBytes) {
  const expectedBytes = pngScanlineByteLength(ihdr) * ihdr.height;
  if (expectedBytes > maxInflatedBytes) {
    return `PNG IDAT data would inflate to ${expectedBytes} bytes, above the ${maxInflatedBytes} byte evidence limit`;
  }

  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idatChunks));
  } catch {
    return "PNG IDAT data cannot be inflated";
  }

  if (inflated.length !== expectedBytes) {
    return `PNG IDAT data length ${inflated.length} does not match expected ${expectedBytes}`;
  }
  const scanlineLength = pngScanlineByteLength(ihdr);
  for (let offset = 0; offset < inflated.length; offset += scanlineLength) {
    if (inflated[offset] > 4) {
      return "PNG scanline uses an invalid filter type";
    }
  }
  return "";
}

function pngScanlineByteLength(ihdr) {
  const bitsPerPixel = ihdr.bitDepth * samplesPerPixelByColorType[ihdr.colorType];
  return 1 + Math.ceil((ihdr.width * bitsPerPixel) / 8);
}

function invalidPng(reason) {
  return {
    valid: false,
    reason
  };
}

const samplesPerPixelByColorType = {
  0: 1,
  2: 3,
  3: 1,
  4: 2,
  6: 4
};

const supportedBitDepthsByColorType = {
  0: new Set([1, 2, 4, 8, 16]),
  2: new Set([8, 16]),
  3: new Set([1, 2, 4, 8]),
  4: new Set([8, 16]),
  6: new Set([8, 16])
};

const pngCrcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});
