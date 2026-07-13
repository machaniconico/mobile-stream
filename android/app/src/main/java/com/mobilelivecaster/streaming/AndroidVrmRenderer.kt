package com.mobilelivecaster.streaming

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.SystemClock
import com.google.android.filament.Camera
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.LightManager
import com.google.android.filament.Renderer
import com.google.android.filament.SwapChain
import com.google.android.filament.SwapChainFlags
import com.google.android.filament.Texture
import com.google.android.filament.View
import com.google.android.filament.Viewport
import com.google.android.filament.gltfio.AssetLoader
import com.google.android.filament.gltfio.FilamentAsset
import com.google.android.filament.gltfio.Gltfio
import com.google.android.filament.gltfio.ResourceLoader
import com.google.android.filament.gltfio.UbershaderProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.Executor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.tan

internal data class AndroidVrmSourceReference(
    val id: String,
    val modelUri: String
)

internal data class AndroidVrmRendererEvidence(
    val status: String = "unavailable",
    val backend: String = "none",
    val modelLoadedCount: Int = 0,
    val renderedSourceCount: Int = 0,
    val renderMissingCount: Int = 0,
    val renderFailureCount: Int = 0,
    val appliedBoneCount: Int = 0,
    val appliedExpressionCount: Int = 0
)

/**
 * Owns the process-local Filament engine used to turn one VRM/GLB avatar into a transparent
 * bitmap. Rendering is asynchronous and coalesced because scene poses arrive more frequently
 * than some mobile GPUs can read an offscreen frame back to the compositor.
 */
internal object AndroidVrmRenderer {
    private val executor = Executors.newSingleThreadScheduledExecutor { task ->
        Thread(task, "mobile-live-vrm-render").apply { isDaemon = true }
    }
    private val pendingRequest = AtomicReference<RenderRequest?>(null)
    private val workerScheduled = AtomicBoolean(false)
    private val lastRenderCompletedAtMs = AtomicLong(0L)
    private val generation = AtomicLong(1L)
    private val sourceStates = ConcurrentHashMap<String, SourceState>()
    private val requestLock = Any()

    @Volatile
    private var session: FilamentSession? = null

    @Volatile
    private var frameReadyListener: (() -> Unit)? = null

    fun setFrameReadyListener(listener: (() -> Unit)?) {
        frameReadyListener = listener
    }

    fun frameFor(
        context: Context,
        sourceId: String,
        modelUri: String,
        poseJson: String
    ): Bitmap? {
        val normalizedUri = modelUri.trim()
        if (normalizedUri.isEmpty()) {
            sourceStates.remove(sourceId)
            return null
        }

        val normalizedPose = poseJson.trim()
        val now = SystemClock.elapsedRealtime()
        var needsRender = false
        val resolved = sourceStates.compute(sourceId) { _, current ->
            needsRender = VrmRenderRetryPolicy.shouldSchedule(
                currentModelUri = current?.modelUri,
                currentPoseJson = current?.requestedPoseJson,
                currentStatus = current?.status,
                lastAttemptAtMs = current?.lastAttemptAtMs ?: 0L,
                nextModelUri = normalizedUri,
                nextPoseJson = normalizedPose,
                nowMs = now,
                retryDelayMs = FAILURE_RETRY_DELAY_MS
            )
            if (!needsRender) {
                current
            } else if (current?.modelUri == normalizedUri && current.bitmap != null) {
                current.copy(requestedPoseJson = normalizedPose, lastAttemptAtMs = now)
            } else {
                SourceState(normalizedUri, normalizedPose, status = "loading", lastAttemptAtMs = now)
            }
        }
        if (needsRender) {
            enqueue(
                RenderRequest(
                    context = context.applicationContext,
                    sourceId = sourceId,
                    modelUri = normalizedUri,
                    poseJson = normalizedPose,
                    generation = generation.get()
                )
            )
        }
        return resolved?.bitmap?.takeIf { resolved.modelUri == normalizedUri }
    }

    fun evidenceFor(sources: List<AndroidVrmSourceReference>): AndroidVrmRendererEvidence {
        val activeSourceIds = sources.mapTo(hashSetOf()) { it.id }
        sourceStates.keys
            .filterNot(activeSourceIds::contains)
            .forEach(sourceStates::remove)
        if (sources.isEmpty()) {
            return AndroidVrmRendererEvidence(status = "not-required")
        }

        val modelSources = sources.filter { it.modelUri.isNotBlank() }
        if (modelSources.isEmpty()) {
            return AndroidVrmRendererEvidence(renderMissingCount = sources.size)
        }

        val matchingStates = modelSources.mapNotNull { source ->
            sourceStates[source.id]?.takeIf { state -> state.modelUri == source.modelUri.trim() }
        }
        val renderedStates = matchingStates.filter {
            it.bitmap != null &&
                it.renderedPoseJson == it.requestedPoseJson &&
                (it.status == "ready" || it.status == "degraded")
        }
        val failureCount = matchingStates.count { it.status == "failed" || it.status == "degraded" } +
            (sources.size - MAX_VRM_SOURCE_COUNT).coerceAtLeast(0)
        val renderedCount = renderedStates.size
        val status = when {
            sources.size > MAX_VRM_SOURCE_COUNT -> "failed"
            failureCount > 0 -> "failed"
            renderedCount == sources.size -> "ready"
            else -> "loading"
        }

        return AndroidVrmRendererEvidence(
            status = status,
            backend = RENDERER_BACKEND,
            modelLoadedCount = matchingStates.count { it.modelLoaded },
            renderedSourceCount = renderedCount,
            renderMissingCount = (sources.size - renderedCount).coerceAtLeast(0),
            renderFailureCount = failureCount,
            appliedBoneCount = renderedStates.sumOf { it.appliedBoneCount },
            appliedExpressionCount = renderedStates.sumOf { it.appliedExpressionCount }
        )
    }

