import { describe, expect, it } from "vitest";
import {
  addSource,
  analyzeAvatarIllustrationAlphaMask,
  applyInferredAvatarIllustrationRig,
  addSceneToCollection,
  activatePrivacyShieldScene,
  createAvatarIllustrationLandmarkAnalysisFromDetector,
  createAvatarIllustrationLandmarkAnalysisFromPixelFeatures,
  createDefaultSceneCollection,
  createDefaultScene,
  createSceneFromTemplate,
  createSubtitleTextSource,
  createSource,
  duplicateActiveScene,
  inferAvatarIllustrationRig,
  normalizeSceneCollection,
  normalizeSceneDocument,
  reorderSource,
  selectActiveScene,
  setActiveScene,
  setLocked,
  setVisibility,
  stripTransientSceneCollectionRuntime,
  stripTransientSceneRuntime,
  toRenderGraph,
  updateSource,
  updateSceneTransition,
  updateTransform
} from "./scene";

describe("scene document", () => {
  it("creates a default OBS-like render graph", () => {
    const scene = createDefaultScene();
    const graph = toRenderGraph(scene);

    expect(scene.sources).toHaveLength(6);
    expect(graph.map((node) => node.kind)).toEqual(["solid", "screen", "pngtuber", "text", "text", "chat"]);
    expect(graph.find((node) => node.id === "source-subtitle")?.payload).toMatchObject({
      mode: "subtitle",
      align: "center",
      backgroundOpacity: 0.46,
      outlineWidth: 5,
      maxLines: 2
    });
  });

  it("creates an OBS-like scene collection with live-switchable presets", () => {
    const collection = createDefaultSceneCollection();

    expect(collection.activeSceneId).toBe("scene-main");
    expect(collection.transition).toEqual({ kind: "fade", durationMs: 300 });
    expect(collection.scenes.map((scene) => scene.name)).toEqual(["Main Scene", "Starting Soon", "Break", "Privacy Shield"]);
    expect(selectActiveScene(collection).id).toBe("scene-main");
    expect(collection.scenes.find((scene) => scene.id === "scene-starting-soon")?.sources.map((source) => source.kind)).toEqual([
      "solid",
      "text",
      "pngtuber",
      "chat"
    ]);
    expect(collection.scenes.find((scene) => scene.id === "scene-privacy-shield")?.sources.map((source) => source.kind)).toEqual([
      "solid",
      "text"
    ]);
  });

  it("normalizes legacy single-scene persistence into a scene collection", () => {
    const scene = createDefaultScene();
    const collection = normalizeSceneCollection({
      ...scene,
      id: "legacy-scene",
      name: "Legacy"
    });

    expect(collection.activeSceneId).toBe("legacy-scene");
    expect(collection.transition).toEqual({ kind: "fade", durationMs: 300 });
    expect(collection.scenes).toHaveLength(1);
    expect(selectActiveScene(collection).name).toBe("Legacy");
  });

  it("normalizes and updates scene transition settings", () => {
    const collection = normalizeSceneCollection({
      version: 1,
      activeSceneId: "scene-main",
      transition: { kind: "invalid", durationMs: 99999 },
      scenes: [createDefaultScene()]
    });
    const updated = updateSceneTransition(collection, { kind: "cut", durationMs: -5 });

    expect(collection.transition).toEqual({ kind: "fade", durationMs: 2000 });
    expect(updated.transition).toEqual({ kind: "cut", durationMs: 0 });
    expect(selectActiveScene(updated).id).toBe("scene-main");
  });

  it("switches, adds, and duplicates active scenes without mutating the originals", () => {
    const collection = createDefaultSceneCollection();
    const switched = setActiveScene(collection, "scene-break");
    const withStartingScene = addSceneToCollection(switched, createSceneFromTemplate("starting-soon"));
    const duplicated = duplicateActiveScene(withStartingScene);

    expect(selectActiveScene(switched).name).toBe("Break");
    expect(withStartingScene.scenes).toHaveLength(5);
    expect(duplicated.scenes).toHaveLength(6);
    expect(selectActiveScene(duplicated).name).toBe("Starting Soon Copy");
    expect(duplicated.scenes.at(-1)?.sources[0]?.id).not.toBe(selectActiveScene(withStartingScene).sources[0]?.id);
    expect(collection.activeSceneId).toBe("scene-main");
  });

  it("activates or creates the privacy shield scene for emergency blackout use", () => {
    const collection = createDefaultSceneCollection();
    const activated = activatePrivacyShieldScene(collection);
    const legacyCollection = normalizeSceneCollection({
      version: 1,
      activeSceneId: "scene-main",
      scenes: [createDefaultScene()]
    });
    const created = activatePrivacyShieldScene(legacyCollection);

    expect(activated.activeSceneId).toBe("scene-privacy-shield");
    expect(selectActiveScene(activated).sources.map((source) => source.kind)).toEqual(["solid", "text"]);
    expect(created.activeSceneId).toBe("scene-privacy-shield");
    expect(created.scenes).toHaveLength(2);
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
    expect(avatarNode?.payload.rigFaceCenterY).toBe(0.39);
    expect(avatarNode?.payload.rigSliceCount).toBe(24);
    expect(avatarNode?.payload.imageUri).toBe("");
  });

  it("persists and renders Live2D model3 JSON URIs", () => {
    const live2d = createSource("live2d");
    if (live2d.kind !== "live2d") {
      throw new Error("Expected Live2D source.");
    }
    const scene = addSource(createDefaultScene(), {
      ...live2d,
      modelId: "hiyori",
      modelJsonUri: " file:///models/hiyori/hiyori.model3.json\n"
    });
    const normalized = normalizeSceneDocument(scene);
    const live2dSource = normalized.sources.find((source) => source.kind === "live2d");
    const live2dNode = toRenderGraph(normalized).find((node) => node.kind === "live2d");

    expect(live2dSource).toMatchObject({
      modelId: "hiyori",
      modelJsonUri: "file:///models/hiyori/hiyori.model3.json"
    });
    expect(live2dNode?.payload.modelJsonUri).toBe("file:///models/hiyori/hiyori.model3.json");
  });

  it("persists and renders VRM model URIs for VRoid sources", () => {
    const vrm = createSource("vrm");
    if (vrm.kind !== "vrm") {
      throw new Error("Expected VRM source.");
    }
    const scene = addSource(createDefaultScene(), {
      ...vrm,
      modelId: "vroid-avatar",
      modelUri: " file:///models/vroid/avatar.vrm\n",
      mouthOpen: 0.42,
      motion: { ...vrm.motion, headYaw: 0.31, confidence: 0.88 }
    });
    const normalized = normalizeSceneDocument(scene);
    const vrmSource = normalized.sources.find((source) => source.kind === "vrm");
    const vrmNode = toRenderGraph(normalized).find((node) => node.kind === "vrm");

    expect(vrmSource).toMatchObject({
      modelId: "vroid-avatar",
      modelUri: "file:///models/vroid/avatar.vrm",
      mouthOpen: 0.42
    });
    expect(vrmNode?.payload).toMatchObject({
      modelUri: "file:///models/vroid/avatar.vrm",
      headYaw: 0.31,
      trackingConfidence: 0.88,
      vrmRuntimeStatus: "active",
      vrmLookAtYaw: 0.31
    });
    expect(JSON.parse(String(vrmNode?.payload.vrmRuntimePoseJson))).toMatchObject({
      status: "active",
      confidence: 0.88,
      expressions: {
        neutral: 0
      }
    });
  });

  it("infers still-image illustration rig landmarks from avatar framing", () => {
    const canvas = { width: 1920, height: 1080, fps: 30 };
    const bust = inferAvatarIllustrationRig({ canvas, transform: { width: 0.3, height: 0.42 } });
    const fullBody = inferAvatarIllustrationRig({ canvas, transform: { width: 0.18, height: 0.7 } });
    const closeUp = inferAvatarIllustrationRig({ canvas, transform: { width: 0.62, height: 0.24 } });

    expect(fullBody.faceCenterY).toBeLessThan(bust.faceCenterY);
    expect(fullBody.sliceCount).toBeGreaterThan(bust.sliceCount);
    expect(closeUp.faceRange).toBeGreaterThan(bust.faceRange);
    expect(closeUp.shoulderLineY).toBeGreaterThan(bust.shoulderLineY);
  });

  it("applies inferred illustration rig to selected PNGTuber sources", () => {
    const scene = createDefaultScene();
    const avatar = scene.sources.find((source) => source.kind === "pngtuber");
    expect(avatar).toBeDefined();

    const reframed = updateTransform(scene, avatar!.id, { width: 0.18, height: 0.72 });
    const rigged = applyInferredAvatarIllustrationRig(reframed, avatar!.id, { mouthLineY: 0.42 });
    const riggedAvatar = rigged.sources.find((source) => source.kind === "pngtuber");

    expect(riggedAvatar?.kind).toBe("pngtuber");
    expect(riggedAvatar?.illustrationRig).toMatchObject({
      faceCenterY: 0.32,
      shoulderLineY: 0.54,
      mouthLineY: 0.42,
      sliceCount: 32
    });
  });

  it("uses still-image aspect ratio when auto-rigging a selected PNGTuber source", () => {
    const scene = createDefaultScene();
    const avatar = scene.sources.find((source) => source.kind === "pngtuber");
    expect(avatar).toBeDefined();

    const closeUpByFrame = updateTransform(scene, avatar!.id, { width: 0.58, height: 0.32 });
    const tallImageRigged = applyInferredAvatarIllustrationRig(closeUpByFrame, avatar!.id, {}, { imageAspectRatio: 0.52 });
    const riggedAvatar = tallImageRigged.sources.find((source) => source.kind === "pngtuber");

    expect(riggedAvatar?.kind).toBe("pngtuber");
    expect(riggedAvatar?.illustrationRig).toMatchObject({
      faceCenterY: 0.32,
      faceRange: 0.24,
      shoulderLineY: 0.54,
      sliceCount: 32
    });
  });

  it("uses alpha-mask foreground analysis when auto-rigging a padded still image", () => {
    const scene = createDefaultScene();
    const avatar = scene.sources.find((source) => source.kind === "pngtuber");
    expect(avatar).toBeDefined();
    const width = 100;
    const height = 100;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 10; y < 96; y += 1) {
      for (let x = 38; x < 62; x += 1) {
        pixels[(y * width + x) * 4 + 3] = 255;
      }
    }

    const imageAnalysis = analyzeAvatarIllustrationAlphaMask({
      width,
      height,
      data: pixels,
      sampleStep: 1
    });
    const rigged = applyInferredAvatarIllustrationRig(scene, avatar!.id, {}, { imageAnalysis });
    const riggedAvatar = rigged.sources.find((source) => source.kind === "pngtuber");

    expect(imageAnalysis?.foregroundBounds).toMatchObject({
      top: 0.1,
      bottom: 0.96
    });
    expect(riggedAvatar?.kind).toBe("pngtuber");
    expect(riggedAvatar?.illustrationRig.faceCenterY).toBeCloseTo(0.375, 2);
    expect(riggedAvatar?.illustrationRig.eyeLineY).toBeCloseTo(0.341, 2);
    expect(riggedAvatar?.illustrationRig.mouthLineY).toBeCloseTo(0.435, 2);
    expect(riggedAvatar?.illustrationRig.shoulderLineY).toBeCloseTo(0.564, 2);
    expect(riggedAvatar?.illustrationRig.sliceCount).toBe(32);
  });

  it("uses dark eye and mouth pixel features when auto-rigging a still illustration", () => {
    const scene = createDefaultScene();
    const avatar = scene.sources.find((source) => source.kind === "pngtuber");
    expect(avatar).toBeDefined();
    const width = 100;
    const height = 100;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const paint = (left: number, top: number, right: number, bottom: number, color: [number, number, number, number]) => {
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const offset = (y * width + x) * 4;
          pixels[offset] = color[0];
          pixels[offset + 1] = color[1];
          pixels[offset + 2] = color[2];
          pixels[offset + 3] = color[3];
        }
      }
    };
    paint(24, 8, 76, 92, [238, 204, 184, 255]);
    paint(34, 32, 46, 34, [24, 20, 28, 255]);
    paint(54, 32, 66, 34, [24, 20, 28, 255]);
    paint(44, 52, 58, 54, [36, 18, 24, 255]);

    const imageAnalysis = analyzeAvatarIllustrationAlphaMask({
      width,
      height,
      data: pixels,
      sampleStep: 1
    });
    const landmarkAnalysis = createAvatarIllustrationLandmarkAnalysisFromPixelFeatures({
      width,
      height,
      data: pixels,
      foregroundBounds: imageAnalysis?.foregroundBounds ?? null,
      sampleStep: 1
    });
    const rigged = applyInferredAvatarIllustrationRig(scene, avatar!.id, {}, { imageAnalysis, landmarkAnalysis });
    const riggedAvatar = rigged.sources.find((source) => source.kind === "pngtuber");

    expect(landmarkAnalysis?.confidence).toBeGreaterThan(0.65);
    expect(landmarkAnalysis?.leftEye?.y).toBeCloseTo(0.33, 2);
    expect(landmarkAnalysis?.rightEye?.y).toBeCloseTo(0.33, 2);
    expect(landmarkAnalysis?.mouthCenter?.y).toBeCloseTo(0.53, 2);
    expect(riggedAvatar?.kind).toBe("pngtuber");
    expect(riggedAvatar?.illustrationRig.eyeLineY).toBeCloseTo(0.33, 2);
    expect(riggedAvatar?.illustrationRig.mouthLineY).toBeCloseTo(0.53, 2);
    expect(riggedAvatar?.illustrationRig.sliceCount).toBe(36);
  });

  it("falls back to aspect geometry when alpha analysis only finds a full opaque canvas", () => {
    const scene = createDefaultScene();
    const avatar = scene.sources.find((source) => source.kind === "pngtuber");
    expect(avatar).toBeDefined();
    const closeUpByFrame = updateTransform(scene, avatar!.id, { width: 0.62, height: 0.24 });
    const width = 80;
    const height = 80;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 3; index < pixels.length; index += 4) {
      pixels[index] = 255;
    }

    const imageAnalysis = analyzeAvatarIllustrationAlphaMask({
      width,
      height,
      data: pixels,
      sampleStep: 1
    });
    const rigged = applyInferredAvatarIllustrationRig(closeUpByFrame, avatar!.id, {}, { imageAnalysis });
    const riggedAvatar = rigged.sources.find((source) => source.kind === "pngtuber");

    expect(imageAnalysis?.foregroundBounds).toMatchObject({
      top: 0,
      bottom: 1
    });
    expect(riggedAvatar?.kind).toBe("pngtuber");
    expect(riggedAvatar?.illustrationRig).toMatchObject({
      faceCenterY: 0.46,
      faceRange: 0.48,
      shoulderLineY: 0.82,
      sliceCount: 20
    });
  });

  it("uses semantic face landmarks over alpha geometry when auto-rigging", () => {
    const scene = createDefaultScene();
    const avatar = scene.sources.find((source) => source.kind === "pngtuber");
    expect(avatar).toBeDefined();
    const imageAnalysis = analyzeAvatarIllustrationAlphaMask({
      width: 100,
      height: 100,
      data: new Uint8ClampedArray(100 * 100 * 4).fill(255),
      sampleStep: 1
    });
    const rigged = applyInferredAvatarIllustrationRig(scene, avatar!.id, {}, {
      imageAnalysis,
      landmarkAnalysis: {
        confidence: 0.9,
        faceCenter: { x: 0.5, y: 0.4, confidence: 0.92 },
        leftEye: { x: 0.42, y: 0.31, confidence: 0.88 },
        rightEye: { x: 0.58, y: 0.33, confidence: 0.88 },
        mouthCenter: { x: 0.5, y: 0.49, confidence: 0.9 },
        hairLineY: 0.19,
        shoulderLineY: 0.68
      }
    });
    const riggedAvatar = rigged.sources.find((source) => source.kind === "pngtuber");

    expect(riggedAvatar?.kind).toBe("pngtuber");
    expect(riggedAvatar?.illustrationRig.faceCenterY).toBeCloseTo(0.4, 3);
    expect(riggedAvatar?.illustrationRig.eyeLineY).toBeCloseTo(0.32, 3);
    expect(riggedAvatar?.illustrationRig.mouthLineY).toBeCloseTo(0.49, 3);
    expect(riggedAvatar?.illustrationRig.hairLineY).toBeCloseTo(0.19, 3);
    expect(riggedAvatar?.illustrationRig.shoulderLineY).toBeCloseTo(0.68, 3);
    expect(riggedAvatar?.illustrationRig.faceRange).toBeCloseTo(0.345, 3);
    expect(riggedAvatar?.illustrationRig.sliceCount).toBe(36);
  });

  it("maps detector face landmarks into semantic auto-rig input", () => {
    const analysis = createAvatarIllustrationLandmarkAnalysisFromDetector({
      width: 200,
      height: 100,
      faces: [
        {
          boundingBox: { x: 60, y: 10, width: 80, height: 70 },
          confidence: 0.86,
          landmarks: [
            { type: "eye", locations: [{ x: 88, y: 36 }] },
            { type: "mouth", locations: [{ x: 100, y: 60 }], confidence: 0.9 },
            { type: "eye", locations: [{ x: 112, y: 38 }] }
          ]
        }
      ]
    });

    expect(analysis).not.toBeNull();
    expect(analysis?.confidence).toBeCloseTo(0.86, 3);
    expect(analysis?.leftEye?.x).toBeCloseTo(0.44, 3);
    expect(analysis?.leftEye?.y).toBeCloseTo(0.36, 3);
    expect(analysis?.rightEye?.x).toBeCloseTo(0.56, 3);
    expect(analysis?.rightEye?.y).toBeCloseTo(0.38, 3);
    expect(analysis?.mouthCenter?.x).toBeCloseTo(0.5, 3);
    expect(analysis?.mouthCenter?.y).toBeCloseTo(0.6, 3);
    expect(analysis?.faceCenter?.y).toBeCloseTo(0.478, 3);
    expect(analysis?.hairLineY).toBe(0);
    expect(analysis?.shoulderLineY).toBe(1);
  });

  it("treats explicit detector eye and mouth landmarks as high-confidence rig input", () => {
    const analysis = createAvatarIllustrationLandmarkAnalysisFromDetector({
      width: 200,
      height: 100,
      faces: [
        {
          boundingBox: { x: 60, y: 10, width: 80, height: 70 },
          landmarks: [
            { type: "eye", locations: [{ x: 88, y: 36 }] },
            { type: "mouth", locations: [{ x: 100, y: 60 }] },
            { type: "eye", locations: [{ x: 112, y: 38 }] }
          ]
        }
      ]
    });

    expect(analysis?.confidence).toBeGreaterThanOrEqual(0.86);
    expect(analysis?.leftEye?.y).toBeCloseTo(0.36, 3);
    expect(analysis?.rightEye?.y).toBeCloseTo(0.38, 3);
    expect(analysis?.mouthCenter?.y).toBeCloseTo(0.6, 3);
  });

  it("synthesizes conservative landmarks from a detector face box", () => {
    const scene = createDefaultScene();
    const avatar = scene.sources.find((source) => source.kind === "pngtuber");
    expect(avatar).toBeDefined();
    const landmarkAnalysis = createAvatarIllustrationLandmarkAnalysisFromDetector({
      width: 200,
      height: 100,
      faces: [
        {
          boundingBox: { x: 50, y: 20, width: 100, height: 50 },
          confidence: 0.4
        }
      ]
    });
    const rigged = applyInferredAvatarIllustrationRig(scene, avatar!.id, {}, { landmarkAnalysis });
    const riggedAvatar = rigged.sources.find((source) => source.kind === "pngtuber");

    expect(landmarkAnalysis?.confidence).toBeCloseTo(0.62, 3);
    expect(landmarkAnalysis?.leftEye?.y).toBeCloseTo(0.41, 3);
    expect(landmarkAnalysis?.rightEye?.y).toBeCloseTo(0.41, 3);
    expect(landmarkAnalysis?.mouthCenter?.y).toBeCloseTo(0.57, 3);
    expect(riggedAvatar?.kind).toBe("pngtuber");
    expect(riggedAvatar?.illustrationRig.eyeLineY).toBeCloseTo(0.41, 3);
    expect(riggedAvatar?.illustrationRig.mouthLineY).toBeCloseTo(0.57, 3);
    expect(riggedAvatar?.illustrationRig.sliceCount).toBe(32);
  });

  it("keeps landmark auto-rig output ordered when optional landmarks are noisy", () => {
    const scene = createDefaultScene();
    const avatar = scene.sources.find((source) => source.kind === "pngtuber");
    expect(avatar).toBeDefined();
    const rigged = applyInferredAvatarIllustrationRig(scene, avatar!.id, {}, {
      landmarkAnalysis: {
        confidence: 0.9,
        leftEye: { x: -12, y: 0.32, confidence: 0.88 },
        mouthCenter: { x: 12, y: 0.34, confidence: 0.9 },
        hairLineY: 0.4,
        shoulderLineY: 0.35
      }
    });
    const riggedAvatar = rigged.sources.find((source) => source.kind === "pngtuber");

    expect(riggedAvatar?.kind).toBe("pngtuber");
    const rig = riggedAvatar?.kind === "pngtuber" ? riggedAvatar.illustrationRig : null;
    expect(rig).not.toBeNull();
    expect(rig!.hairLineY).toBeLessThan(rig!.eyeLineY);
    expect(rig!.mouthLineY).toBeGreaterThan(rig!.eyeLineY);
    expect(rig!.shoulderLineY).toBeGreaterThan(rig!.mouthLineY);
    expect(rig!.mouthLineY - rig!.eyeLineY).toBeGreaterThan(0.1);
    expect(rig!.shoulderLineY - rig!.mouthLineY).toBeGreaterThanOrEqual(0.12);
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

  it("redacts sensitive runtime chat overlay payloads even when URL redaction is disabled", () => {
    const scene = updateSource(createDefaultScene(), "source-chat", (source) =>
      source.kind === "chat"
        ? {
            ...source,
            redactUrls: false
          }
        : source
    );
    const graph = toRenderGraph(scene, {
      chatMessages: [
        {
          author: "Bearer author-secret-token-12345",
          body:
            "Authorization: Bearer body-secret-token-12345 mobilelivecaster://oauth/youtube?code=oauth-code-secret&access_token=access-token-secret",
          source: "youtube"
        }
      ]
    });

    const chatNode = graph.find((node) => node.kind === "chat");
    const payloadText = String(chatNode?.payload.text);
    const messagesJson = String(chatNode?.payload.messagesJson);

    expect(payloadText).toContain("Bearer [redacted]: Authorization: Bearer [redacted]");
    expect(messagesJson).toContain("code=[redacted]");
    expect(messagesJson).toContain("access_token=[redacted]");
    expect(`${payloadText}\n${messagesJson}`).not.toContain("author-secret-token-12345");
    expect(`${payloadText}\n${messagesJson}`).not.toContain("body-secret-token-12345");
    expect(`${payloadText}\n${messagesJson}`).not.toContain("oauth-code-secret");
    expect(`${payloadText}\n${messagesJson}`).not.toContain("access-token-secret");
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
      mode: "label",
      align: "center",
      backgroundOpacity: 0,
      outlineWidth: 3,
      maxLines: 1,
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

  it("creates subtitle text sources with readable lower-third defaults", () => {
    const subtitle = createSubtitleTextSource();
    const graph = toRenderGraph(addSource(createDefaultScene(), subtitle));
    const node = graph.find((candidate) => candidate.id === subtitle.id);

    expect(subtitle).toMatchObject({
      kind: "text",
      name: "Subtitle",
      mode: "subtitle",
      align: "center",
      backgroundOpacity: 0.46,
      outlineWidth: 5,
      maxLines: 2,
      transform: { x: 0.16, y: 0.77, width: 0.68, height: 0.16 }
    });
    expect(node?.payload).toMatchObject({
      mode: "subtitle",
      align: "center",
      backgroundColor: "#000000",
      outlineColor: "#000000"
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

  it("strips transient avatar runtime from every persisted scene", () => {
    const collection = createDefaultSceneCollection();
    const withRuntime = {
      ...collection,
      scenes: collection.scenes.map((scene) => ({
        ...scene,
        sources: scene.sources.map((source) =>
          source.kind === "pngtuber"
            ? {
                ...source,
                mouthOpen: 1,
                blink: 1,
                motion: { ...source.motion, headYaw: 1, confidence: 1 }
              }
            : source
        )
      }))
    };

    const persisted = stripTransientSceneCollectionRuntime(withRuntime);

    for (const scene of persisted.scenes) {
      const avatar = scene.sources.find((source) => source.kind === "pngtuber");
      if (!avatar) {
        expect(scene.id).toBe("scene-privacy-shield");
        continue;
      }
      expect(avatar.mouthOpen).toBe(0);
      expect(avatar.blink).toBe(0);
      expect(avatar.motion.headYaw).toBe(0);
      expect(avatar.motion.confidence).toBe(0);
    }
  });
});
