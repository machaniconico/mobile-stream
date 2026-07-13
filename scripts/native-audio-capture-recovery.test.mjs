import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const recoveryState = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidAudioCaptureRecoveryState.kt",
  "utf8"
);
const microphoneCapture = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidMicrophoneAudioCapture.kt",
  "utf8"
);
const playbackCapture = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidPlaybackAudioCapture.kt",
  "utf8"
);
const directStream = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidMediaCodecDirectStream.kt",
  "utf8"
);
const directPublisher = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidMediaCodecRtmpPublisher.kt",
  "utf8"
);
const rtmpDisconnectAwaiter = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidRtmpDisconnectAwaiter.kt",
  "utf8"
);
const androidProguardRules = readFileSync("android/app/proguard-rules.pro", "utf8");
const androidBuildGradle = readFileSync("android/app/build.gradle", "utf8");
const androidNativeVerifier = readFileSync("scripts/verify-android-native.mjs", "utf8");
const nativeOwnerRestartGuard = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidNativeOwnerRestartGuard.kt",
  "utf8"
);
const nativeCleanupPendingGate = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidNativeCleanupPendingGate.kt",
  "utf8"
);
const nativeOwnerReleaseState = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidNativeOwnerReleaseState.kt",
  "utf8"
);
const audioCadence = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidAudioCadenceState.kt",
  "utf8"
);
const androidRuntime = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/LiveCasterModule.kt",
  "utf8"
);
const mediaProjectionService = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/MediaProjectionService.kt",
  "utf8"
);
const nativeModule = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/LiveCasterNativeModule.kt",
  "utf8"
);
const nativeRuntime = readFileSync("src/domain/nativeRuntime.ts", "utf8");
const sessionSummary = readFileSync("src/domain/streamSessionSummary.ts", "utf8");
const diagnostics = readFileSync("src/domain/streamDiagnostics.ts", "utf8");
const supportBundle = readFileSync("src/domain/supportBundle.ts", "utf8");

const captureRecoveryKeys = [
  "micCaptureStatus",
  "micCaptureBackend",
  "micCaptureSampleRate",
  "micCaptureLifecycleEventCount",
  "micCaptureRouteChangeCount",
  "micCaptureInterruptionCount",
  "micCaptureRecoveryCount",
  "micCaptureRecoveryFailureCount",
  "micCaptureUnrecoveredEventCount",
  "micCaptureFallbackFrames",
  "micCaptureLastRecoveryReason",
  "micCaptureLastRecoveryAt",
  "micCaptureSuspended",
  "playbackCaptureLifecycleEventCount",
  "playbackCaptureRouteChangeCount",
  "playbackCaptureInterruptionCount",
  "playbackCaptureRecoveryCount",
  "playbackCaptureRecoveryFailureCount",
  "playbackCaptureUnrecoveredEventCount",
  "playbackCaptureLastRecoveryReason",
  "playbackCaptureLastRecoveryAt",
  "playbackCaptureSuspended"
];

