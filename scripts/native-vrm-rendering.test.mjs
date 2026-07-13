import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("native Android VRM rendering", () => {
  const renderer = readFileSync(
    "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidVrmRenderer.kt",
    "utf8"
  );
  const compositor = readFileSync(
    "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidSceneCompositor.kt",
    "utf8"
  );
  const service = readFileSync(
    "android/app/src/main/java/com/mobilelivecaster/streaming/MediaProjectionService.kt",
    "utf8"
  );
  const directStream = readFileSync(
    "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidMediaCodecDirectStream.kt",
    "utf8"
  );
  const gradle = readFileSync("android/app/build.gradle", "utf8");

  it("pins the production Filament GLB renderer", () => {
    expect(gradle).toContain('def filamentVersion = "1.71.5"');
    expect(gradle).toContain('implementation("com.google.android.filament:filament-android:${filamentVersion}")');
    expect(gradle).toContain('implementation("com.google.android.filament:gltfio-android:${filamentVersion}")');
    expect(renderer).toContain("Engine.create(Engine.Backend.OPENGL)");
    expect(renderer).toContain('private const val RENDERER_BACKEND = "filament-opengl-es"');
  });

  it("renders a transparent readable headless frame and rejects blank output", () => {
    expect(renderer).toContain("SwapChainFlags.CONFIG_TRANSPARENT or SwapChainFlags.CONFIG_READABLE");
    expect(renderer).toContain("blendMode = View.BlendMode.TRANSLUCENT");
    expect(renderer).toContain("renderer.readPixels(");
    expect(renderer).toContain("verifyTransparentModelPixels(bitmap)");
    expect(renderer).toContain('"Filament produced an empty VRM frame"');
    expect(renderer).toContain('"Filament VRM frame did not preserve a transparent background"');
  });

  it("applies humanoid transforms and expression morphs before publishing evidence", () => {
    expect(renderer).toContain("descriptor.boneNodeIndices.forEach");
    expect(renderer).toContain("prepareVrmModelForFilament");
    expect(renderer).toContain("VrmNodeEntityResolver.resolve(");
    expect(renderer).toContain("entitiesByNodeIndex[nodeIndex]");
    expect(renderer).not.toContain("nodeEntities.getOrNull(nodeIndex)");
    expect(renderer).toContain("renderableManager.setMorphWeights(instance, weights, 0)");
    expect(renderer).toContain("model.instance.animator.updateBoneMatrices()");
    expect(compositor).toContain('"vrm" -> createVrmFilter(context, node)');
    expect(compositor).toContain('"vrm" -> createVrmBitmap(context, node)');
    expect(compositor).toContain("rendererStatus = rendererEvidence.status");
    expect(compositor).toContain("rendererBackend = rendererEvidence.backend");
    expect(compositor).toContain("renderedSourceCount = rendererEvidence.renderedSourceCount");
    expect(compositor).toContain("private val vrmMetadataCache = ConcurrentHashMap");
    expect(compositor).toContain("vrmMetadataCache.clear()");
  });

  it("coalesces pose work and refreshes both active Android compositor paths", () => {
    expect(renderer).toContain("private val pendingRequest = AtomicReference<RenderRequest?>(null)");
    expect(renderer).toContain("private val workerScheduled = AtomicBoolean(false)");
    expect(renderer).toContain("private const val MIN_RENDER_INTERVAL_MS = 180L");
    expect(renderer).toContain("VrmRenderRetryPolicy.shouldSchedule(");
    expect(renderer).toContain("discardPendingPoseRetries(request)");
    expect(renderer).toContain("sourceStates.compute(request.sourceId)");
    expect(renderer).toContain("private val ownerThread = Thread.currentThread()");
    expect(renderer).toContain("requireOwnerThread()");
    expect(service).toContain("AndroidSceneCompositor.setVrmFrameReadyListener");
    expect(service).toContain("updateStreamScene()");
    expect(service).toContain("AndroidSceneCompositor.release()");
  });

  it("composites the latest screen and avatar at encoder cadence even when capture is static", () => {
    expect(directStream).toContain("val cadence = AndroidVideoFrameCadence(currentProfile.fps, System.nanoTime())");
    expect(directStream).toContain("updateLatestScreenFrame()");
    expect(directStream).toContain("renderCompositeFrame(screenBitmap)");
    expect(directStream).toContain("cadence.advanceAfterRender(nowNanos)");
    expect(directStream).toContain("private fun renderCompositeFrame(screenBitmap: Bitmap?)");
  });
});
