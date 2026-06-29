import { describe, expect, it } from "vitest";
import { createAvatarIllustrationRigTuningSummary } from "./avatarIllustrationRigQuality";
import { defaultAvatarIllustrationRig } from "./scene";

describe("avatar illustration rig quality", () => {
  it("grades a well-spaced still-image rig as ready", () => {
    const summary = createAvatarIllustrationRigTuningSummary(
      defaultAvatarIllustrationRig({
        faceCenterY: 0.47,
        faceRange: 0.38,
        hairLineY: 0.22,
        eyeLineY: 0.35,
        mouthLineY: 0.52,
        shoulderLineY: 0.78,
        sliceCount: 24
      })
    );

    expect(summary.grade).toBe("ready");
    expect(summary.partSeparationScore).toBe(100);
    expect(summary.depthContinuityScore).toBe(100);
    expect(summary.highFidelityScore).toBe(100);
    expect(summary.issues).toEqual([]);
  });

  it("reports tuning issues for cramped part separation and weak depth continuity", () => {
    const summary = createAvatarIllustrationRigTuningSummary(
      defaultAvatarIllustrationRig({
        faceCenterY: 0.46,
        faceRange: 0.34,
        hairLineY: 0.345,
        eyeLineY: 0.35,
        mouthLineY: 0.43,
        shoulderLineY: 0.5,
        sliceCount: 12
      })
    );

    expect(summary.grade).toBe("blocked");
    expect(summary.partSeparationScore).toBe(0);
    expect(summary.depthContinuityScore).toBe(0);
    expect(summary.highFidelityScore).toBe(0);
    expect(summary.issues).toEqual(
      expect.arrayContaining([
        "Eye and mouth lines need 12-34% vertical separation.",
        "Hair line should leave 3-24% headroom above the eyes.",
        "Shoulder line should stay 14-42% below the mouth.",
        "Rig should use at least 20 slices for production deformation."
      ])
    );
  });
});