describe("native Android audio capture recovery", () => {
  it("uses generation-safe bounded recovery for hard errors and zero-read stalls", () => {
    expect(recoveryState).toContain('"capture-dead-object"');
    expect(recoveryState).toContain('"capture-zero-read-stall"');
    expect(recoveryState).toContain("ZERO_READ_STALL_MS = 1_000L");
    expect(recoveryState).toContain("BASE_RETRY_DELAY_MS = 250L");
    expect(recoveryState).toContain("MAX_RETRY_DELAY_MS = 4_000L");
    expect(recoveryState).toContain("MAX_CONSECUTIVE_RECOVERY_FAILURES = 6");
    expect(recoveryState).toContain("wallClockNowMs: () -> Long = System::currentTimeMillis");
    expect(recoveryState).toContain('recordFatalLocked("capture-bad-value")');
    expect(recoveryState).toContain('recordFatalLocked("capture-recovery-circuit-open")');
    expect(recoveryState).toContain("recordPolicySilenced(isSilenced: Boolean)");
    expect(recoveryState).toContain("pendingRecovery?.generation != request.generation");
    expect(recoveryState).toContain("unrecoveredEventCount += 1L");
    expect(recoveryState).toContain("unrecoveredEventCount = 0L");
  });

  it("observes microphone route and framework-silencing changes without mutating AudioRecord on callbacks", () => {
    const recordCallbackSection = microphoneCapture.slice(
      microphoneCapture.indexOf("private fun createHandle("),
      microphoneCapture.indexOf("private fun registerRecordCallbacks(")
    );
    const modeCallbackSection = microphoneCapture.slice(
      microphoneCapture.indexOf("private fun handleAudioModeChanged("),
      microphoneCapture.indexOf("private fun reportFatalError(")
    );
    expect(microphoneCapture).toContain("AudioRouting.OnRoutingChangedListener");
    expect(microphoneCapture).toContain("handle.record.registerAudioRecordingCallback(");
    expect(microphoneCapture).toContain("configuration.isClientSilenced");
    expect(microphoneCapture).toContain("ensureAudioRecord(sessionGeneration)");
    expect(microphoneCapture).toContain("recordRecoverySuccess(request");
    expect(microphoneCapture).toContain("recordRecoveryFailure(request)");
    expect(microphoneCapture).toContain("AndroidMicrophonePcmBuffer(");
    expect(microphoneCapture).toContain("AudioManager.OnModeChangedListener");
    expect(microphoneCapture.indexOf("registerRecordCallbacks(handle)")).toBeLessThan(
      microphoneCapture.indexOf("record.startRecording()")
    );
    expect(playbackCapture.indexOf("record.registerAudioRecordingCallback(")).toBeLessThan(
      playbackCapture.indexOf("record.startRecording()")
    );
    expect(recordCallbackSection).not.toContain("requestRecordReplacement(");
    expect(modeCallbackSection).not.toContain("detachRecord(");
  });

  it("keeps playback capture supervised after read and initialization failures", () => {
    expect(playbackCapture).toContain("while (isSessionActive(sessionGeneration))");
    expect(playbackCapture).toContain("val record = ensureAudioRecord(sessionGeneration)");
    expect(playbackCapture).toContain("lifecycleGeneration.incrementAndGet()");
    expect(playbackCapture).toContain("detachRecordForSession(sessionGeneration)");
    expect(playbackCapture).toContain("recordReadException()");
    expect(playbackCapture).toContain("recordRecoveryFailure(request)");
    expect(playbackCapture).not.toContain("running.set(false)\n                break");
    const playbackFactory = playbackCapture.slice(
      playbackCapture.indexOf("private fun createApi29AudioRecord("),
      playbackCapture.indexOf("private val appContext")
    );
    expect(playbackFactory).toContain("val record = AudioRecord.Builder()");
    expect(playbackFactory).not.toContain("record.release()");
    expect(playbackCapture).toContain("initialAudioRecord = null");
    const playbackStartOwner = playbackCapture.slice(
      playbackCapture.indexOf("private fun startAudioRecord("),
      playbackCapture.indexOf("private fun attachRecord(")
    );
    expect(playbackStartOwner).toContain("record.state == AudioRecord.STATE_INITIALIZED");
    expect(playbackStartOwner).toContain("releaseRecord(handle)");
  });

  it("keeps AudioRecord release on its reader and fails closed at bounded owner deadlines", () => {
    const micStop = microphoneCapture.slice(
      microphoneCapture.indexOf("fun stop()"),
      microphoneCapture.indexOf("fun awaitStopped(")
    );
    const playbackStop = playbackCapture.slice(
      playbackCapture.indexOf("fun stop()"),
      playbackCapture.indexOf("fun awaitStopped(")
    );
    expect(micStop).not.toContain("releaseRecord(");
    expect(playbackStop).not.toContain("releaseRecord(");
    expect(micStop).not.toContain("join(");
    expect(playbackStop).not.toContain("join(");
    expect(microphoneCapture).toContain("AudioRecord.READ_NON_BLOCKING");
    expect(playbackCapture).toContain("AudioRecord.READ_NON_BLOCKING");
    expect(microphoneCapture).toContain("fun awaitStopped(deadlineNanos: Long): Boolean");
    expect(playbackCapture).toContain("fun awaitStopped(deadlineNanos: Long): Boolean");
    expect(directStream).toContain('Thread(::releaseResourcesAfterStop, "MLC-MediaCodec-Stop")');
    expect(directStream).toContain("awaitWorkersUntil(");
    expect(directStream).toContain("forceUnblockWorkers()");
    expect(directStream).not.toContain("private fun awaitWorkers()");
    expect(directStream).toContain("awaitAndroidWorkerThreadsUntil(");
    expect(directStream).not.toContain('"MLC-MediaCodec-Late-Finalizer"');
    const directCleanup = directStream.slice(
      directStream.indexOf("private fun releaseResourcesAfterStop()"),
      directStream.indexOf("fun updateComposition(")
    );
    expect(directCleanup).toContain("if (workersStopped)");
    expect(directCleanup).toContain("MediaCodec worker shutdown exceeded the 3 second escalation deadline");
    expect(directCleanup).toContain('stopAndReleaseWithRetry("Video")');
    expect(directCleanup).toContain('stopAndReleaseWithRetry("Audio")');
    expect(directCleanup).toContain('ownerName = "RTMP publisher"');
    expect(directCleanup).toContain("release = publisher::disconnectAndAwait");
    expect(directCleanup).not.toContain("runCatchingStopAndRelease");
    expect(directCleanup).toContain("releaseNativeOwnerWithRetry(");
    expect(directStream).toContain("NATIVE_OWNER_RELEASE_TIMEOUT_MILLIS = 5_000L");
    expect(directStream).toContain("ownerReleaseFailure()?.let");
    expect(microphoneCapture).toContain("fun ownerReleaseFailure(): Throwable?");
    expect(playbackCapture).toContain("fun ownerReleaseFailure(): Throwable?");
    expect(microphoneCapture).toContain("workerFatalError.get() ?: ownerReleaseState.failure()");
    expect(playbackCapture).toContain("workerFatalError.get() ?: ownerReleaseState.failure()");
    expect(microphoneCapture).toContain("workerFatalError.compareAndSet(null, error)");
    expect(playbackCapture).toContain("workerFatalError.compareAndSet(null, error)");
    expect(microphoneCapture).not.toContain("val recording = runCatching");
    expect(playbackCapture).not.toContain("val recording = runCatching");
    expect(nativeOwnerReleaseState).toContain("firstFailure.compareAndSet(null, error)");
    expect(nativeOwnerReleaseState).toContain("fatalError?.let { throw it }");
    expect(directStream).toContain('val exhaustion = if (attempt == maxAttempts) ", exhausted" else ""');
    const ownerReleasePolicy = directStream.slice(
      directStream.indexOf("internal fun releaseNativeOwnerWithRetry("),
      directStream.indexOf("internal class AndroidActiveEncoderProbeState")
    );
    expect(ownerReleasePolicy).toContain("catch (error: Exception)");
    expect(ownerReleasePolicy).not.toContain("catch (error: Throwable)");
    expect(directCleanup).toContain("completeStopCallbacks(result)");
    expect(directCleanup).not.toContain("callback -> runCatching");
    expect(directCleanup).toContain("fatalCallbackError");
    expect(directCleanup.indexOf("completeStopCallbacks(result)")).toBeLessThan(
      directCleanup.indexOf("private fun completeStopCallbacks(")
    );
    expect(directCleanup).toContain("AndroidDirectStreamCleanupResult.exhausted(lastError)");
    expect(directCleanup).toContain("AndroidDirectStreamCleanupResult.fatal(");
    expect(directStream).toContain("private val workerFatalError = AtomicReference<Error?>(null)");
    expect(directStream).toContain("workerFatalError.compareAndSet(null, error)");
    expect(directCleanup).toContain("workerFatalError.get()?.let");
    const compositeFrame = directStream.slice(
      directStream.indexOf("private fun renderCompositeFrame("),
      directStream.indexOf("private fun drainVideoEncoderOutput(")
    );
    expect(compositeFrame).toContain("if (error is Error) throw error");
    const publisherConfiguration = directStream.slice(
      directStream.indexOf("private fun configurePublisherFromVideoFormat("),
      directStream.indexOf("private fun recordVideoOutputFormat(")
    );
    expect(publisherConfiguration).toContain("catch (error: Throwable)");
    expect(publisherConfiguration).toContain("if (error is Error) throw error");
    const videoInputRelease = directCleanup.slice(
      directCleanup.indexOf("releaseVideoInputs()?.let"),
      directCleanup.indexOf("videoThread = null")
    );
    expect(videoInputRelease).toContain("catch (error: Throwable)");
    expect(directCleanup.indexOf("releaseVideoInputs()?.let")).toBeLessThan(
      directCleanup.indexOf('stopAndReleaseWithRetry("Video")')
    );
    expect(directCleanup.indexOf('stopAndReleaseWithRetry("Video")')).toBeLessThan(
      directCleanup.indexOf('ownerName = "RTMP publisher"')
    );
    expect(mediaProjectionService).toContain("directCleanupPending = true");
    expect(mediaProjectionService).toContain("finishSharedStreamResourceRelease()");
    expect(mediaProjectionService).toContain("streamResourceReleaseCallbacks");
    expect(mediaProjectionService).toContain("Direct stream final snapshot failed:");
    const directServiceCleanup = mediaProjectionService.slice(
      mediaProjectionService.indexOf("private fun releaseStreamResources("),
      mediaProjectionService.indexOf("private fun finishSharedStreamResourceRelease()")
    );
    expect(directServiceCleanup).toContain("if (!cleanupResult.released)");
    expect(directServiceCleanup).toContain("catch (error: Error)");
    expect(directServiceCleanup.indexOf("directStream.snapshot().encoderProbe")).toBeLessThan(
      directServiceCleanup.indexOf("directStream.stop { cleanupResult ->")
    );
    expect(directServiceCleanup.indexOf("directStream.stop { cleanupResult ->")).toBeLessThan(
      directServiceCleanup.indexOf("fatalReleaseError?.let { throw it }")
    );
    const directCleanupCallback = directServiceCleanup.slice(
      directServiceCleanup.indexOf("if (!cleanupResult.released)"),
      directServiceCleanup.indexOf("fatalCallbackError?.let")
    );
    expect(directCleanupCallback.indexOf("blockNativeRestartForCleanup(")).toBeLessThan(
      directCleanupCallback.indexOf("directCleanupPending = false")
    );
    const startGuard = mediaProjectionService.slice(
      mediaProjectionService.indexOf("private fun startStreamFromSession("),
      mediaProjectionService.indexOf("val profile = LiveCasterSession.profile")
    );
    expect(startGuard).toContain("resolveAndroidStreamStartDisposition(");
    expect(startGuard).toContain("ownerRestartBlocked = AndroidNativeOwnerRestartGuard.reason() != null");
    expect(startGuard).toContain("processCleanupPending = AndroidNativeCleanupPendingGate.isPending()");
    expect(startGuard).toContain("AndroidStreamStartDisposition.OWNER_CLEANUP_FAILED");
    expect(startGuard).toContain("AndroidStreamStartDisposition.CLEANUP_PENDING");
    expect(startGuard).toContain("AndroidStreamStartDisposition.ALREADY_ACTIVE");
    const cleanupPendingBranch = startGuard.slice(
      startGuard.indexOf("AndroidStreamStartDisposition.CLEANUP_PENDING"),
      startGuard.indexOf("AndroidStreamStartDisposition.ALREADY_ACTIVE")
    );
    expect(cleanupPendingBranch).not.toContain("stopSelf()");
    const directStart = mediaProjectionService.slice(
      mediaProjectionService.indexOf("private fun startDirectMediaCodecStream("),
      mediaProjectionService.indexOf("private fun reconnectStream(")
    );
    expect(directStart).toContain("check(directMediaCodecStream == null)");
    expect(directStart).not.toContain("directMediaCodecStream?.stop()");
    const serviceStartLifecycle = mediaProjectionService.slice(
      mediaProjectionService.indexOf("private fun startStreamFromSession("),
      mediaProjectionService.indexOf("private fun startDirectMediaCodecStream(")
    );
    expect(serviceStartLifecycle).toContain("catch (error: Exception)");
    expect(serviceStartLifecycle).toContain("catch (error: Error)");
    expect(serviceStartLifecycle).toContain("stopAfterFatalError(error,");
    const nativeStart = nativeModule.slice(
      nativeModule.indexOf("fun start(promise: Promise)"),
      nativeModule.indexOf("fun stop(promise: Promise)")
    );
    expect(nativeStart).toContain("AndroidNativeOwnerRestartGuard.reason()?.let");
    expect(nativeStart).toContain("AndroidNativeCleanupPendingGate.isPending()");
    expect(nativeStart).toContain('promise.reject("native_cleanup_pending"');
    expect(nativeStart).toContain('promise.reject("native_restart_required"');
    expect(nativeStart).toContain("LiveCasterSession.isStreamStartCommitted()");
    expect(nativeStart).toContain('promise.reject("stream_active"');
    const serviceStop = mediaProjectionService.slice(
      mediaProjectionService.indexOf("private fun stopStream()"),
      mediaProjectionService.indexOf("private fun updateStreamQuality()")
    );
    expect(serviceStop).toContain("val restartRequired = AndroidNativeOwnerRestartGuard.reason()");
    expect(serviceStop).toContain("LiveCasterSession.markStopped()");
    expect(serviceStop).toContain("LiveCasterSession.fail(restartRequired)");
    expect(serviceStop).toContain("finally {");
    expect(serviceStop).toContain("releaseStreamResources {");
    expect(nativeOwnerRestartGuard).toContain("blockedReason.compareAndSet(null, normalized)");
    expect(nativeCleanupPendingGate).toContain("activeGenerations += token.generation");
    expect(nativeCleanupPendingGate).toContain("activeGenerations.remove(token.generation)");
    expect(nativeCleanupPendingGate).toContain("activeGenerations.isNotEmpty()");
    const captureConsentResult = nativeModule.slice(
      nativeModule.indexOf("override fun onActivityResult("),
      nativeModule.indexOf("init {")
    );
    expect(captureConsentResult).toContain("AndroidNativeCleanupPendingGate.isPending()");
    expect(captureConsentResult).toContain('promise.reject("native_cleanup_pending"');
    expect(captureConsentResult.indexOf("AndroidNativeCleanupPendingGate.isPending()")).toBeLessThan(
      captureConsentResult.indexOf("LiveCasterSession.commitCaptureConsent(")
    );
    const failureStop = mediaProjectionService.slice(
      mediaProjectionService.indexOf("private fun stopStreamAfterFailure("),
      mediaProjectionService.indexOf("private fun handleDirectStreamFatalError(")
    );
    expect(failureStop.indexOf("beginNativeCleanup()")).toBeLessThan(
      failureStop.indexOf("LiveCasterSession.fail(message)")
    );
    expect(failureStop.indexOf("LiveCasterSession.fail(message)")).toBeLessThan(
      failureStop.indexOf("releaseStreamResources {")
    );
    expect(failureStop).toContain("finally {");
    expect(failureStop).toMatch(/releaseStreamResources\s*\{\s*stopSelf\(\)\s*\}/);
    const sharedRelease = mediaProjectionService.slice(
      mediaProjectionService.indexOf("private fun finishSharedStreamResourceRelease()"),
      mediaProjectionService.indexOf("private fun attachMediaProjection(")
    );
    expect(sharedRelease).toContain("releaseState.execute(");
    expect(sharedRelease).toContain("finally {");
    expect(sharedRelease).toContain("sharedStreamResourcesReleased = true");
    expect(sharedRelease).toContain("completeNativeCleanup()");
    expect(sharedRelease).toContain("blockNativeRestartForCleanup(");
    expect(sharedRelease.indexOf("releaseMediaProjection()")).toBeLessThan(
      sharedRelease.indexOf("callbacks.forEach")
    );
    const projectionRelease = mediaProjectionService.slice(
      mediaProjectionService.indexOf("private fun releaseMediaProjection()"),
      mediaProjectionService.indexOf("private fun blockNativeRestartForCleanup(")
    );
    expect(projectionRelease).toContain("projectionStopConfirmed = projection == null");
    expect(projectionRelease).toContain("releaseState.execute(");
    expect(projectionRelease).toContain("finally {");
    expect(projectionRelease).toContain("released = projectionStopConfirmed");
  });

  it("awaits RootEncoder sender, socket, and coroutine shutdown before publishing stop completion", () => {
    expect(directPublisher).toContain("fun disconnectAndAwait()");
    expect(directPublisher).toContain("AndroidRtmpDisconnectAwaiter.disconnectAndAwait(client)");
    expect(directPublisher).not.toContain("client.disconnect()");
    expect(rtmpDisconnectAwaiter).toContain("runBlocking");
    expect(rtmpDisconnectAwaiter).toContain("invokeReflectedSuspendMethod(");
    expect(rtmpDisconnectAwaiter).toContain('getDeclaredMethod(\n        "disconnect"');
    expect(rtmpDisconnectAwaiter).toContain("Boolean::class.javaPrimitiveType!!");
    expect(rtmpDisconnectAwaiter).toContain("Continuation::class.java");
    expect(rtmpDisconnectAwaiter).toContain("COROUTINE_SUSPENDED");
    expect(androidProguardRules).toContain("private java.lang.Object disconnect(boolean, kotlin.coroutines.Continuation);");
    expect(androidBuildGradle).toContain("contractMinified {");
    expect(androidBuildGradle).toContain("minifyEnabled true");
    expect(androidBuildGradle).toContain("def enableProguardInReleaseBuilds = true");
    expect(androidNativeVerifier).toContain("assembleContractMinified");
    expect(androidNativeVerifier).toContain("verifyRootEncoderR8Contract();");
    expect(androidNativeVerifier).toContain(
      "com.pedro.rtmp.rtmp.RtmpClient: java.lang.Object disconnect(boolean,kotlin.coroutines.Continuation)"
    );
  });

  it("preserves AAC cadence with measured microphone fallback frames", () => {
    expect(directStream).toContain("AndroidAudioCadenceState(");
    expect(directStream).toContain("cadence.nextPresentationTimeUs(processed.size, System.nanoTime())");
    expect(directStream).toContain("cadence.delayUntilNextChunkNanos(System.nanoTime())");
    expect(directStream).toContain("microphoneAudioCapture?.recordFallbackFrames(");
    expect(directStream).toContain("Pcm16AudioMixer.upmixMonoToStereo(micReadBuffer, micReadBuffer.size)");
    expect(directStream).toContain("LockSupport.parkNanos(delayNanos)");
    expect(audioCadence).toContain("delayNanos <= -chunkDurationNanos");
    expect(audioCadence).toContain("elapsedChunkCount * nominalFramesPerChunk");
  });

  it("fails the owning foreground service after a terminal microphone or encoder error", () => {
    expect(directStream).toContain("private val onFatalError: (AndroidMediaCodecDirectStream, String) -> Unit");
    expect(directStream).toContain("onFatalError(this, resolvedMessage)");
    expect(mediaProjectionService).toContain("::handleDirectStreamFatalError");
    expect(mediaProjectionService).toContain("directMediaCodecStream !== failedStream");
    expect(mediaProjectionService).toContain("stopStreamAfterFailure(message)");
    const renderFailure = directStream.slice(
      directStream.indexOf("private fun renderCompositeFrame("),
      directStream.indexOf("private fun drainVideoEncoderOutput(")
    );
    const publisherConfiguration = directStream.slice(
      directStream.indexOf("private fun configurePublisherFromVideoFormat("),
      directStream.indexOf("private fun recordVideoOutputFormat(")
    );
    const videoPublisherSend = directStream.slice(
      directStream.indexOf("private fun drainVideoEncoderOutput("),
      directStream.indexOf("private fun runAudioEncoder(")
    );
    const audioPublisherSend = directStream.slice(
      directStream.indexOf("private fun drainAudioOutput("),
      directStream.indexOf("private fun configurePublisherFromVideoFormat(")
    );
    expect(renderFailure).toContain("reportFatalError(safeMessage(error))");
    expect(publisherConfiguration).toContain("reportFatalError(safeMessage(error))");
    expect(directPublisher).toContain("AndroidMediaPublishResult.fatal(");
    expect(directPublisher).toContain("executeAndroidMediaPublish(validationError)");
    expect(videoPublisherSend).toContain("reportFatalError(fatalPublishError)");
    expect(audioPublisherSend).toContain("reportFatalError(fatalPublishError)");
  });

  it("retains capture recovery telemetry through diagnostics and support evidence", () => {
    captureRecoveryKeys.forEach((key) => {
      expect(androidRuntime).toContain(`\"${key}\"`);
      expect(nativeRuntime).toContain(key);
      expect(sessionSummary).toContain(key);
    });
    expect(diagnostics).toContain("micCaptureLastRecoveryReason: redactStreamKeyOccurrences(");
    expect(diagnostics).toContain("playbackCaptureLastRecoveryReason: redactStreamKeyOccurrences(");
    expect(supportBundle).toContain("Mic capture recovery:");
    expect(supportBundle).toContain("Playback capture recovery:");
  });
});