    fun release() {
        synchronized(requestLock) {
            generation.incrementAndGet()
            pendingRequest.set(null)
            sourceStates.clear()
        }
        executor.execute {
            session?.destroy()
            session = null
            sourceStates.clear()
        }
    }

    private fun enqueue(request: RenderRequest) {
        synchronized(requestLock) {
            val current = sourceStates[request.sourceId] ?: return
            if (request.generation != generation.get() ||
                current.modelUri != request.modelUri ||
                current.status == "failed"
            ) {
                return
            }
            pendingRequest.set(request)
            scheduleWorker()
        }
    }

    private fun scheduleWorker() {
        if (!workerScheduled.compareAndSet(false, true)) {
            return
        }
        val elapsedMs = SystemClock.elapsedRealtime() - lastRenderCompletedAtMs.get()
        val delayMs = (MIN_RENDER_INTERVAL_MS - elapsedMs).coerceAtLeast(0L)
        executor.schedule({
            try {
                pendingRequest.getAndSet(null)?.let(::render)
            } finally {
                lastRenderCompletedAtMs.set(SystemClock.elapsedRealtime())
                workerScheduled.set(false)
                if (pendingRequest.get() != null) {
                    scheduleWorker()
                }
            }
        }, delayMs, TimeUnit.MILLISECONDS)
    }

    private fun render(request: RenderRequest) {
        try {
            val activeSession = session ?: FilamentSession().also { session = it }
            val outcome = activeSession.render(request.context, request.modelUri, request.poseJson)
            if (request.generation != generation.get()) {
                return
            }
            var published = false
            sourceStates.compute(request.sourceId) { _, current ->
                if (current == null || current.modelUri != request.modelUri) {
                    current
                } else {
                    published = true
                    SourceState(
                        modelUri = request.modelUri,
                        requestedPoseJson = current.requestedPoseJson,
                        renderedPoseJson = request.poseJson,
                        bitmap = outcome.bitmap,
                        status = if (outcome.productionCompatible) "ready" else "degraded",
                        modelLoaded = true,
                        appliedBoneCount = outcome.appliedBoneCount,
                        appliedExpressionCount = outcome.appliedExpressionCount,
                        lastAttemptAtMs = SystemClock.elapsedRealtime()
                    )
                }
            }
            if (published) {
                frameReadyListener?.invoke()
            }
        } catch (_: Throwable) {
            if (request.generation != generation.get()) {
                return
            }
            runCatching { session?.destroy() }
            session = null
            var published = false
            synchronized(requestLock) {
                sourceStates.compute(request.sourceId) { _, current ->
                    if (current == null || current.modelUri != request.modelUri) {
                        current
                    } else {
                        published = true
                        SourceState(
                            modelUri = request.modelUri,
                            requestedPoseJson = current.requestedPoseJson,
                            renderedPoseJson = current.renderedPoseJson,
                            bitmap = current.bitmap,
                            status = "failed",
                            modelLoaded = current.modelLoaded,
                            appliedBoneCount = current.appliedBoneCount,
                            appliedExpressionCount = current.appliedExpressionCount,
                            lastAttemptAtMs = SystemClock.elapsedRealtime()
                        )
                    }
                }
                if (published) {
                    discardPendingPoseRetries(request)
                }
            }
            if (published) {
                frameReadyListener?.invoke()
            }
        }
    }

    private fun discardPendingPoseRetries(failedRequest: RenderRequest) {
        while (true) {
            val pending = pendingRequest.get() ?: return
            if (pending.generation != failedRequest.generation ||
                pending.sourceId != failedRequest.sourceId ||
                pending.modelUri != failedRequest.modelUri
            ) {
                return
            }
            if (pendingRequest.compareAndSet(pending, null)) {
                return
            }
        }
    }
}

private data class RenderRequest(
    val context: Context,
    val sourceId: String,
    val modelUri: String,
    val poseJson: String,
    val generation: Long
)

private data class SourceState(
    val modelUri: String,
    val requestedPoseJson: String,
    val renderedPoseJson: String = "",
    val bitmap: Bitmap? = null,
    val status: String,
    val modelLoaded: Boolean = false,
    val appliedBoneCount: Int = 0,
    val appliedExpressionCount: Int = 0,
    val lastAttemptAtMs: Long
)

private data class RenderOutcome(
    val bitmap: Bitmap,
    val appliedBoneCount: Int,
    val appliedExpressionCount: Int,
    val productionCompatible: Boolean
)

internal object VrmRenderRetryPolicy {
    fun shouldSchedule(
        currentModelUri: String?,
        currentPoseJson: String?,
        currentStatus: String?,
        lastAttemptAtMs: Long,
        nextModelUri: String,
        nextPoseJson: String,
        nowMs: Long,
        retryDelayMs: Long
    ): Boolean {
        require(retryDelayMs >= 0L) { "VRM retry delay cannot be negative" }
        if (currentModelUri == null || currentModelUri != nextModelUri) {
            return true
        }
        if (currentStatus == "failed") {
            return nowMs - lastAttemptAtMs >= retryDelayMs
        }
        return currentPoseJson != nextPoseJson
    }
}

private class FilamentSession {
    private val ownerThread = Thread.currentThread()
    private val entityManager: EntityManager
    private val engine: Engine
    private val renderer: Renderer
    private val scene: com.google.android.filament.Scene
    private val view: View
    private val cameraEntity: Int
    private val camera: Camera
    private val swapChain: SwapChain
    private val materialProvider: UbershaderProvider
    private val assetLoader: AssetLoader
    private val resourceLoader: ResourceLoader
    private val lightEntities: IntArray
    private val readbackBuffer = ByteBuffer.allocateDirect(RENDER_WIDTH * RENDER_HEIGHT * 4).order(ByteOrder.nativeOrder())
    private val pixelProbe = IntArray(RENDER_WIDTH * RENDER_HEIGHT)

