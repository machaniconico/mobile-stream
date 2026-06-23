import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAvatarRuntimeStateFromScene, setExpression, tickAutoBlink, type AvatarExpression } from "../domain/avatar";
import {
  createChatMessage,
  createDefaultChatReaderState,
  enqueueChatMessage,
  updateChatReaderSettings,
  type ChatReaderSettings
} from "../domain/chatReader";
import {
  applyFaceTrackingRuntime,
  calibrateFaceTrackingProfile,
  clearFaceTrackingMotion,
  createFaceTrackingRuntimeState,
  createSimulatedFaceTrackingFrame,
  updateFaceTrackingRuntime
} from "../domain/faceTracking";
import {
  createPlatformChatSample,
  normalizePlatformChatSettings,
  type PlatformChatSettings
} from "../domain/platformChat";
import {
  createDefaultPlatformChatAuthSession,
  normalizePlatformChatAuthSession,
  type PlatformChatAuthSession
} from "../domain/platformChatConnection";
import {
  completePlatformChatOAuthCallback,
  createDefaultPlatformChatOAuthSettings,
  createPlatformChatOAuthFlow,
  normalizePlatformChatOAuthSettings,
  pollTwitchDeviceCodeOAuthFlow,
  startTwitchDeviceCodeOAuthFlow,
  type PlatformChatOAuthCredential,
  type PlatformChatOAuthFlow,
  type PlatformChatOAuthSettings,
  type TwitchDeviceCodeOAuthFlow
} from "../domain/platformChatOAuth";
import {
  applyTwitchChannelMetadata,
  createYouTubeBroadcastAndBindStream,
  refreshTwitchChannelStatus,
  refreshYouTubeBroadcastStatus,
  transitionYouTubeBroadcast,
  type YouTubeBroadcastTransitionStatus
} from "../domain/platformPublishing";
import { rotateYouTubeStreamKey, syncTwitchStreamKey } from "../domain/platformStreamKeys";
import { clearStreamKey, createDefaultStudioProfile, type StudioProfile } from "../domain/profiles";
import { createReadinessReport } from "../domain/readiness";
import {
  createDefaultScene,
  stripTransientSceneRuntime,
  updateSource,
  type PNGTuberSource,
  type Live2DSource,
  type SceneDocument
} from "../domain/scene";
import {
  createFailedStreamOperation,
  createPendingStreamOperation,
  type StreamControlAction,
  type StreamOperationStatus
} from "../domain/streamOperation";
import {
  createStreamStartPreflightReport,
  formatStreamStartPreflightBlockMessage
} from "../domain/streamStartPreflight";
import { createStreamDiagnostics } from "../domain/streamDiagnostics";
import { createStreamChatEvent, createStreamOperationEvent, createStreamRecoveryEvent } from "../domain/streamSessionLog";
import {
  appendStreamValidationRun,
  normalizeStreamValidationRuns,
  type StreamValidationRun
} from "../domain/streamValidationEvidence";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import { MockLiveCaster } from "../native/MockLiveCaster";
import { useChatSpeechQueue } from "../native/ChatSpeechEngine";
import { usePlatformChatConnection } from "../native/usePlatformChatConnection";
import { useStreamAutoRecovery } from "../native/useStreamAutoRecovery";
import { useStreamHealthHistory } from "../native/useStreamHealthHistory";
import { useStreamSessionLog } from "../native/useStreamSessionLog";
import { useStreamSessionSummaries } from "../native/useStreamSessionSummaries";
import {
  clearStreamSessionSummaries,
  clearStreamValidationRuns,
  loadProfile,
  loadScene,
  loadStreamSessionSummaries,
  loadStreamValidationRuns,
  saveProfile,
  saveScene,
  saveStreamSessionSummaries,
  saveStreamValidationRuns
} from "../storage/localStore";
import { StudioScreen } from "../screens/StudioScreen";
import { WebChatSpeechEngine } from "./WebChatSpeechEngine";

