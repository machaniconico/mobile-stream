import { describe, expect, it } from "vitest";
import {
  addSource,
  createDefaultScene,
  createSource,
  normalizeSceneDocument,
  reorderSource,
  setLocked,
  setVisibility,
  stripTransientSceneRuntime,
  toRenderGraph,
  updateTransform
} from "./scene";

describe("scene document", () => {
  it("creates a default OBS-like render graph", () => {
    const scene = createDefaultScene();
    const graph = toRenderGraph(scene);

    expect(scene.sources).toHaveLength(5);
    expect(graph.map((node) => node.kind)).toEqual(["solid", "screen", "pngtuber", "text", "chat"]);
  });

  it("adds, hides, locks, and reorders sources", () => {
    const scene = createDefaultScene();
    const text = createSource("text");
    const withText = addSource(scene, text);
    const hidden = setVisibility(withText, text.id, false);
    const locked = setLocked(hidden, text.id, true);
    const reordered = reorderSource(locked, text.id, -1);

    expect(locked.sources.find((source) => source.id === text.id)?.visible).toBe(false);
    expect(locked.sources.find((source) => source.id === text.id)?.locked).toBe(true);
    expect(reordered.sources.at(-2)?.id).toBe(text.id);
    expect(toRenderGraph(reordered).some((node) => node.id === text.id)).toBe(false);
  });

  it("clamps transforms to mobile-safe bounds", () => {
    const scene = createDefaultScene();
    const avatar = scene.sources.find((source) => source.kind === "pngtuber");
    expect(avatar).toBeDefined();

    const updated = updateTransform(scene, avatar!.id, {
      x: 2,
      y: -1,
      width: 4,
      height: -3,
      opacity: 3,
      rotation: 240
    });

    const nextAvatar = updated.sources.find((source) => source.id === avatar!.id);
    expect(nextAvatar?.transform).toMatchObject({
      x: 1,
      y: 0,
      width: 1,
      height: 0,
      opacity: 1,
      rotation: 180
    });
  });

  it("builds render payloads for legacy avatar sources without motion data", () => {
    const scene = createDefaultScene();
    const legacyScene = {
      ...scene,
      sources: scene.sources.map((source) => {
        if (source.kind !== "pngtuber") {
          return source;
        }
        const { motion: _motion, ...legacyAvatar } = source;
        return legacyAvatar;
      })
    } as typeof scene;

    const avatarNode = toRenderGraph(legacyScene).find((node) => node.kind === "pngtuber");

    expect(avatarNode?.payload.trackingConfidence).toBe(0);
    expect(avatarNode?.payload.headYaw).toBe(0);
    expect(avatarNode?.payload.meshWarp).toBe(0);
    expect(avatarNode?.payload.eyeSquint).toBe(0);
    expect(avatarNode?.payload.rigFaceCenterY).toBe(0.42);
    expect(avatarNode?.payload.rigSliceCount).toBe(24);
    expect(avatarNode?.payload.imageUri).toBe("");
  });

  it("builds transparent chat overlay payloads from runtime comments without persisting message text", () => {
    const scene = createDefaultScene();
    const graph = toRenderGraph(scene, {
      chatMessages: [
        { author: "macha", body: "  first   comment https://example.com/secret  ", source: "youtube" },
        { author: "viewer", body: "second\u202e comment", source: "twitch" }
      ]
    });

    const chatNode = graph.find((node) => node.kind === "chat");
    const persisted = stripTransientSceneRuntime(scene);
    const persistedChat = persisted.sources.find((source) => source.kind === "chat");

    expect(chatNode?.payload).toMatchObject({
      text: "macha: first comment [link]\nviewer: second comment",
      backgroundOpacity: 0,
      showAuthor: true,
      maxMessageLength: 160,
      redactUrls: true
    });
    expect(String(chatNode?.payload.messagesJson)).toContain("first comment");
    expect(String(chatNode?.payload.messagesJson)).not.toContain("example.com");
    expect(String(chatNode?.payload.messagesJson)).not.toContain("\u202e");
    expect(JSON.stringify(persistedChat)).not.toContain("first comment");
  });

  it("normalizes persisted scene data into safe renderable sources", () => {
    const scene = normalizeSceneDocument({
      version: 1,
      id: "saved",
      name: "Saved Scene",
      canvas: { width: 99999, height: -1, fps: 240 },
      sources: [
        {
          id: "bad-transform",
          kind: "text",
          name: "Caption",
          visible: true,
          locked: false,
          blendMode: "invalid",
          text: "Hello",
          color: "#fff",
          fontSize: 999,
          transform: { x: 2, y: -1, width: 5, height: -5, rotation: 999, opacity: 4 }
        },
        {
          id: "avatar-with-image",
          kind: "pngtuber",
          name: "Avatar",
          visible: true,
          locked: false,
          blendMode: "normal",
          avatarId: "avatar-custom",
          imageUri: "content://avatar/still.png",
          illustrationRig: {
            faceCenterY: 3,
            faceRange: -1,
            hairLineY: -1,
            shoulderLineY: 2,
            eyeLineY: 2,
            mouthLineY: -1,
            sliceCount: 99
          },
          expression: "happy",
          mouthOpen: 0.2,
          blink: 0,
          motion: { headYaw: 3, depthTilt: 2, meshWarp: -9, shoulderSway: 4, confidence: 2 },
          transform: { x: 0.2, y: 0.2, width: 0.3, height: 0.4, rotation: 0, opacity: 1 }
        },
        {
          id: "chat-overlay",
          kind: "chat",
          name: "Comments",
          visible: true,
          locked: false,
          blendMode: "normal",
          maxMessages: 99,
          maxMessageLength: 999,
          showAuthor: false,
          redactUrls: false,
          color: "#fff",
          fontSize: 999,
          backgroundColor: "#000000",
          backgroundOpacity: 2,
          transform: { x: 0.1, y: 0.6, width: 0.5, height: 0.2, rotation: 0, opacity: 1 }
        },
        { kind: "missing-required" }
      ]
    });

    expect(scene.id).toBe("saved");
    expect(scene.canvas).toEqual({ width: 7680, height: 1, fps: 120 });
    expect(scene.sources).toHaveLength(3);
    expect(scene.sources[0]).toMatchObject({
      id: "bad-transform",
      kind: "text",
      blendMode: "normal",
      fontSize: 180,
      transform: { x: 1, y: 0, width: 1, height: 0, rotation: 180, opacity: 1 }
    });
    expect(scene.sources[1]).toMatchObject({
      id: "avatar-with-image",
      kind: "pngtuber",
      imageUri: "content://avatar/still.png",
      illustrationRig: {
        faceCenterY: 0.85,
        faceRange: 0.08,
        hairLineY: 0.05,
        shoulderLineY: 0.95,
        eyeLineY: 0.65,
        mouthLineY: 0.25,
        sliceCount: 40
      },
      motion: { headYaw: 1, depthTilt: 1, meshWarp: -1, shoulderSway: 1, confidence: 1 }
    });
    expect(scene.sources[2]).toMatchObject({
      id: "chat-overlay",
      kind: "chat",
      maxMessages: 8,
      maxMessageLength: 240,
      showAuthor: false,
      redactUrls: false,
      fontSize: 120,
      backgroundOpacity: 1
    });
  });

  it("strips transient avatar runtime before scene persistence", () => {
    const scene = createDefaultScene();
    const persisted = stripTransientSceneRuntime({
      ...scene,
      sources: scene.sources.map((source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              mouthOpen: 0.9,
              blink: 0.8,
              motion: {
                ...source.motion,
                headYaw: 0.7,
                meshWarp: 0.5,
                hairSway: -0.4,
                confidence: 1
              }
            }
          : source
      )
    });

    const avatar = persisted.sources.find((source) => source.kind === "pngtuber");

    expect(avatar?.mouthOpen).toBe(0);
    expect(avatar?.blink).toBe(0);
    expect(avatar?.motion.headYaw).toBe(0);
    expect(avatar?.motion.meshWarp).toBe(0);
    expect(avatar?.motion.hairSway).toBe(0);
    expect(avatar?.motion.confidence).toBe(0);
  });
});