    private var asset: FilamentAsset? = null
    private var loadedModelUri = ""
    private var descriptor = VrmModelDescriptor()
    private var entitiesByNodeIndex = emptyMap<Int, Int>()
    private var restTransforms = emptyMap<Int, FloatArray>()
    private var rootEntity = 0
    private var rootRestTransform = AndroidVrmMath.identityMatrix()
    private var modelHeight = 1f

    init {
        Gltfio.init()
        entityManager = EntityManager.get()
        engine = Engine.create(Engine.Backend.OPENGL)
        renderer = engine.createRenderer()
        scene = engine.createScene()
        cameraEntity = entityManager.create()
        camera = engine.createCamera(cameraEntity).apply {
            setExposure(16f, 1f / 125f, 100f)
        }
        view = engine.createView().apply {
            this.scene = this@FilamentSession.scene
            this.camera = this@FilamentSession.camera
            viewport = Viewport(0, 0, RENDER_WIDTH, RENDER_HEIGHT)
            blendMode = View.BlendMode.TRANSLUCENT
            isPostProcessingEnabled = false
        }
        renderer.clearOptions = Renderer.ClearOptions().apply {
            clearColor = doubleArrayOf(0.0, 0.0, 0.0, 0.0)
            clear = true
            discard = true
        }
        swapChain = engine.createSwapChain(
            RENDER_WIDTH,
            RENDER_HEIGHT,
            SwapChainFlags.CONFIG_TRANSPARENT or SwapChainFlags.CONFIG_READABLE
        )
        materialProvider = UbershaderProvider(engine)
        assetLoader = AssetLoader(engine, materialProvider, entityManager)
        resourceLoader = ResourceLoader(engine, true)
        lightEntities = intArrayOf(
            createDirectionalLight(75_000f, -0.35f, -0.85f, -0.45f),
            createDirectionalLight(28_000f, 0.55f, -0.35f, 0.35f)
        )
        scene.addEntities(lightEntities)
    }

    fun render(context: Context, modelUri: String, poseJson: String): RenderOutcome {
        requireOwnerThread()
        if (loadedModelUri != modelUri || asset == null) {
            loadModel(context, modelUri)
        }

        val pose = VrmPoseData.parse(poseJson)
        val applied = applyPose(pose)
        val bitmap = renderBitmap()
        return RenderOutcome(bitmap, applied.first, applied.second, !descriptor.requiresMtoonFallback)
    }

    fun destroy() {
        requireOwnerThread()
        destroyModel()
        engine.flushAndWait()
        engine.destroySwapChain(swapChain)
        resourceLoader.destroy()
        assetLoader.destroy()
        materialProvider.destroyMaterials()
        materialProvider.destroy()
        lightEntities.forEach { entity ->
            engine.destroyEntity(entity)
            entityManager.destroy(entity)
        }
        engine.destroyRenderer(renderer)
        engine.destroyView(view)
        engine.destroyScene(scene)
        engine.destroyCameraComponent(cameraEntity)
        entityManager.destroy(cameraEntity)
        engine.destroy()
    }

    private fun requireOwnerThread() {
        check(Thread.currentThread() === ownerThread) {
            "Filament VRM session must stay on its engine owner thread"
        }
    }

    private fun loadModel(context: Context, modelUri: String) {
        destroyModel()
        val preparedModel = openModelInputStream(context, modelUri)
            .use(::readModelData)
            .let(::prepareVrmModelForFilament)
        val nextDescriptor = preparedModel.descriptor
        val modelBuffer = preparedModel.modelData.asBuffer()
        val nextAsset = assetLoader.createAsset(modelBuffer)
            ?: throw IllegalArgumentException("Filament could not create the VRM asset")
        try {
            require(nextAsset.resourceUris.isEmpty()) { "VRM assets must embed external resources" }
            resourceLoader.loadResources(nextAsset)
            resourceLoader.evictResourceData()
            val nextEntitiesByNodeIndex = VrmNodeEntityResolver.resolve(
                nodeLookupNames = preparedModel.nodeLookupNames,
                allowedEntities = nextAsset.instance.entities.toSet(),
                entitiesForName = nextAsset::getEntitiesByName
            )
            nextAsset.releaseSourceData()
            scene.addEntities(nextAsset.renderableEntities)
            scene.addEntities(nextAsset.lightEntities)
            descriptor = nextDescriptor
            entitiesByNodeIndex = nextEntitiesByNodeIndex
            cacheRestTransforms(nextAsset)
            configureCamera(nextAsset)
            nextAsset.instance.animator.updateBoneMatrices()
            asset = nextAsset
            loadedModelUri = modelUri
        } catch (error: Throwable) {
            scene.removeEntities(nextAsset.renderableEntities)
            scene.removeEntities(nextAsset.lightEntities)
            assetLoader.destroyAsset(nextAsset)
            resetModelState()
            throw error
        }
    }

    private fun destroyModel() {
        asset?.let { currentAsset ->
            scene.removeEntities(currentAsset.renderableEntities)
            scene.removeEntities(currentAsset.lightEntities)
            assetLoader.destroyAsset(currentAsset)
        }
        resetModelState()
    }

    private fun resetModelState() {
        asset = null
        loadedModelUri = ""
        descriptor = VrmModelDescriptor()
        entitiesByNodeIndex = emptyMap()
        restTransforms = emptyMap()
        rootEntity = 0
        rootRestTransform = AndroidVrmMath.identityMatrix()
        modelHeight = 1f
    }

