import { describe, expect, it } from "vitest";
import { createDefaultScene } from "./scene";
import { createDefaultStudioProfile } from "./profiles";
import { createReadinessReport } from "./readiness";
import {
  createStreamStartPreflightReport,
  formatStreamStartPreflightBlockMessage
} from "./streamStartPreflight";

const validReadiness = () =>
  createReadinessReport(createDefaultScene(), {
    ...createDefaultStudioProfile(),
    destination: {
      ...createDefaultStudioProfile().destination,
      serverUrl: "rtmps://live.example-stream.test/app",
      streamKey: "dummy-stream-value"
    }
  });

describe("stream start preflight", () => {
  it("blocks start when readiness has errors", () => {
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createDefaultScene(), createDefaultStudioProfile()),
      streamStatus: "idle"
    });

    expect(report.canStart).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blocks.map((issue) => issue.code)).toContain("readiness-stream-key-required");
  });

  it("allows an idle valid setup to start", () => {
    const report = createStreamStartPreflightReport({
      readiness: validReadiness(),
      streamStatus: "idle"
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.summary).toBe("Launch preflight is ready.");
  });

  it("keeps warnings visible without blocking start", () => {
    const readiness = createReadinessReport(createDefaultScene(), {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        protocol: "rtmp",
        serverUrl: "rtmp://live.example-stream.test/app",
        streamKey: "dummy-stream-value"
      }
    });
    const report = createStreamStartPreflightReport({
      readiness,
      streamStatus: "failed"
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["readiness-rtmp-not-encrypted", "engine-previous-failure"])
    );
  });

  it("blocks duplicate launch attempts while already live", () => {
    const report = createStreamStartPreflightReport({
      readiness: validReadiness(),
      streamStatus: "live"
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("engine-live");
  });

  it("blocks launch while another stream operation is pending", () => {
    const report = createStreamStartPreflightReport({
      readiness: validReadiness(),
      streamStatus: "idle",
      operationStatus: {
        kind: "pending",
        action: "stop",
        message: "Stopping stream"
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("operation-stop-pending");
  });

  it("formats blocking failures for operation errors", () => {
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createDefaultScene(), createDefaultStudioProfile()),
      streamStatus: "live"
    });

    expect(formatStreamStartPreflightBlockMessage(report)).toContain("Launch preflight blocked:");
    expect(formatStreamStartPreflightBlockMessage(report)).toContain("Stream key is required.");
  });
});
