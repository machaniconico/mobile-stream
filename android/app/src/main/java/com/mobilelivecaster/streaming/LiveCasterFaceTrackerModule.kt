package com.mobilelivecaster.streaming

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import androidx.core.content.ContextCompat
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceContour
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

@ReactModule(name = LiveCasterFaceTrackerModule.NAME)
class LiveCasterFaceTrackerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LiveCasterFaceTracker"
        private const val FRAME_WIDTH = 480
        private const val FRAME_HEIGHT = 360
        private const val CAMERA_PERMISSION_REQUEST = 7401
    }

    private val latestFrame = AtomicReference<NativeFaceFrame?>(null)
    private val directExecutor = Executor { command -> command.run() }
    private var startPromise: Promise? = null
    private var cameraThread: HandlerThread? = null
    private var cameraHandler: Handler? = null
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var detector: FaceDetector? = null
    private var cameraRotationDegrees = 0
    private val processingFrame = AtomicBoolean(false)
    private val permissionListener = PermissionListener { requestCode, _, _ ->
        if (requestCode != CAMERA_PERMISSION_REQUEST) return@PermissionListener false
        val promise = startPromise
        startPromise = null
        if (hasCameraPermission()) {
            try {
                startCamera()
                promise?.resolve(true)
            } catch (error: Throwable) {
                stopCamera()
                promise?.reject("face_tracker_start_failed", error)
            }
        } else {
            promise?.reject("camera_permission_missing", "Camera permission is required for face tracking")
        }
        true
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun start(optionsJson: String, promise: Promise) {
        if (!hasCameraPermission()) {
            requestCameraPermission(promise)
            return
        }

        if (cameraDevice != null || cameraThread != null) {
            promise.resolve(true)
            return
        }

        try {
            startCamera()
            promise.resolve(true)
        } catch (error: Throwable) {
            stopCamera()
            promise.reject("face_tracker_start_failed", error)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        stopCamera()
        promise.resolve(true)
    }

    @ReactMethod
    fun getLatestFrame(promise: Promise) {
        promise.resolve(latestFrame.get()?.toWritableMap())
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required by NativeEventEmitter compatibility.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required by NativeEventEmitter compatibility.
    }

    override fun invalidate() {
        stopCamera()
        super.invalidate()
    }

    @SuppressLint("MissingPermission")
    private fun startCamera() {
        cameraThread = HandlerThread("LiveCasterFaceTracker").apply { start() }
        cameraHandler = Handler(cameraThread!!.looper)
        detector = FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                .setContourMode(FaceDetectorOptions.CONTOUR_MODE_ALL)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
                .setMinFaceSize(0.16f)
                .enableTracking()
                .build()
        )

        val manager = reactContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val camera = findFrontCamera(manager)
        cameraRotationDegrees = rotationCompensation(manager, camera.id, camera.isFrontFacing)
        imageReader = ImageReader.newInstance(FRAME_WIDTH, FRAME_HEIGHT, ImageFormat.YUV_420_888, 2).apply {
            setOnImageAvailableListener({ reader ->
                val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
                processImage(image)
            }, cameraHandler)
        }

        manager.openCamera(
            camera.id,
            object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    createCaptureSession(camera)
                }

                override fun onDisconnected(camera: CameraDevice) {
                    stopCamera()
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    stopCamera()
                }
            },
            cameraHandler
        )
    }

    private fun createCaptureSession(camera: CameraDevice) {
        val reader = imageReader ?: return
        camera.createCaptureSession(
            listOf(reader.surface),
            object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                        addTarget(reader.surface)
                        set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
                    }
                    session.setRepeatingRequest(request.build(), null, cameraHandler)
                }

                override fun onConfigureFailed(session: CameraCaptureSession) {
                    stopCamera()
                }
            },
            cameraHandler
        )
    }

    private fun processImage(image: Image) {
        if (!processingFrame.compareAndSet(false, true)) {
            image.close()
            return
        }

        val activeDetector = detector
        if (activeDetector == null) {
            image.close()
            processingFrame.set(false)
            return
        }

        try {
            val input = InputImage.fromMediaImage(image, cameraRotationDegrees)
            activeDetector.process(input)
                .addOnSuccessListener(directExecutor) { faces ->
                    val largestFace = faces.maxByOrNull { face -> face.boundingBox.width() * face.boundingBox.height() }
                    val rotated = cameraRotationDegrees == 90 || cameraRotationDegrees == 270
                    val frameWidth = if (rotated) FRAME_HEIGHT else FRAME_WIDTH
                    val frameHeight = if (rotated) FRAME_WIDTH else FRAME_HEIGHT
                    latestFrame.set(largestFace?.let { face -> faceToFrame(face, frameWidth, frameHeight) } ?: lostFrame())
                }
                .addOnFailureListener(directExecutor) {
                    latestFrame.set(lostFrame())
                }
                .addOnCompleteListener(directExecutor) {
                    image.close()
                    processingFrame.set(false)
                }
        } catch (_: Throwable) {
            latestFrame.set(lostFrame())
            image.close()
            processingFrame.set(false)
        }
    }

    private fun faceToFrame(face: Face, frameWidth: Int, frameHeight: Int): NativeFaceFrame {
        val box = face.boundingBox
        val confidence = clamp(max(box.width(), box.height()).toFloat() / max(FRAME_WIDTH, FRAME_HEIGHT).toFloat() * 1.9f, 0.45f, 0.98f)
        val yaw = clamp(face.headEulerAngleY / 36f, -1f, 1f)
        val pitch = clamp(face.headEulerAngleX / 32f, -1f, 1f)
        val roll = clamp(face.headEulerAngleZ / 45f, -1f, 1f)
        val leftBlink = clamp(1f - (face.leftEyeOpenProbability ?: 1f), 0f, 1f)
        val rightBlink = clamp(1f - (face.rightEyeOpenProbability ?: 1f), 0f, 1f)
        val smile = clamp(face.smilingProbability ?: mouthSmileFallback(face), 0f, 1f)

        return NativeFaceFrame(
            yaw = yaw.toDouble(),
            pitch = pitch.toDouble(),
            roll = roll.toDouble(),
            mouthOpen = estimateMouthOpen(face).toDouble(),
            leftBlink = leftBlink.toDouble(),
            rightBlink = rightBlink.toDouble(),
            smile = smile.toDouble(),
            browRaise = estimateBrowRaise(face).toDouble(),
            confidence = confidence.toDouble(),
            timestamp = System.currentTimeMillis().toDouble(),
            faceLandmarkAnalysis = faceLandmarkAnalysis(face, frameWidth, frameHeight, confidence)
        )
    }

    private fun lostFrame(): NativeFaceFrame = NativeFaceFrame(
        yaw = 0.0,
        pitch = 0.0,
        roll = 0.0,
        mouthOpen = 0.0,
        leftBlink = 0.0,
        rightBlink = 0.0,
        smile = 0.0,
        browRaise = 0.0,
        confidence = 0.0,
        timestamp = System.currentTimeMillis().toDouble(),
        faceLandmarkAnalysis = null
    )

    private fun stopCamera() {
        try {
            captureSession?.close()
            cameraDevice?.close()
            imageReader?.close()
            detector?.close()
        } finally {
            captureSession = null
            cameraDevice = null
            imageReader = null
            detector = null
            latestFrame.set(null)
            cameraThread?.quitSafely()
            cameraThread = null
            cameraHandler = null
            processingFrame.set(false)
        }
    }

    private fun findFrontCamera(manager: CameraManager): CameraSelection {
        for (cameraId in manager.cameraIdList) {
            val characteristics = manager.getCameraCharacteristics(cameraId)
            if (characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT) {
                return CameraSelection(cameraId, true)
            }
        }
        return CameraSelection(manager.cameraIdList.first(), false)
    }

    private fun rotationCompensation(manager: CameraManager, cameraId: String, isFrontFacing: Boolean): Int {
        val rotation = reactApplicationContext.currentActivity?.windowManager?.defaultDisplay?.rotation ?: Surface.ROTATION_0
        val deviceRotation = when (rotation) {
            Surface.ROTATION_90 -> 90
            Surface.ROTATION_180 -> 180
            Surface.ROTATION_270 -> 270
            else -> 0
        }
        val sensorOrientation = manager.getCameraCharacteristics(cameraId).get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
        return if (isFrontFacing) {
            (sensorOrientation + deviceRotation) % 360
        } else {
            (sensorOrientation - deviceRotation + 360) % 360
        }
    }

    private fun estimateMouthOpen(face: Face): Float {
        val height = max(1, face.boundingBox.height()).toFloat()
        val upper = averageY(face.getContour(FaceContour.UPPER_LIP_BOTTOM)?.points)
        val lower = averageY(face.getContour(FaceContour.LOWER_LIP_TOP)?.points)
        if (upper != null && lower != null) {
            return clamp(abs(lower - upper) / height * 5.5f, 0f, 1f)
        }
        return clamp((face.smilingProbability ?: 0f) * 0.22f + max(0f, face.headEulerAngleX / 40f) * 0.18f, 0f, 1f)
    }

    private fun mouthSmileFallback(face: Face): Float {
        val left = averageY(face.getContour(FaceContour.LEFT_CHEEK)?.points)
        val right = averageY(face.getContour(FaceContour.RIGHT_CHEEK)?.points)
        val mouth = averageY(face.getContour(FaceContour.LOWER_LIP_TOP)?.points)
        if (left != null && right != null && mouth != null) {
            return clamp(((left + right) * 0.5f - mouth) / max(1, face.boundingBox.height()).toFloat() * 6f + 0.45f, 0f, 1f)
        }
        return 0f
    }

    private fun estimateBrowRaise(face: Face): Float {
        val height = max(1, face.boundingBox.height()).toFloat()
        val eyeY = averageY(
            listOfNotNull(
                face.getContour(FaceContour.LEFT_EYE)?.points,
                face.getContour(FaceContour.RIGHT_EYE)?.points
            ).flatten()
        )
        val browY = averageY(
            listOfNotNull(
                face.getContour(FaceContour.LEFT_EYEBROW_TOP)?.points,
                face.getContour(FaceContour.RIGHT_EYEBROW_TOP)?.points
            ).flatten()
        )
        if (eyeY != null && browY != null) {
            return clamp(((eyeY - browY) / height - 0.075f) * 7.5f, 0f, 1f)
        }
        return clamp(0.24f + max(0f, -face.headEulerAngleX / 35f) * 0.28f, 0f, 1f)
    }

    private fun faceLandmarkAnalysis(face: Face, frameWidth: Int, frameHeight: Int, confidence: Float): WritableMap {
        val box = face.boundingBox
        val top = normalizeY(box.top.toFloat(), frameHeight)
        val height = clamp(box.height().toFloat() / max(1, frameHeight).toFloat(), 0f, 1f)
        return Arguments.createMap().apply {
            putDouble("confidence", confidence.toDouble())
            putMap("faceCenter", normalizedPoint(box.centerX().toFloat(), box.top + box.height() * 0.54f, frameWidth, frameHeight, confidence))
            putNullablePoint(
                "leftEye",
                averagePoint(face.getContour(FaceContour.LEFT_EYE)?.points)
                    ?: face.getLandmark(FaceLandmark.LEFT_EYE)?.position,
                frameWidth,
                frameHeight,
                confidence
            )
            putNullablePoint(
                "rightEye",
                averagePoint(face.getContour(FaceContour.RIGHT_EYE)?.points)
                    ?: face.getLandmark(FaceLandmark.RIGHT_EYE)?.position,
                frameWidth,
                frameHeight,
                confidence
            )
            putNullablePoint(
                "mouthCenter",
                averagePoint(
                    listOfNotNull(
                        face.getContour(FaceContour.UPPER_LIP_BOTTOM)?.points,
                        face.getContour(FaceContour.LOWER_LIP_TOP)?.points
                    ).flatten()
                ) ?: face.getLandmark(FaceLandmark.MOUTH_BOTTOM)?.position,
                frameWidth,
                frameHeight,
                confidence
            )
            putDouble("hairLineY", clamp(top - height * 0.18f, 0f, 1f).toDouble())
            putDouble("shoulderLineY", clamp(top + height * 1.58f, 0f, 1f).toDouble())
        }
    }

    private fun WritableMap.putNullablePoint(
        key: String,
        point: android.graphics.PointF?,
        frameWidth: Int,
        frameHeight: Int,
        confidence: Float
    ) {
        if (point == null) {
            putNull(key)
        } else {
            putMap(key, normalizedPoint(point.x, point.y, frameWidth, frameHeight, confidence))
        }
    }

    private fun normalizedPoint(x: Float, y: Float, frameWidth: Int, frameHeight: Int, confidence: Float): WritableMap =
        Arguments.createMap().apply {
            putDouble("x", normalizeX(x, frameWidth).toDouble())
            putDouble("y", normalizeY(y, frameHeight).toDouble())
            putDouble("confidence", confidence.toDouble())
        }

    private fun normalizeX(x: Float, frameWidth: Int): Float = clamp(x / max(1, frameWidth).toFloat(), 0f, 1f)

    private fun normalizeY(y: Float, frameHeight: Int): Float = clamp(y / max(1, frameHeight).toFloat(), 0f, 1f)

    private fun averagePoint(points: List<android.graphics.PointF>?): android.graphics.PointF? {
        if (points.isNullOrEmpty()) {
            return null
        }
        val x = points.sumOf { point -> point.x.toDouble() }.toFloat() / points.size
        val y = points.sumOf { point -> point.y.toDouble() }.toFloat() / points.size
        return android.graphics.PointF(x, y)
    }

    private fun averageY(points: List<android.graphics.PointF>?): Float? {
        if (points.isNullOrEmpty()) {
            return null
        }
        return points.sumOf { point -> point.y.toDouble() }.toFloat() / points.size
    }

    private fun hasCameraPermission(): Boolean =
        ContextCompat.checkSelfPermission(reactContext, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun requestCameraPermission(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity !is PermissionAwareActivity) {
            promise.reject("permission_activity_unavailable", "Android activity cannot request camera permission")
            return
        }
        if (startPromise != null) {
            promise.reject("permission_request_pending", "Camera permission request is already pending")
            return
        }
        startPromise = promise
        activity.requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST, permissionListener)
    }

    private fun clamp(value: Float, minValue: Float, maxValue: Float): Float = min(maxValue, max(minValue, value))

    private data class CameraSelection(
        val id: String,
        val isFrontFacing: Boolean
    )

    private data class NativeFaceFrame(
        val yaw: Double,
        val pitch: Double,
        val roll: Double,
        val mouthOpen: Double,
        val leftBlink: Double,
        val rightBlink: Double,
        val smile: Double,
        val browRaise: Double,
        val confidence: Double,
        val timestamp: Double,
        val faceLandmarkAnalysis: WritableMap?
    ) {
        fun toWritableMap(): WritableMap = Arguments.createMap().apply {
            putDouble("yaw", yaw)
            putDouble("pitch", pitch)
            putDouble("roll", roll)
            putDouble("mouthOpen", mouthOpen)
            putDouble("leftBlink", leftBlink)
            putDouble("rightBlink", rightBlink)
            putDouble("smile", smile)
            putDouble("browRaise", browRaise)
            putDouble("confidence", confidence)
            putDouble("timestamp", timestamp)
            if (faceLandmarkAnalysis == null) {
                putNull("faceLandmarkAnalysis")
            } else {
                putMap("faceLandmarkAnalysis", faceLandmarkAnalysis)
            }
        }
    }
}