    private fun cacheRestTransforms(model: FilamentAsset) {
        val transformManager = engine.transformManager
        restTransforms = buildMap {
            entitiesByNodeIndex.forEach { (nodeIndex, entity) ->
                val instance = transformManager.getInstance(entity)
                if (instance != 0) {
                    put(nodeIndex, transformManager.getTransform(instance, FloatArray(16)))
                }
            }
        }
        rootEntity = model.instance.root
        val rootInstance = transformManager.getInstance(rootEntity)
        rootRestTransform = if (rootInstance == 0) {
            AndroidVrmMath.identityMatrix()
        } else {
            transformManager.getTransform(rootInstance, FloatArray(16))
        }
    }

    private fun configureCamera(model: FilamentAsset) {
        val center = model.boundingBox.center
        val halfExtent = model.boundingBox.halfExtent
        modelHeight = max(halfExtent[1] * 2f, 0.01f)
        val aspect = RENDER_WIDTH.toDouble() / RENDER_HEIGHT.toDouble()
        val halfHeight = max(halfExtent[1].toDouble(), halfExtent[0].toDouble() / aspect) * 1.12
        val distance = halfHeight / tan(CAMERA_VERTICAL_FOV_DEGREES * PI / 360.0) + halfExtent[2]
        val maxExtent = max(max(halfExtent[0], halfExtent[1]), halfExtent[2]).toDouble().coerceAtLeast(0.01)
        val near = max(0.01, distance - maxExtent * 2.5)
        val far = max(near + 1.0, distance + maxExtent * 4.0)
        camera.setProjection(CAMERA_VERTICAL_FOV_DEGREES, aspect, near, far, Camera.Fov.VERTICAL)
        camera.lookAt(
            center[0].toDouble(), center[1].toDouble(), center[2] + distance * descriptor.cameraZSign,
            center[0].toDouble(), center[1].toDouble(), center[2].toDouble(),
            0.0, 1.0, 0.0
        )
    }

    private fun applyPose(pose: VrmPoseData): Pair<Int, Int> {
        val model = asset ?: throw IllegalStateException("VRM asset is not loaded")
        val transformManager = engine.transformManager
        var appliedBoneCount = 0

        val rootInstance = transformManager.getInstance(rootEntity)
        if (rootInstance != 0) {
            val rootTransform = rootRestTransform.copyOf()
            rootTransform[12] += pose.rootOffsetX * modelHeight
            rootTransform[13] += pose.rootOffsetY * modelHeight
            rootTransform[14] += pose.rootOffsetZ * modelHeight
            transformManager.setTransform(rootInstance, rootTransform)
        }

        descriptor.boneNodeIndices.forEach { (bone, nodeIndex) ->
            val rotation = pose.rotations[bone] ?: return@forEach
            val entity = entitiesByNodeIndex[nodeIndex] ?: return@forEach
            val baseTransform = restTransforms[nodeIndex] ?: return@forEach
            val instance = transformManager.getInstance(entity)
            if (instance == 0) {
                return@forEach
            }
            val rotationTransform = AndroidVrmMath.rotationMatrixXyz(rotation.x, rotation.y, rotation.z)
            transformManager.setTransform(instance, AndroidVrmMath.multiply(baseTransform, rotationTransform))
            appliedBoneCount += 1
        }

        val renderableManager = engine.renderableManager
        val morphWeightsByNode = linkedMapOf<Int, FloatArray>()
        descriptor.morphNodeIndices.forEach { nodeIndex ->
            val entity = entitiesByNodeIndex[nodeIndex] ?: return@forEach
            val instance = renderableManager.getInstance(entity)
            if (instance == 0) {
                return@forEach
            }
            val count = renderableManager.getMorphTargetCount(instance)
            if (count > 0) {
                morphWeightsByNode[nodeIndex] = FloatArray(count)
            }
        }

        var appliedExpressionCount = 0
        pose.expressions.forEach { (expression, expressionWeight) ->
            if (expressionWeight <= 0.001f || expression == "neutral") {
                return@forEach
            }
            var applied = false
            descriptor.expressionBinds[expression].orEmpty().forEach { bind ->
                val weights = morphWeightsByNode[bind.nodeIndex] ?: return@forEach
                if (bind.targetIndex !in weights.indices) {
                    return@forEach
                }
                weights[bind.targetIndex] = (weights[bind.targetIndex] + expressionWeight * bind.weight).coerceIn(0f, 1f)
                applied = true
            }
            if (applied) {
                appliedExpressionCount += 1
            }
        }

        morphWeightsByNode.forEach { (nodeIndex, weights) ->
            val entity = entitiesByNodeIndex[nodeIndex] ?: return@forEach
            val instance = renderableManager.getInstance(entity)
            if (instance != 0) {
                renderableManager.setMorphWeights(instance, weights, 0)
            }
        }
        model.instance.animator.updateBoneMatrices()
        return appliedBoneCount to appliedExpressionCount
    }

