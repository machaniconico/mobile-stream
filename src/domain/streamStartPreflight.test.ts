import { describe, expect, it } from "vitest";
import { createDefaultScene, setVisibility, type SceneDocument } from "./scene";
import { applyDestinationPreset, createDefaultStudioProfile, type StudioProfile } from "./profiles";
import { createReadinessReport } from "./readiness";
import {
  createStreamStartPreflightReport,
  formatStreamStartPreflightBlockMessage
} from "./streamStartPreflight";

const validReadiness = () =>
  createReadinessReport(createScreenOnlyScene(), validProfile());

const validProfile = (): StudioProfile => ({
  ...createDefaultStudioProfile(),
  destination: {
    ...createDefaultStudioProfile().destination,
    serverUrl: "rtmps://live.example-stream.test/app",
    streamKey: "dummy-stream-value"
  }
});

const createScreenOnlyScene = (): SceneDocument =>
  createDefaultScene().sources
    .filter((source) => source.kind !== "screen")
    .reduce((scene, source) => setVisibility(scene, source.id, false), createDefaultScene());

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

  it("allows private YouTube validation streams before commercial validation is ready", () => {
    const report = createStreamStartPreflightReport({
      readiness: validReadiness(),
      streamStatus: "idle",
      profile: validProfile(),
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record private validation evidence."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.code)).not.toContain("validation-youtube-public-not-ready");
  });

  it("blocks public YouTube launches until commercial validation is ready", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "public" as const
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record iOS and Android avatar-motion evidence."
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blocks.map((issue) => issue.code)).toContain("validation-youtube-public-not-ready");
    expect(formatStreamStartPreflightBlockMessage(report)).toContain("YouTube Live is set to public");
  });

  it("allows public YouTube launches after commercial validation is ready", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "public" as const
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.code)).not.toContain("validation-youtube-public-not-ready");
  });

  it("blocks Twitch launches until commercial validation is ready", () => {
    const baseProfile = applyDestinationPreset(validProfile(), "twitch-auto");
    const profile = {
      ...baseProfile,
      destination: {
        ...baseProfile.destination,
        streamKey: "placeholder-twitch-key"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record iOS and Android avatar-motion evidence."
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("validation-twitch-public-not-ready");
  });

  it("warns for unlisted YouTube launches before commercial validation is ready", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "unlisted" as const
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record iOS and Android avatar-motion evidence."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("validation-youtube-unlisted-not-ready");
  });

  it("warns for custom ingest when visibility is unknown and validation is not ready", () => {
    const profile = {
      ...validProfile(),
      destination: {
        ...validProfile().destination,
        platform: "custom" as const,
        presetId: "custom-rtmps" as const,
        name: "Custom RTMPS"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record iOS and Android avatar-motion evidence."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("validation-custom-not-ready");
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
