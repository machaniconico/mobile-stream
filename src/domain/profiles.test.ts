import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, normalizeStudioProfile, stripSensitiveProfileData } from "./profiles";

describe("studio profiles", () => {
  it("normalizes partial persisted profile data", () => {
    const profile = normalizeStudioProfile({
      destination: {
        ...createDefaultStudioProfile().destination,
        serverUrl: "rtmps://live.example-stream.test/app"
      }
    });

    expect(profile.destination.serverUrl).toBe("rtmps://live.example-stream.test/app");
    expect(profile.destination.streamKey).toBe("");
    expect(profile.quality.id).toBe("quality-balanced");
    expect(profile.avatar.id).toBe("avatar-default");
  });

  it("removes stream keys before persistence", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: "secret-stream-key"
      }
    };

    expect(stripSensitiveProfileData(profile).destination.streamKey).toBe("");
  });
});