    private fun renderBitmap(): Bitmap {
        readbackBuffer.clear()
        var beganFrame = false
        for (attempt in 0 until 3) {
            if (renderer.beginFrame(swapChain, System.nanoTime())) {
                beganFrame = true
                break
            }
            engine.flushAndWait()
        }
        check(beganFrame) { "Filament rejected the offscreen frame" }

        val readbackComplete = CountDownLatch(1)
        try {
            renderer.render(view)
            renderer.readPixels(
                0,
                0,
                RENDER_WIDTH,
                RENDER_HEIGHT,
                Texture.PixelBufferDescriptor(
                    readbackBuffer,
                    Texture.Format.RGBA,
                    Texture.Type.UBYTE,
                    1,
                    0,
                    0,
                    0,
                    READBACK_CALLBACK_EXECUTOR,
                    Runnable { readbackComplete.countDown() }
                )
            )
        } finally {
            renderer.endFrame()
        }
        engine.flushAndWait()
        check(readbackComplete.await(READBACK_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
            "Filament VRM readback timed out"
        }

        readbackBuffer.rewind()
        val bitmap = Bitmap.createBitmap(RENDER_WIDTH, RENDER_HEIGHT, Bitmap.Config.ARGB_8888)
        bitmap.copyPixelsFromBuffer(readbackBuffer)
        bitmap.setHasAlpha(true)
        verifyTransparentModelPixels(bitmap)
        return bitmap
    }

    private fun verifyTransparentModelPixels(bitmap: Bitmap) {
        bitmap.getPixels(pixelProbe, 0, RENDER_WIDTH, 0, 0, RENDER_WIDTH, RENDER_HEIGHT)
        var visibleSamples = 0
        var index = 0
        while (index < pixelProbe.size) {
            if ((pixelProbe[index] ushr 24) > 8) {
                visibleSamples += 1
                if (visibleSamples >= MIN_VISIBLE_PIXEL_SAMPLES) {
                    break
                }
            }
            index += PIXEL_SAMPLE_STEP
        }
        check(visibleSamples >= MIN_VISIBLE_PIXEL_SAMPLES) { "Filament produced an empty VRM frame" }

        val cornerIndices = intArrayOf(0, RENDER_WIDTH - 1, pixelProbe.size - RENDER_WIDTH, pixelProbe.size - 1)
        check(cornerIndices.any { corner -> (pixelProbe[corner] ushr 24) < 32 }) {
            "Filament VRM frame did not preserve a transparent background"
        }
    }

    private fun createDirectionalLight(intensity: Float, x: Float, y: Float, z: Float): Int {
        val entity = entityManager.create()
        LightManager.Builder(LightManager.Type.DIRECTIONAL)
            .color(1f, 1f, 1f)
            .intensity(intensity)
            .direction(x, y, z)
            .castShadows(false)
            .build(engine, entity)
        return entity
    }
}

internal data class VrmModelDescriptor(
    val boneNodeIndices: Map<String, Int> = emptyMap(),
    val expressionBinds: Map<String, List<MorphBind>> = emptyMap(),
    val cameraZSign: Double = 1.0,
    val requiresMtoonFallback: Boolean = false
) {
    val morphNodeIndices: Set<Int> = expressionBinds.values.flatten().mapTo(linkedSetOf()) { it.nodeIndex }
    val referencedNodeIndices: Set<Int> = (boneNodeIndices.values + morphNodeIndices).toSet()

    fun requireValidNodeIndices(nodeCount: Int) {
        require(nodeCount > 0) { "VRM model has no scene nodes" }
        require(referencedNodeIndices.all { it in 0 until nodeCount }) { "VRM extension references an invalid scene node" }
    }

    companion object {
        fun parseGlb(modelData: VrmModelData): VrmModelDescriptor = parseJson(extractGlbJson(modelData))

        internal fun parseJson(json: JSONObject): VrmModelDescriptor {
            val extensions = json.optJSONObject("extensions") ?: throw IllegalArgumentException("VRM extension is missing")
            val vrm1 = extensions.optJSONObject("VRMC_vrm")
            if (vrm1 != null) {
                return parseVrm1(json, vrm1)
            }
            val vrm0 = extensions.optJSONObject("VRM") ?: throw IllegalArgumentException("VRM extension is missing")
            return parseVrm0(json, vrm0)
        }

        private fun parseVrm1(json: JSONObject, vrm: JSONObject): VrmModelDescriptor {
            val bones = linkedMapOf<String, Int>()
            val humanBones = vrm.optJSONObject("humanoid")?.optJSONObject("humanBones")
            humanBones?.keys()?.forEach { bone ->
                val nodeIndex = humanBones.optJSONObject(bone)?.optInt("node", -1) ?: -1
                if (nodeIndex >= 0) {
                    bones[bone.trim()] = nodeIndex
                }
            }

            val expressions = linkedMapOf<String, MutableList<MorphBind>>()
            val expressionRoot = vrm.optJSONObject("expressions")
            listOf("preset", "custom").forEach { groupName ->
                val group = expressionRoot?.optJSONObject(groupName) ?: return@forEach
                group.keys().forEach { rawName ->
                    val name = normalizeExpressionName(rawName)
                    val binds = group.optJSONObject(rawName)?.optJSONArray("morphTargetBinds") ?: return@forEach
                    appendVrm1Binds(expressions.getOrPut(name) { mutableListOf() }, binds)
                }
            }
            return VrmModelDescriptor(
                boneNodeIndices = bones,
                expressionBinds = expressions,
                cameraZSign = 1.0,
                requiresMtoonFallback = usesMtoonMaterials(json, vrm)
            )
        }

        private fun parseVrm0(json: JSONObject, vrm: JSONObject): VrmModelDescriptor {
            val bones = linkedMapOf<String, Int>()
            val humanBones = vrm.optJSONObject("humanoid")?.optJSONArray("humanBones") ?: JSONArray()
            for (index in 0 until humanBones.length()) {
                val bone = humanBones.optJSONObject(index) ?: continue
                val name = bone.optString("bone").trim()
                val nodeIndex = bone.optInt("node", -1)
                if (name.isNotEmpty() && nodeIndex >= 0) {
                    bones[name] = nodeIndex
                }
            }

            val nodes = json.optJSONArray("nodes") ?: JSONArray()
            val nodesByMesh = linkedMapOf<Int, MutableList<Int>>()
            for (nodeIndex in 0 until nodes.length()) {
                val meshIndex = nodes.optJSONObject(nodeIndex)?.optInt("mesh", -1) ?: -1
                if (meshIndex >= 0) {
                    nodesByMesh.getOrPut(meshIndex) { mutableListOf() }.add(nodeIndex)
                }
            }

            val expressions = linkedMapOf<String, MutableList<MorphBind>>()
            val groups = vrm.optJSONObject("blendShapeMaster")?.optJSONArray("blendShapeGroups") ?: JSONArray()
            for (index in 0 until groups.length()) {
                val group = groups.optJSONObject(index) ?: continue
                val preset = normalizeExpressionName(group.optString("presetName"))
                val name = if (preset.isNotBlank() && preset != "unknown") preset else normalizeExpressionName(group.optString("name"))
                if (name.isBlank() || name == "unknown") {
                    continue
                }
                val target = expressions.getOrPut(name) { mutableListOf() }
                val binds = group.optJSONArray("binds") ?: continue
                for (bindIndex in 0 until binds.length()) {
                    val bind = binds.optJSONObject(bindIndex) ?: continue
                    val meshIndex = bind.optInt("mesh", -1)
                    val targetIndex = bind.optInt("index", -1)
                    val weight = (bind.optDouble("weight", 100.0) / 100.0).toFloat().coerceIn(0f, 1f)
                    if (meshIndex < 0 || targetIndex < 0) {
                        continue
                    }
                    nodesByMesh[meshIndex].orEmpty().forEach { nodeIndex ->
                        target.add(MorphBind(nodeIndex, targetIndex, weight))
                    }
                }
            }
            return VrmModelDescriptor(
                boneNodeIndices = bones,
                expressionBinds = expressions,
                cameraZSign = -1.0,
                requiresMtoonFallback = vrm.optJSONArray("materialProperties")?.length()?.let { it > 0 } == true
            )
        }

        private fun usesMtoonMaterials(json: JSONObject, vrm: JSONObject): Boolean {
            val extensionsUsed = json.optJSONArray("extensionsUsed") ?: JSONArray()
            for (index in 0 until extensionsUsed.length()) {
                if (extensionsUsed.optString(index) == "VRMC_materials_mtoon") {
                    return true
                }
            }
            val materials = json.optJSONArray("materials") ?: JSONArray()
            for (index in 0 until materials.length()) {
                if (materials.optJSONObject(index)?.optJSONObject("extensions")?.has("VRMC_materials_mtoon") == true) {
                    return true
                }
            }
            return vrm.has("materials")
        }

        private fun appendVrm1Binds(target: MutableList<MorphBind>, binds: JSONArray) {
            for (index in 0 until binds.length()) {
                val bind = binds.optJSONObject(index) ?: continue
                val nodeIndex = bind.optInt("node", -1)
                val targetIndex = bind.optInt("index", -1)
                val weight = bind.optDouble("weight", 1.0).toFloat().coerceIn(0f, 1f)
                if (nodeIndex >= 0 && targetIndex >= 0) {
                    target.add(MorphBind(nodeIndex, targetIndex, weight))
                }
            }
        }
    }
}

internal object VrmNodeEntityResolver {
    fun resolve(
        nodeLookupNames: Map<Int, String>,
        allowedEntities: Set<Int>,
        entitiesForName: (String) -> IntArray
    ): Map<Int, Int> = buildMap {
        nodeLookupNames.toSortedMap().forEach { (nodeIndex, nodeName) ->
            val candidates = entitiesForName(nodeName).filter(allowedEntities::contains)
            require(candidates.size == 1) {
                "Prepared VRM node $nodeIndex must resolve to exactly one scene entity"
            }
            put(nodeIndex, candidates.single())
        }
        require(values.toSet().size == size) { "VRM rig nodes do not map to unique scene entities" }
    }
}

internal data class MorphBind(
    val nodeIndex: Int,
    val targetIndex: Int,
    val weight: Float
)

private data class BoneRotation(
    val x: Float,
    val y: Float,
    val z: Float
)

private data class VrmPoseData(
    val rotations: Map<String, BoneRotation> = emptyMap(),
    val expressions: Map<String, Float> = emptyMap(),
    val rootOffsetX: Float = 0f,
    val rootOffsetY: Float = 0f,
    val rootOffsetZ: Float = 0f
) {
    companion object {
        fun parse(rawJson: String): VrmPoseData {
            if (rawJson.isBlank()) {
                return VrmPoseData()
            }
            val json = JSONObject(rawJson)
            val schemaVersion = json.optInt("schemaVersion", 1)
            require(schemaVersion == 1) { "Unsupported VRM pose schema" }
            require(json.optString("rotationUnit", "degrees") == "degrees") { "Unsupported VRM rotation unit" }
            require(json.optString("rotationOrder", "XYZ") == "XYZ") { "Unsupported VRM rotation order" }
            require(json.optString("rootOffsetUnit", "model-height") == "model-height") { "Unsupported VRM root offset unit" }

            val rotations = linkedMapOf<String, BoneRotation>()
            val rotationArray = json.optJSONArray("humanoidRotations") ?: JSONArray()
            for (index in 0 until rotationArray.length()) {
                val rotation = rotationArray.optJSONObject(index) ?: continue
                val bone = rotation.optString("bone").trim()
                if (bone.isNotEmpty()) {
                    rotations[bone] = BoneRotation(
                        rotation.optDouble("x", 0.0).toFloat().coerceIn(-180f, 180f),
                        rotation.optDouble("y", 0.0).toFloat().coerceIn(-180f, 180f),
                        rotation.optDouble("z", 0.0).toFloat().coerceIn(-180f, 180f)
                    )
                }
            }

            val expressions = linkedMapOf<String, Float>()
            json.optJSONObject("expressions")?.let { expressionObject ->
                expressionObject.keys().forEach { rawName ->
                    expressions[normalizeExpressionName(rawName)] = expressionObject
                        .optDouble(rawName, 0.0)
                        .toFloat()
                        .coerceIn(0f, 1f)
                }
            }
            val root = json.optJSONObject("rootOffset")
            return VrmPoseData(
                rotations = rotations,
                expressions = expressions,
                rootOffsetX = root?.optDouble("x", 0.0)?.toFloat()?.coerceIn(-0.25f, 0.25f) ?: 0f,
                rootOffsetY = root?.optDouble("y", 0.0)?.toFloat()?.coerceIn(-0.25f, 0.25f) ?: 0f,
                rootOffsetZ = root?.optDouble("z", 0.0)?.toFloat()?.coerceIn(-0.25f, 0.25f) ?: 0f
            )
        }
    }
}

internal object AndroidVrmMath {
    fun identityMatrix(): FloatArray = floatArrayOf(
        1f, 0f, 0f, 0f,
        0f, 1f, 0f, 0f,
        0f, 0f, 1f, 0f,
        0f, 0f, 0f, 1f
    )

