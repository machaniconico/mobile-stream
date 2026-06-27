import { describe, expect, it } from "vitest";
import { createRgbaPngFixture } from "./png-test-fixtures.mjs";
import { readPngEvidence } from "./png-evidence.mjs";

describe("PNG evidence parser", () => {
  it("accepts structurally valid screenshot PNG evidence", () => {
    const evidence = readPngEvidence(createRgbaPngFixture(1179, 2556));

    expect(evidence).toMatchObject({
      valid: true,
      width: 1179,
      height: 2556,
      bitDepth: 8,
      colorType: 6
    });
  });

  it("rejects PNG evidence with patched IHDR dimensions and stale CRC", () => {
    const content = Buffer.from(createRgbaPngFixture(1, 1));
    content.writeUInt32BE(1179, 16);
    content.writeUInt32BE(2556, 20);

    const evidence = readPngEvidence(content);

    expect(evidence).toMatchObject({
      valid: false,
      reason: "CRC mismatch in IHDR chunk"
    });
  });

  it("rejects PNG evidence whose IDAT data does not match declared dimensions", () => {
    const content = Buffer.from(createRgbaPngFixture(1, 1));
    content.writeUInt32BE(1179, 16);
    content.writeUInt32BE(2556, 20);
    rewriteIhdrCrc(content);

    const evidence = readPngEvidence(content);

    expect(evidence.valid).toBe(false);
    expect(evidence.reason).toContain("PNG IDAT data length 5 does not match expected");
  });
});

function rewriteIhdrCrc(content) {
  const crc = crc32(content.subarray(12, 29));
  content.writeUInt32BE(crc, 29);
}

function crc32(content) {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});
