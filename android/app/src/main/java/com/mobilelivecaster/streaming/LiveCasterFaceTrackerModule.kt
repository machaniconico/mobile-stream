package com.mobilelivecaster.streaming

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.PointF
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
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
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

@ReactModule(name = LiveCasterFaceTrackerModule.NAME)
class LiveCasterFaceTrackerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LiveCasterFaceTracker"
        private const val FRAME_WIDTH = 320
        private const val FRAME_HEIGHT = 240
        private const val CAMERA_PERMISSION_REQUEST = 7401
    }

    private val latestFrame = AtomicReference<NativeFaceFrame?>(null)
    private var startPromise: Promise? = null
    private var cameraThread: HandlerThread? = null
    private var cameraHandler: Handler? = null
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var detector: android.media.FaceDetector? = null
    private var processingFrame = false
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
        detector = android.media.FaceDetector(FRAME_WIDTH, FRAME_HEIGHT, 1)

        val manager = reactContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = findFrontCameraId(manager)
        imageReader = ImageReader.newInstance(FRAME_WIDTH, FRAME_HEIGHT, ImageFormat.YUV_420_888, 2).apply {
            setOnImageAvailableListener({ reader ->
                val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
                processImage(image)
            }, cameraHandler)
        }

        manager.openCamera(
            cameraId,
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
        if (processingFrame) {
            image.close()
            return
        }

        processingFrame = true
        try {
            val bitmap = yPlaneToBitmap(image)
            val faces = arrayOfNulls<android.media.FaceDetector.Face>(1)
            val count = detector?.findFaces(bitmap, faces) ?: 0
            latestFrame.set(if (count > 0 && faces[0] != null) faceToFrame(faces[0]!!) else lostFrame())
        } catch (_: Throwable) {
            latestFrame.set(lostFrame())
        } finally {
            image.close()
            processingFrame = false
        }
    }

    private fun yPlaneToBitmap(image: Image): Bitmap {
        val plane = image.planes[0]
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val pixels = IntArray(FRAME_WIDTH * FRAME_HEIGHT)

        for (y in 0 until FRAME_HEIGHT) {
            val rowOffset = y * rowStride
            for (x in 0 until FRAME_WIDTH) {
                val value = buffer.get(rowOffset + x).toInt() and 0xff
                pixels[y * FRAME_WIDTH + x] = 0xff000000.toInt() or (value shl 16) or (value shl 8) or value
            }
        }

        return Bitmap.createBitmap(pixels, FRAME_WIDTH, FRAME_HEIGHT, Bitmap.Config.RGB_565)
    }

    private fun faceToFrame(face: android.media.FaceDetector.Face): NativeFaceFrame {
        val midpoint = PointF()
        face.getMidPoint(midpoint)
        val eyeDistance = max(1f, face.eyesDistance())
        val centerX = (midpoint.x / FRAME_WIDTH - 0.5f) * 2f
        val centerY = (midpoint.y / FRAME_HEIGHT - 0.5f) * 2f
        val yaw = clamp(centerX + face.pose(android.media.FaceDetector.Face.EULER_Y) / 45f, -1f, 1f)
        val pitch = clamp(centerY * -0.8f + face.pose(android.media.FaceDetector.Face.EULER_X) / 45f, -1f, 1f)
        val roll = clamp(face.pose(android.media.FaceDetector.Face.EULER_Z) / 45f, -1f, 1f)
        val confidence = clamp(face.confidence(), 0f, 1f)
        val faceScale = clamp(eyeDistance / (FRAME_WIDTH * 0.22f), 0f, 1f)

        return NativeFaceFrame(
            yaw = yaw.toDouble(),
            pitch = pitch.toDouble(),
            roll = roll.toDouble(),
            mouthOpen = (0.18 + abs(pitch) * 0.26 + faceScale * 0.08).toDouble(),
            leftBlink = 0.0,
            rightBlink = 0.0,
            smile = (0.25 + confidence * 0.22).toDouble(),
            browRaise = (0.22 + max(0f, -pitch) * 0.35).toDouble(),
            confidence = confidence.toDouble(),
            timestamp = System.currentTimeMillis().toDouble()
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
        timestamp = System.currentTimeMillis().toDouble()
    )

    private fun stopCamera() {
        try {
            captureSession?.close()
            cameraDevice?.close()
            imageReader?.close()
        } finally {
            captureSession = null
            cameraDevice = null
            imageReader = null
            detector = null
            latestFrame.set(null)
            cameraThread?.quitSafely()
            cameraThread = null
            cameraHandler = null
            processingFrame = false
        }
    }

    private fun findFrontCameraId(manager: CameraManager): String {
        for (cameraId in manager.cameraIdList) {
            val characteristics = manager.getCameraCharacteristics(cameraId)
            if (characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT) {
                return cameraId
            }
        }
        return manager.cameraIdList.first()
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
        val timestamp: Double
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
        }
    }
}