    fun rotationMatrixXyz(xDegrees: Float, yDegrees: Float, zDegrees: Float): FloatArray {
        val x = xDegrees * PI.toFloat() / 180f
        val y = yDegrees * PI.toFloat() / 180f
        val z = zDegrees * PI.toFloat() / 180f
        val rx = floatArrayOf(
            1f, 0f, 0f, 0f,
            0f, cos(x), sin(x), 0f,
            0f, -sin(x), cos(x), 0f,
            0f, 0f, 0f, 1f
        )
        val ry = floatArrayOf(
            cos(y), 0f, -sin(y), 0f,
            0f, 1f, 0f, 0f,
            sin(y), 0f, cos(y), 0f,
            0f, 0f, 0f, 1f
        )
        val rz = floatArrayOf(
            cos(z), sin(z), 0f, 0f,
            -sin(z), cos(z), 0f, 0f,
            0f, 0f, 1f, 0f,
            0f, 0f, 0f, 1f
        )
        return multiply(multiply(rz, ry), rx)
    }

    fun multiply(left: FloatArray, right: FloatArray): FloatArray {
        require(left.size == 16 && right.size == 16) { "Matrices must be 4x4" }
        val result = FloatArray(16)
        for (column in 0 until 4) {
            for (row in 0 until 4) {
                var value = 0f
                for (index in 0 until 4) {
                    value += left[index * 4 + row] * right[column * 4 + index]
                }
                result[column * 4 + row] = value
            }
        }
        return result
    }
}

internal data class VrmModelData(
    val bytes: ByteArray,
    val size: Int
) {
    fun asBuffer(): ByteBuffer = ByteBuffer.wrap(bytes, 0, size).slice().order(ByteOrder.nativeOrder())
}

internal data class PreparedVrmModel(
    val modelData: VrmModelData,
    val descriptor: VrmModelDescriptor,
    val nodeLookupNames: Map<Int, String>
)

internal fun prepareVrmModelForFilament(modelData: VrmModelData): PreparedVrmModel {
    val json = extractGlbJson(modelData)
    val descriptor = VrmModelDescriptor.parseJson(json)
    val nodes = json.optJSONArray("nodes") ?: JSONArray()
    descriptor.requireValidNodeIndices(nodes.length())

    val existingNames = buildSet {
        for (index in 0 until nodes.length()) {
            nodes.optJSONObject(index)?.optString("name")?.takeIf(String::isNotBlank)?.let(::add)
        }
    }
    var namespaceIndex = 0
    var namespace: String
    do {
        namespace = "__mobile_live_vrm_${namespaceIndex++}_"
    } while (descriptor.referencedNodeIndices.any { nodeIndex -> "$namespace$nodeIndex" in existingNames })

    val nodeLookupNames = descriptor.referencedNodeIndices
        .sorted()
        .associateWith { nodeIndex ->
            val node = nodes.optJSONObject(nodeIndex)
                ?: throw IllegalArgumentException("VRM node $nodeIndex is invalid")
            "$namespace$nodeIndex".also { internalName -> node.put("name", internalName) }
        }
    val preparedData = if (nodeLookupNames.isEmpty()) {
        modelData
    } else {
        replaceGlbJsonChunk(modelData, json)
    }
    return PreparedVrmModel(preparedData, descriptor, nodeLookupNames)
}

private fun replaceGlbJsonChunk(modelData: VrmModelData, json: JSONObject): VrmModelData {
    val sourceHeader = ByteBuffer.wrap(modelData.bytes, 0, modelData.size).order(ByteOrder.LITTLE_ENDIAN)
    require(sourceHeader.int == GLB_MAGIC && sourceHeader.int == GLB_VERSION) { "Invalid GLB header" }
    val declaredLength = sourceHeader.int
    val previousJsonLength = sourceHeader.int
    require(sourceHeader.int == GLB_JSON_CHUNK_TYPE) { "GLB JSON chunk is missing" }
    val previousRemainderOffset = GLB_HEADER_BYTES + previousJsonLength
    require(declaredLength in previousRemainderOffset..modelData.size) { "Invalid GLB length" }

    val jsonBytes = json.toString().toByteArray(StandardCharsets.UTF_8)
    require(jsonBytes.size <= MAX_VRM_JSON_BYTES) { "Prepared VRM JSON exceeds the mobile render limit" }
    val preparedJsonLength = (jsonBytes.size + 3) and -4
    require(preparedJsonLength <= MAX_VRM_JSON_BYTES) { "Prepared VRM JSON exceeds the mobile render limit" }
    val remainderLength = declaredLength - previousRemainderOffset
    val preparedRemainderOffset = GLB_HEADER_BYTES + preparedJsonLength
    val preparedLength = preparedRemainderOffset + remainderLength
    require(preparedLength <= MAX_VRM_MODEL_BYTES) { "Prepared VRM model exceeds the mobile render limit" }

    val target = if (preparedLength <= modelData.bytes.size) modelData.bytes else ByteArray(preparedLength)
    System.arraycopy(
        modelData.bytes,
        previousRemainderOffset,
        target,
        preparedRemainderOffset,
        remainderLength
    )
    target.fill(' '.code.toByte(), GLB_HEADER_BYTES, preparedRemainderOffset)
    System.arraycopy(jsonBytes, 0, target, GLB_HEADER_BYTES, jsonBytes.size)
    ByteBuffer.wrap(target).order(ByteOrder.LITTLE_ENDIAN).apply {
        putInt(GLB_MAGIC)
        putInt(GLB_VERSION)
        putInt(preparedLength)
        putInt(preparedJsonLength)
        putInt(GLB_JSON_CHUNK_TYPE)
    }
    return VrmModelData(target, preparedLength)
}

private fun extractGlbJson(modelData: VrmModelData): JSONObject {
    require(modelData.size >= GLB_HEADER_BYTES) { "VRM model is too small" }
    val header = ByteBuffer.wrap(modelData.bytes, 0, modelData.size).order(ByteOrder.LITTLE_ENDIAN)
    require(header.int == GLB_MAGIC) { "VRM model is not a GLB file" }
    require(header.int == GLB_VERSION) { "Unsupported GLB version" }
    val declaredLength = header.int
    val jsonLength = header.int
    val jsonType = header.int
    require(declaredLength in GLB_HEADER_BYTES..modelData.size) { "Invalid GLB length" }
    require(jsonLength in 1..MAX_VRM_JSON_BYTES && GLB_HEADER_BYTES + jsonLength <= declaredLength) { "Invalid GLB JSON chunk" }
    require(jsonType == GLB_JSON_CHUNK_TYPE) { "GLB JSON chunk is missing" }
    val jsonText = String(modelData.bytes, GLB_HEADER_BYTES, jsonLength, StandardCharsets.UTF_8)
        .trimEnd('\u0000', ' ', '\n', '\r', '\t')
    return JSONObject(jsonText)
}

private fun openModelInputStream(context: Context, rawUri: String): InputStream {
    val uri = Uri.parse(rawUri)
    return when (uri.scheme?.lowercase(Locale.US)) {
        "content" -> context.contentResolver.openInputStream(uri)
            ?: throw IllegalArgumentException("VRM model URI could not be opened")
        "file" -> FileInputStream(File(requireNotNull(uri.path)))
        null, "" -> FileInputStream(File(rawUri))
        else -> throw IllegalArgumentException("Unsupported VRM model URI scheme")
    }
}

private fun readModelData(input: InputStream): VrmModelData {
    var bytes = ByteArray(256 * 1024)
    var total = 0
    while (true) {
        if (total == bytes.size) {
            if (bytes.size == MAX_VRM_MODEL_BYTES) {
                require(input.read() < 0) { "VRM model exceeds the mobile render limit" }
                break
            }
            bytes = bytes.copyOf((bytes.size * 2).coerceAtMost(MAX_VRM_MODEL_BYTES))
        }
        val read = input.read(bytes, total, bytes.size - total)
        if (read < 0) {
            break
        }
        if (read == 0) {
            continue
        }
        total += read
        require(total <= MAX_VRM_MODEL_BYTES) { "VRM model exceeds the mobile render limit" }
    }
    return VrmModelData(bytes, total)
}

private fun normalizeExpressionName(rawName: String): String {
    return when (rawName.trim().lowercase(Locale.US)) {
        "neutral" -> "neutral"
        "a", "aa" -> "aa"
        "i", "ih" -> "ih"
        "u", "ou" -> "ou"
        "e", "ee" -> "ee"
        "o", "oh" -> "oh"
        "joy", "happy" -> "happy"
        "angry" -> "angry"
        "fun", "surprise", "surprised" -> "surprised"
        "blink" -> "blink"
        "lookleft" -> "lookLeft"
        "lookright" -> "lookRight"
        "lookup" -> "lookUp"
        "lookdown" -> "lookDown"
        "unknown" -> "unknown"
        else -> rawName.trim()
    }
}

private const val RENDERER_BACKEND = "filament-opengl-es"
private val READBACK_CALLBACK_EXECUTOR = Executor { callback -> callback.run() }
private const val RENDER_WIDTH = 512
private const val RENDER_HEIGHT = 768
private const val CAMERA_VERTICAL_FOV_DEGREES = 32.0
private const val FAILURE_RETRY_DELAY_MS = 3_000L
private const val MIN_RENDER_INTERVAL_MS = 180L
private const val READBACK_TIMEOUT_MS = 3_000L
private const val MAX_VRM_SOURCE_COUNT = 1
private const val MAX_VRM_MODEL_BYTES = 80 * 1024 * 1024
private const val MAX_VRM_JSON_BYTES = 16 * 1024 * 1024
private const val GLB_HEADER_BYTES = 20
private const val GLB_MAGIC = 0x46546C67
private const val GLB_VERSION = 2
private const val GLB_JSON_CHUNK_TYPE = 0x4E4F534A
private const val PIXEL_SAMPLE_STEP = 16
private const val MIN_VISIBLE_PIXEL_SAMPLES = 16
