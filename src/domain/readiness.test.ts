import { describe, expect, it } from "vitest";
import { createDefaultScene } from "./scene";
import { createDefaultStudioProfile } from "./profiles";
import { createReadinessReport } from "./readiness";

describe("stream readiness", () => {
  it("blocks the sample profile from going live", () => {
    const report = createReadinessReport(createDefaultScene(), createDefaultStudioProfile());

    expect(report.canStart).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("placeholder-endpoint");
    expect(report.issues.map((issue) => issue.code)).toContain("stream-key-required");
  });

  it("accepts a valid RTMPS profile", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        serverUrl: "rtmps://live.example-stream.test/app",
        streamKey: "abcd-1234-efgh"
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(true);
    expect(report.errorCount).toBe(0);
  });

  it("blocks protocol mismatches", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        protocol: "rtmp" as const,
        serverUrl: "rtmps://live.example-stream.test/app",
        streamKey: "abcd-1234-efgh"
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("protocol-mismatch");
  });

  it("trims destination values before start", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        serverUrl: "  rtmps://live.example-stream.test/app  ",
        streamKey: "  key-123456  "
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.sanitizedProfile.destination.serverUrl).toBe("rtmps://live.example-stream.test/app");
    expect(report.sanitizedProfile.destination.streamKey).toBe("key-123456");
  });
});
