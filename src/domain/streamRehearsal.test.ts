import { describe, expect, it } from "vitest";
import { createStreamRehearsalReport, type StreamRehearsalInput } from "./streamRehearsal";

describe("stream rehearsal report", () => {
  it("is ready only after private runbook and retained feature evidence are complete", () => {
    const report = createStreamRehearsalReport(rehearsalInput());

    expect(report.status).toBe("ready");
    expect(report.canPromoteToPublic).toBe(true);
    expect(report.summary).toContain("ready to promote");
    expect(report.items.map((item) => item.status)).toEqual(["pass", "pass", "pass", "pass", "pass"]);
  });

  it("requires a private ingest rehearsal before public promotion", () => {
    const report = createStreamRehearsalReport(
      rehearsalInput({
        telemetry: {
          streamStatus: "idle",
          bitrateKbps: 0,
          fps: 0,
          elapsedSeconds: 0
        },
        runbook: {
          status: "setup",
          summary: "Private validation runbook is waiting for a device run.",
          nextAction: "Start the private rehearsal.",
          failCount: 0,
          pendingCount: 4,
          warningCount: 0
        }
      })
    );

    expect(report.status).toBe("needs-run");
    expect(report.canPromoteToPublic).toBe(false);
    expect(report.primaryAction).toContain("private or unlisted rehearsal");
    expect(report.items).toContainEqual(
      expect.objectContaining({
        id: "private-ingest",
        status: "pending"
      })
    );
  });

  it("blocks when retained feature evidence is missing for a platform destination", () => {
    const report = createStreamRehearsalReport(
      rehearsalInput({
        evidence: {
          ...readyEvidence,
          status: "partial",
          summary: "Physical validation is partial.",
          platformPublishingAndroidPass: false
        }
      })
    );

    expect(report.status).toBe("needs-run");
    expect(report.canPromoteToPublic).toBe(false);
    expect(report.items).toContainEqual(
      expect.objectContaining({
        id: "feature-proof",
        status: "pending",
        detail: expect.stringContaining("destination dashboard")
      })
    );
  });

  it("does not require first-party dashboard proof for custom RTMP(S) rehearsal targets", () => {
    const report = createStreamRehearsalReport(
      rehearsalInput({
        target: {
          platform: "Custom",
          protocol: "rtmps",
          secureTransport: true
        },
        evidence: {
          ...readyEvidence,
          platformPublishingIosPass: false,
          platformPublishingAndroidPass: false
        }
      })
    );

    expect(report.items.find((item) => item.id === "feature-proof")).toEqual(
      expect.objectContaining({
        status: "pass"
      })
    );
  });
});

const readyEvidence: StreamRehearsalInput["evidence"] = {
  status: "ready",
  summary: "Physical validation evidence is ready.",
  recommendation: "Keep the retained evidence with the release bundle.",
  physicalDeviceIosPass: true,
  physicalDeviceAndroidPass: true,
  nativeRuntimeIosPass: true,
  nativeRuntimeAndroidPass: true,
  monitorHoldIosPass: true,
  monitorHoldAndroidPass: true,
  faceTrackingIosPass: true,
  faceTrackingAndroidPass: true,
  audioIosPass: true,
  audioAndroidPass: true,
  chatReadoutIosPass: true,
  chatReadoutAndroidPass: true,
  platformPublishingIosPass: true,
  platformPublishingAndroidPass: true
};

const rehearsalInput = (patch: Partial<StreamRehearsalInput> = {}): StreamRehearsalInput => ({
  target: {
    platform: "YouTube Live",
    protocol: "rtmps",
    secureTransport: true
  },
  telemetry: {
    streamStatus: "live",
    bitrateKbps: 4_500,
    fps: 30,
    elapsedSeconds: 120
  },
  validation: {
    status: "ready",
    summary: "Commercial validation is ready.",
    recommendedNextStep: "Archive the evidence."
  },
  runbook: {
    status: "complete",
    summary: "Private validation runbook is complete.",
    nextAction: "Record the validation run.",
    failCount: 0,
    pendingCount: 0,
    warningCount: 0
  },
  evidence: readyEvidence,
  ...patch
});