const isAvatarSource = (source: SceneDocument["sources"][number]): source is PNGTuberSource | Live2DSource =>
  source.kind === "pngtuber" || source.kind === "live2d";

export const App = () => {
  const engine = useMemo(() => new MockLiveCaster(), []);
  const chatSpeechEngine = useMemo(() => new WebChatSpeechEngine(), []);
  const [scene, setScene] = useState<SceneDocument>(() => loadScene() ?? createDefaultScene());
  const [profile, setProfile] = useState<StudioProfile>(() => loadProfile() ?? createDefaultStudioProfile());
  const [chatReader, setChatReader] = useState(() => createDefaultChatReaderState());
  const [platformChatAuth, setPlatformChatAuth] = useState<PlatformChatAuthSession>(() => createDefaultPlatformChatAuthSession());
  const [platformChatOAuth, setPlatformChatOAuth] = useState<PlatformChatOAuthSettings>(() => createDefaultPlatformChatOAuthSettings());
  const [platformChatOAuthFlow, setPlatformChatOAuthFlow] = useState<PlatformChatOAuthFlow | null>(null);
  const [twitchDeviceOAuthFlow, setTwitchDeviceOAuthFlow] = useState<TwitchDeviceCodeOAuthFlow | null>(null);
  const [platformChatOAuthStatus, setPlatformChatOAuthStatus] = useState("OAuth not started.");
  const [platformChatOAuthCredential, setPlatformChatOAuthCredential] = useState<PlatformChatOAuthCredential | null>(null);
  const [platformStreamKeyStatus, setPlatformStreamKeyStatus] = useState("Platform stream key sync idle.");
  const [platformPublishingStatus, setPlatformPublishingStatus] = useState("Platform publishing setup idle.");
  const [selectedSourceId, setSelectedSourceId] = useState("source-avatar");
  const [snapshot, setSnapshot] = useState<NativeEngineSnapshot>(() => engine.getSnapshot());
  const [avatarRuntime, setAvatarRuntime] = useState(() => createAvatarRuntimeStateFromScene(scene, Date.now()));
  const [faceTrackingRuntime, setFaceTrackingRuntime] = useState(() => createFaceTrackingRuntimeState(Date.now()));
  const [operationStatus, setOperationStatus] = useState<StreamOperationStatus | null>(null);
  const operationInFlight = useRef(false);
  const readiness = useMemo(() => createReadinessReport(scene, profile), [scene, profile]);
  const persistableSceneJson = useMemo(() => JSON.stringify(stripTransientSceneRuntime(scene)), [scene]);
  const initialStreamSessionSummaries = useMemo(() => loadStreamSessionSummaries(), []);
  const initialStreamValidationRuns = useMemo(() => loadStreamValidationRuns(), []);
  const [streamValidationRuns, setStreamValidationRuns] = useState<StreamValidationRun[]>(() =>
    normalizeStreamValidationRuns(initialStreamValidationRuns)
  );
  const platformChatConnection = usePlatformChatConnection({
    settings: profile.platformChat,
    auth: platformChatAuth,
    onMessages: (messages) => {
      setChatReader((current) => messages.reduce(enqueueChatMessage, current));
    }
  });
  const { events: streamSessionEvents, recordEvent: recordStreamSessionEvent } = useStreamSessionLog(snapshot);
  const streamHealthSamples = useStreamHealthHistory(snapshot);
  const clearPersistedStreamSessionSummaries = useCallback(() => {
    clearStreamSessionSummaries();
  }, []);
  const streamSessionSummaries = useStreamSessionSummaries({
    snapshot,
    events: streamSessionEvents,
    healthSamples: streamHealthSamples,
    quality: readiness.sanitizedProfile.quality,
    initialSummaries: initialStreamSessionSummaries,
    onSummariesChange: saveStreamSessionSummaries,
    onSummariesClear: clearPersistedStreamSessionSummaries
  });

  useEffect(() => engine.subscribe(setSnapshot), [engine]);
  useChatSpeechQueue(chatReader, setChatReader, chatSpeechEngine);

  useEffect(() => {
    saveScene(JSON.parse(persistableSceneJson) as SceneDocument);
  }, [persistableSceneJson]);

  useEffect(() => {
    if (!shouldPushSceneToEngine(snapshot.state.status)) {
      return;
    }
    void engine.updateScene(scene);
  }, [engine, scene, snapshot.state.status]);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const trackingProfile = profile.faceTracking;

      setFaceTrackingRuntime((currentTracking) => {
        const nextTracking = trackingProfile.enabled
          ? updateFaceTrackingRuntime(
              currentTracking,
              createSimulatedFaceTrackingFrame(now, trackingProfile),
              trackingProfile,
              now
            )
          : createFaceTrackingRuntimeState(now);

        setAvatarRuntime((currentAvatar) => {
          const blinkedAvatar = tickAutoBlink(currentAvatar, now);
          const nextAvatar = trackingProfile.enabled
            ? {
                ...blinkedAvatar,
                expression: nextTracking.expression,
                mouthOpen: nextTracking.mouthOpen,
                blink: nextTracking.blink
              }
            : blinkedAvatar;

          setScene((currentScene) => {
            const withAvatar = applyAvatarRuntime(currentScene, nextAvatar.expression, nextAvatar.mouthOpen, nextAvatar.blink);
            return trackingProfile.enabled
              ? applyFaceTrackingRuntime(withAvatar, nextTracking, trackingProfile)
              : clearFaceTrackingMotion(withAvatar);
          });

          return nextAvatar;
        });

        return nextTracking;
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [profile.faceTracking]);

  const updateMicLevel = (level: number) => {
    setAvatarRuntime((current) => {
      const next = { ...current, mouthOpen: level };
      setScene((currentScene) => applyAvatarRuntime(currentScene, next.expression, next.mouthOpen, next.blink));
      return next;
    });
  };

  const updateExpression = (expression: AvatarExpression) => {
    setAvatarRuntime((current) => {
      const next = setExpression(current, expression);
      setScene((currentScene) => applyAvatarRuntime(currentScene, next.expression, next.mouthOpen, next.blink));
      return next;
    });
  };

  const calibrateFaceTracking = () => {
    setProfile((current) => ({
      ...current,
      faceTracking: calibrateFaceTrackingProfile(current.faceTracking, faceTrackingRuntime)
    }));
  };

  const startStream = async () => {
    await runStreamOperation("start", async () => {
      const engineSnapshot = engine.getSnapshot();
      const diagnostics = createStreamDiagnostics(
        scene,
        profile,
        readiness,
        engineSnapshot,
        streamSessionEvents,
        streamHealthSamples,
        streamSessionSummaries.summaries,
        streamValidationRuns,
        faceTrackingRuntime
      );
      const preflight = createStreamStartPreflightReport({
        readiness,
        streamStatus: engineSnapshot.state.status,
        profile,
        validation: diagnostics.validation,
        chatReader: chatReader.settings,
        platformChatAuth,
        platformChatConnection: platformChatConnection.connection
      });
      if (!preflight.canStart) {
        throw new Error(formatStreamStartPreflightBlockMessage(preflight));
      }
      await engine.prepare(scene, readiness.sanitizedProfile);
      await engine.start();
      const chatPlan = platformChatConnection.ensureConnected(chatReader.settings.enabled);
      if (chatPlan.reason !== "platform-chat-disabled") {
        recordStreamSessionEvent(
          createStreamChatEvent(
            chatPlan.action === "connect" ? "auto-connect-started" : "auto-connect-skipped",
            chatPlan.message,
            chatPlan.severity
          )
        );
      }
    });
  };

  const stopStream = async () => {
    await runStreamOperation("stop", () => engine.stop());
  };

  const reconnectStream = async () => {
    await runStreamOperation("reconnect", () => engine.reconnect());
  };

  const runStreamOperation = useCallback(async (action: StreamControlAction, operation: () => Promise<void>) => {
    if (operationInFlight.current) {
      return;
    }
    operationInFlight.current = true;
    const pending = createPendingStreamOperation(action);
    setOperationStatus(pending);
    recordStreamSessionEvent(createStreamOperationEvent(action, "started", pending.message));
    try {
      await operation();
      setOperationStatus(null);
      recordStreamSessionEvent(createStreamOperationEvent(action, "succeeded", `${pending.message} completed.`));
    } catch (error) {
      const failed = createFailedStreamOperation(action, error);
      setOperationStatus(failed);
      recordStreamSessionEvent(createStreamOperationEvent(action, "failed", failed.message));
    } finally {
      operationInFlight.current = false;
    }
  }, [recordStreamSessionEvent]);
  const recordRecoveryDecision = useCallback(
    (decision: Parameters<typeof createStreamRecoveryEvent>[0]) => {
      recordStreamSessionEvent(createStreamRecoveryEvent(decision));
    },
    [recordStreamSessionEvent]
  );

  useStreamAutoRecovery({
    engine,
    snapshot,
    quality: readiness.sanitizedProfile.quality,
    canStart: readiness.canStart,
    operationInFlight,
    runStreamOperation,
    onRecoveryDecision: recordRecoveryDecision
  });

  const submitChatComment = (author: string, body: string) => {
    setChatReader((current) => enqueueChatMessage(current, createChatMessage({ author, body })));
  };

  const updateChatSettings = (settings: Partial<ChatReaderSettings>) => {
    setChatReader((current) => updateChatReaderSettings(current, settings));
  };

  const updatePlatformChatSettings = (settings: Partial<PlatformChatSettings>) => {
    setProfile((current) => ({
      ...current,
      platformChat: normalizePlatformChatSettings({
        ...current.platformChat,
        ...settings
      })
    }));
  };

  const updatePlatformChatAuth = (settings: Partial<PlatformChatAuthSession>) => {
    setPlatformChatAuth((current) =>
      normalizePlatformChatAuthSession({
        ...current,
        ...settings
      })
    );
  };

  const updatePlatformChatOAuth = (settings: Partial<PlatformChatOAuthSettings>) => {
    setPlatformChatOAuth((current) =>
      normalizePlatformChatOAuthSettings({
        ...current,
        ...settings
      })
    );
  };

  const startPlatformChatOAuth = () => {
    try {
      const flow = createPlatformChatOAuthFlow(profile.platformChat.platform, platformChatOAuth);
      setPlatformChatOAuthFlow(flow);
      setPlatformChatOAuthStatus(`OAuth started for ${profile.platformChat.platform}. Complete consent and paste the callback URL.`);
      window.open(flow.authorizationUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setPlatformChatOAuthStatus(toErrorMessage(error));
    }
  };

  const startTwitchDeviceOAuth = async () => {
    try {
      const result = await startTwitchDeviceCodeOAuthFlow(platformChatOAuth, fetch);
      setTwitchDeviceOAuthFlow(result.flow);
      setPlatformChatOAuthStatus(result.message);
      window.open(result.flow.verificationUri, "_blank", "noopener,noreferrer");
    } catch (error) {
      setPlatformChatOAuthStatus(toErrorMessage(error));
    }
  };

  const pollTwitchDeviceOAuth = async () => {
    try {
      const result = await pollTwitchDeviceCodeOAuthFlow(twitchDeviceOAuthFlow, platformChatOAuth, fetch);
      if (result.status === "pending") {
        setTwitchDeviceOAuthFlow(result.flow);
        setPlatformChatOAuthStatus(result.message);
        return;
      }

      setPlatformChatAuth((current) => mergeOAuthAuth(current, result.auth));
      setPlatformChatOAuthCredential(result.credential);
      setTwitchDeviceOAuthFlow(null);
      setPlatformChatOAuthStatus(result.message);
    } catch (error) {
      setPlatformChatOAuthStatus(toErrorMessage(error));
    }
  };

  const applyPlatformChatOAuthCallback = async () => {
    try {
      const result = await completePlatformChatOAuthCallback(platformChatOAuth.callbackUrl, platformChatOAuthFlow, platformChatOAuth, fetch);
      setPlatformChatAuth((current) => mergeOAuthAuth(current, result.auth));
      setPlatformChatOAuthCredential(result.credential);
      setPlatformChatOAuthFlow(null);
      setPlatformChatOAuth((current) => ({
        ...current,
        callbackUrl: ""
      }));
      setPlatformChatOAuthStatus(result.message);
    } catch (error) {
      setPlatformChatOAuthStatus(toErrorMessage(error));
    }
  };

  const applyPlatformStreamKey = async () => {
    try {
      const result =
        profile.platformChat.platform === "youtube"
          ? await rotateYouTubeStreamKey(profile, platformChatOAuthCredential, fetch)
          : await syncTwitchStreamKey(profile, platformChatOAuthCredential, fetch);
      setProfile(result.profile);
      setPlatformStreamKeyStatus(result.message);
    } catch (error) {
      setPlatformStreamKeyStatus(toErrorMessage(error));
    }
  };

  const applyPlatformPublishingSetup = async () => {
    try {
      if (profile.destination.platform === "custom") {
        throw new Error("Platform publishing setup requires a YouTube Live or Twitch destination.");
      }
      const result =
        profile.destination.platform === "youtube-live"
          ? await createYouTubeBroadcastAndBindStream(profile, platformChatOAuthCredential, fetch)
          : await applyTwitchChannelMetadata(profile, platformChatOAuthCredential, fetch);
      setProfile(result.profile);
      setPlatformPublishingStatus(result.message);
    } catch (error) {
      setPlatformPublishingStatus(toErrorMessage(error));
    }
  };

  const transitionYouTubeBroadcastState = async (broadcastStatus: YouTubeBroadcastTransitionStatus) => {
    try {
      const result = await transitionYouTubeBroadcast(profile, platformChatOAuthCredential, broadcastStatus, fetch);
      setProfile(result.profile);
      setPlatformPublishingStatus(result.message);
    } catch (error) {
      setPlatformPublishingStatus(toErrorMessage(error));
    }
  };

  const refreshPlatformPublishingStatus = async () => {
    try {
      const result =
        profile.destination.platform === "youtube-live"
          ? await refreshYouTubeBroadcastStatus(profile, platformChatOAuthCredential, fetch)
          : profile.destination.platform === "twitch"
            ? await refreshTwitchChannelStatus(profile, platformChatOAuthCredential, fetch)
            : null;

      if (!result) {
        throw new Error("Platform publishing status refresh requires a YouTube Live or Twitch destination.");
      }

      setProfile(result.profile);
      setPlatformPublishingStatus(result.message);
    } catch (error) {
      setPlatformPublishingStatus(toErrorMessage(error));
    }
  };

  const ingestPlatformChatSample = () => {
    if (!profile.platformChat.enabled) {
      return;
    }
    const result = createPlatformChatSample(profile.platformChat);
    setChatReader((current) => result.messages.reduce(enqueueChatMessage, current));
  };

  const clearSavedStreamKey = () => {
    setProfile((current) => clearStreamKey(current));
  };

  const clearCompletedStreamSessionSummaries = () => {
    streamSessionSummaries.clearSummaries();
  };

  const recordStreamValidationRun = (run: StreamValidationRun) => {
    setStreamValidationRuns((current) => {
      const next = appendStreamValidationRun(current, run);
      saveStreamValidationRuns(next);
      return next;
    });
  };

  const clearRecordedStreamValidationRuns = () => {
    clearStreamValidationRuns();
    setStreamValidationRuns([]);
  };

  return (
    <StudioScreen
      scene={scene}
      profile={profile}
      selectedSourceId={selectedSourceId}
      snapshot={snapshot}
      streamSessionEvents={streamSessionEvents}
      streamHealthSamples={streamHealthSamples}
      streamSessionSummaries={streamSessionSummaries.summaries}
      streamValidationRuns={streamValidationRuns}
      operationStatus={operationStatus}
      readiness={readiness}
      chatReader={chatReader}
      platformChat={profile.platformChat}
      platformChatAuth={platformChatAuth}
      platformChatOAuth={platformChatOAuth}
      platformChatOAuthFlow={platformChatOAuthFlow}
      twitchDeviceOAuthFlow={twitchDeviceOAuthFlow}
      platformChatOAuthStatus={platformChatOAuthStatus}
      platformStreamKeyStatus={platformStreamKeyStatus}
      platformPublishingStatus={platformPublishingStatus}
      platformChatConnection={platformChatConnection.connection}
      avatarRuntime={avatarRuntime}
      faceTrackingRuntime={faceTrackingRuntime}
      onSceneChange={setScene}
      onProfileChange={setProfile}
      onSelectSource={setSelectedSourceId}
      onMicLevelChange={updateMicLevel}
      onExpressionChange={updateExpression}
      onFaceTrackingCalibrate={calibrateFaceTracking}
      onStart={startStream}
      onStop={stopStream}
      onReconnect={reconnectStream}
      onChatCommentSubmit={submitChatComment}
      onChatReaderSettingsChange={updateChatSettings}
      onPlatformChatSettingsChange={updatePlatformChatSettings}
      onPlatformChatAuthChange={updatePlatformChatAuth}
      onPlatformChatOAuthChange={updatePlatformChatOAuth}
      onPlatformChatOAuthStart={startPlatformChatOAuth}
      onTwitchDeviceOAuthStart={startTwitchDeviceOAuth}
      onTwitchDeviceOAuthPoll={pollTwitchDeviceOAuth}
      onPlatformChatOAuthCallbackApply={applyPlatformChatOAuthCallback}
      onPlatformStreamKeyApply={applyPlatformStreamKey}
      onPlatformPublishingApply={applyPlatformPublishingSetup}
      onPlatformPublishingStatusRefresh={refreshPlatformPublishingStatus}
      onYouTubeBroadcastTransition={transitionYouTubeBroadcastState}
      onPlatformChatConnect={platformChatConnection.connect}
      onPlatformChatDisconnect={platformChatConnection.disconnect}
      onPlatformChatSampleIngest={ingestPlatformChatSample}
      onClearStreamKey={clearSavedStreamKey}
      onClearStreamSessionSummaries={clearCompletedStreamSessionSummaries}
      onRecordStreamValidationRun={recordStreamValidationRun}
      onClearStreamValidationRuns={clearRecordedStreamValidationRuns}
    />
  );
};

const applyAvatarRuntime = (
  scene: SceneDocument,
  expression: AvatarExpression,
  mouthOpen: number,
  blink: number
): SceneDocument => {
  let changed = false;
  let next = scene;

  for (const source of scene.sources) {
    if (!isAvatarSource(source)) {
      continue;
    }
    changed = true;
    next = updateSource(next, source.id, (current) => {
      if (!isAvatarSource(current)) {
        return current;
      }
      return {
        ...current,
        expression,
        mouthOpen,
        blink
      };
    });
  }

  return changed ? next : scene;
};

const shouldPushSceneToEngine = (status: NativeEngineSnapshot["state"]["status"]) =>
  status === "preparing" || status === "live" || status === "reconnecting";

const mergeOAuthAuth = (
  current: PlatformChatAuthSession,
  update: PlatformChatAuthSession
): PlatformChatAuthSession =>
  normalizePlatformChatAuthSession({
    youtubeAccessToken: update.youtubeAccessToken || current.youtubeAccessToken,
    twitchOauthToken: update.twitchOauthToken || current.twitchOauthToken,
    twitchLogin: update.twitchLogin || current.twitchLogin
  });

const toErrorMessage = (error: unknown): string => (error instanceof Error && error.message ? error.message : "OAuth operation failed.");
