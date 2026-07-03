import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAvatarRuntimeStateFromScene, setExpression, tickAutoBlink, type AvatarExpression } from "../domain/avatar";
import {
  clearChatReaderSession,
  createChatMessage,
  createDefaultChatReaderState,
  enqueueChatMessage,
  pinChatMessage,
  selectChatOverlayMessages,
  unpinChatMessage,
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
  clearLiveCaptionCues,
  createDefaultLiveCaptionState,
  ingestLiveCaptionCue,
  selectLiveCaptionCues,
  setLiveCaptionStatus,
  updateLiveCaptionSettings as updateLiveCaptionSettingsDomain,
  type LiveCaptionSettings
} from "../domain/liveCaption";
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
  createEmptyPlatformChatOAuthCredentialStore,
  createPlatformChatAuthFromCredentialStore,
  createDefaultPlatformChatOAuthSettings,
  createPlatformChatOAuthFlow,
  ensureFreshPlatformChatOAuthCredential,
  getPlatformChatOAuthCredential,
  normalizePlatformChatOAuthSettings,
  pollTwitchDeviceCodeOAuthFlow,
  startTwitchDeviceCodeOAuthFlow,
  upsertPlatformChatOAuthCredential,
  type PlatformChatOAuthCredential,
  type PlatformChatOAuthCredentialStore,
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
import { createPlatformApiOperationGate, PlatformApiOperationInFlightError } from "../domain/platformApiOperationGate";
import { createPlatformApiRetrySchedule } from "../domain/platformApiRetry";
import {
  createYouTubeBroadcastTransitionPreflightReport,
  formatPlatformPublishingPreflightBlockMessage
} from "../domain/platformPublishingPreflight";
import { assessPlatformPublishingFreshness } from "../domain/platformPublishingFreshness";
import {
  createPublicLaunchChecklist,
  formatPublicLaunchChecklistBlockMessage
} from "../domain/publicLaunchChecklist";
import {
  createPublicLaunchConfirmation,
  formatPublicLaunchConfirmationCancelMessage,
  formatPublicLaunchConfirmationEventMessage
} from "../domain/publicLaunchConfirmation";
import {
  createPlatformStreamKeyIdleStatus,
  getPlatformStreamKeyOperationInfo,
  resolvePlatformStreamKeyOperationPlatform,
  resolvePlatformStreamKeyStatusMessage,
  rotateYouTubeStreamKey,
  syncTwitchStreamKey
} from "../domain/platformStreamKeys";
import { applyEmergencyBroadcastMute, clearStreamKey, createDefaultStudioProfile, type StudioProfile } from "../domain/profiles";
import { createReadinessReport } from "../domain/readiness";
import {
  addSceneToCollection,
  activatePrivacyShieldScene,
  createDefaultSceneCollection,
  createSceneFromTemplate,
  duplicateActiveScene,
  selectActiveScene,
  setActiveScene,
  stripTransientSceneCollectionRuntime,
  syncLiveCaptionTextSourceForSettings,
  updateActiveScene,
  updateSceneTransition,
  updateSource,
  type PNGTuberSource,
  type Live2DSource,
  type VRMSource,
  type SceneCollection,
  type SceneTemplateId,
  type SceneTransitionPreview,
  type SceneTransitionSettings,
  type SceneDocument
} from "../domain/scene";
import {
  createFailedStreamOperation,
  createPendingStreamOperation,
  isStreamOperationCancelledError,
  StreamOperationCancelledError,
  type StreamControlAction,
  type StreamOperationStatus
} from "../domain/streamOperation";
import { canAutomateStreamRecovery } from "../domain/streamRecovery";
import {
  createStreamStartPreflightReport,
  formatStreamStartPreflightBlockMessage
} from "../domain/streamStartPreflight";
import { createStreamDiagnostics } from "../domain/streamDiagnostics";
import { createDiagnosticRedactionSecrets } from "../domain/diagnosticSecrets";
import { errorToSafeMessage } from "../domain/sensitiveText";
import { createStreamAnnouncementPreview } from "../domain/streamAnnouncement";
import {
  createStreamAnnouncementAutoPostDecision,
  formatStreamAnnouncementAutoPostError,
  postDiscordStreamAnnouncement,
  type StreamAnnouncementAutoPostSignal
} from "../domain/streamAnnouncementAutoPost";
import {
  createStreamAnnouncementAutoPostEvent,
  createStreamChatEvent,
  createStreamChatSpeechEvent,
  createStreamChatReconnectEvent,
  createStreamOperationEvent,
  createStreamPlatformApiOperationEvent,
  createStreamQualityAutomationEvent,
  createStreamRecoveryEvent,
  createStreamSafetyEvent
} from "../domain/streamSessionLog";
import {
  applyStreamQualityAdvisorTarget,
  canApplyStreamQualityAdvisorTargetLive
} from "../domain/streamQualityAdvisor";
import { createStreamQualityAutomationDecision } from "../domain/streamQualityAutomation";
import {
  appendStreamAudioLevelSample,
  createStreamAudioLevelSample,
  type StreamAudioLevelSource,
  type StreamAudioLevelSample,
  type StreamSessionSummary
} from "../domain/streamSessionSummary";
import {
  appendStreamValidationRun,
  normalizeStreamValidationRuns,
  type StreamValidationRun
} from "../domain/streamValidationEvidence";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import { MockLiveCaster } from "../native/MockLiveCaster";
import { useChatSpeechQueue, type ChatSpeechQueueEvent } from "../native/ChatSpeechEngine";
import { usePlatformChatConnection } from "../native/usePlatformChatConnection";
import { useStreamAutoRecovery } from "../native/useStreamAutoRecovery";
import { useStreamHealthHistory } from "../native/useStreamHealthHistory";
import { useStreamQualityAutomation } from "../native/useStreamQualityAutomation";
import { useStreamSessionLog } from "../native/useStreamSessionLog";
import { useStreamSessionSummaries } from "../native/useStreamSessionSummaries";
import {
  clearStreamSessionSummaries,
  clearStreamValidationRuns,
  loadProfile,
  loadSceneCollection,
  loadStreamSessionSummaries,
  loadStreamValidationRuns,
  saveProfile,
  saveSceneCollection,
  saveStreamSessionSummaries,
  saveStreamValidationRuns
} from "../storage/localStore";
import { WebChatSpeechEngine } from "./WebChatSpeechEngine";
import { WebLiveCaptionEngine } from "./WebLiveCaptionEngine";

const StudioScreen = lazy(() => import("../screens/StudioScreen").then((module) => ({ default: module.StudioScreen })));

const isAvatarSource = (source: SceneDocument["sources"][number]): source is PNGTuberSource | Live2DSource | VRMSource =>
  source.kind === "pngtuber" || source.kind === "live2d" || source.kind === "vrm";

export const App = () => {
  const engine = useMemo(() => new MockLiveCaster(), []);
  const platformApiOperationGate = useMemo(() => createPlatformApiOperationGate(), []);
  const chatSpeechEngine = useMemo(() => new WebChatSpeechEngine(), []);
  const liveCaptionEngine = useMemo(() => new WebLiveCaptionEngine(), []);
  const [sceneCollection, setSceneCollection] = useState<SceneCollection>(() => loadSceneCollection() ?? createDefaultSceneCollection());
  const scene = useMemo(() => selectActiveScene(sceneCollection), [sceneCollection]);
  const [profile, setProfile] = useState<StudioProfile>(() => loadProfile() ?? createDefaultStudioProfile());
  const [chatReader, setChatReader] = useState(() => createDefaultChatReaderState());
  const [liveCaption, setLiveCaption] = useState(() => createDefaultLiveCaptionState());
  const [liveCaptionClock, setLiveCaptionClock] = useState(() => Date.now());
  const [textOverlayClock, setTextOverlayClock] = useState(() => Date.now());
  const [platformChatAuth, setPlatformChatAuth] = useState<PlatformChatAuthSession>(() => createDefaultPlatformChatAuthSession());
  const [platformChatOAuth, setPlatformChatOAuth] = useState<PlatformChatOAuthSettings>(() => createDefaultPlatformChatOAuthSettings());
  const [platformChatOAuthFlow, setPlatformChatOAuthFlow] = useState<PlatformChatOAuthFlow | null>(null);
  const [twitchDeviceOAuthFlow, setTwitchDeviceOAuthFlow] = useState<TwitchDeviceCodeOAuthFlow | null>(null);
  const [platformChatOAuthStatus, setPlatformChatOAuthStatus] = useState("OAuth not started.");
  const [platformChatOAuthCredentials, setPlatformChatOAuthCredentials] = useState<PlatformChatOAuthCredentialStore>(() =>
    createEmptyPlatformChatOAuthCredentialStore()
  );
  const platformChatOAuthCredentialsRef = useRef(platformChatOAuthCredentials);
  const [platformStreamKeyStatus, setPlatformStreamKeyStatus] = useState(() => createPlatformStreamKeyIdleStatus(profile));
  const [platformPublishingStatus, setPlatformPublishingStatus] = useState("Platform publishing setup idle.");
  const [selectedSourceId, setSelectedSourceId] = useState("source-avatar");
  const [sceneTransitionPreview, setSceneTransitionPreview] = useState<SceneTransitionPreview | null>(null);
  const [snapshot, setSnapshot] = useState<NativeEngineSnapshot>(() => engine.getSnapshot());
  const [avatarRuntime, setAvatarRuntime] = useState(() => createAvatarRuntimeStateFromScene(scene, Date.now()));
  const [faceTrackingRuntime, setFaceTrackingRuntime] = useState(() => createFaceTrackingRuntimeState(Date.now()));
  const [operationStatus, setOperationStatus] = useState<StreamOperationStatus | null>(null);
  const [platformApiOperationLabel, setPlatformApiOperationLabel] = useState<string | null>(null);
  const [streamAnnouncementPromptNonce, setStreamAnnouncementPromptNonce] = useState(0);
  const [streamAnnouncementAutoPostStatus, setStreamAnnouncementAutoPostStatus] = useState("");
  const operationInFlight = useRef(false);
  const streamAnnouncementAutoPostedSessionKeys = useRef(new Set<string>());
  const audioLevelSamplesRef = useRef<StreamAudioLevelSample[]>([]);
  const readiness = useMemo(() => createReadinessReport(scene, profile), [scene, profile]);
  const persistableSceneCollectionJson = useMemo(
    () => JSON.stringify(stripTransientSceneCollectionRuntime(sceneCollection)),
    [sceneCollection]
  );
  const chatOverlayMessages = useMemo(
    () => selectChatOverlayMessages(chatReader),
    [chatReader.history, chatReader.pinnedMessage, chatReader.settings]
  );
  const liveCaptionCues = useMemo(
    () => selectLiveCaptionCues(liveCaption, liveCaptionClock),
    [liveCaption, liveCaptionClock]
  );
  const hasActiveTextOverlayClockSources = useMemo(
    () =>
      scene.sources.some(
        (source) =>
          source.kind === "text" &&
          source.visible &&
          (((source.timerMode ?? "none") !== "none") ||
            (source.visibilityMode === "timed" &&
              source.activatedAtMs > 0 &&
              source.activatedAtMs + source.displayDurationMs > textOverlayClock))
      ),
    [scene.sources, textOverlayClock]
  );
  const renderGraphRuntime = useMemo(
    () => {
      const nowMs = Math.max(liveCaptionClock, textOverlayClock);
      return {
        chatMessages: chatOverlayMessages,
        captions: liveCaptionCues,
        captionsEnabled: liveCaption.settings.enabled,
        nowMs,
        streamStartedAtMs:
          snapshot.state.status === "live" || snapshot.state.status === "reconnecting"
            ? Math.max(0, Math.round(nowMs - snapshot.health.elapsedSeconds * 1000))
            : undefined
      };
    },
    [
      chatOverlayMessages,
      liveCaption.settings.enabled,
      liveCaptionClock,
      liveCaptionCues,
      snapshot.health.elapsedSeconds,
      snapshot.state.status,
      textOverlayClock
    ]
  );
  const platformStreamKeyStatusMessage = useMemo(
    () => resolvePlatformStreamKeyStatusMessage(platformStreamKeyStatus, profile),
    [platformStreamKeyStatus, profile]
  );
  const initialStreamSessionSummaries = useMemo(() => loadStreamSessionSummaries(), []);
  const initialStreamValidationRuns = useMemo(() => loadStreamValidationRuns(), []);
  const [streamValidationRuns, setStreamValidationRuns] = useState<StreamValidationRun[]>(() =>
    normalizeStreamValidationRuns(initialStreamValidationRuns)
  );
  const { events: streamSessionEvents, recordEvent: recordStreamSessionEvent } = useStreamSessionLog(snapshot);
  const recordAudioLevelSample = useCallback((level: number, source: StreamAudioLevelSource) => {
    audioLevelSamplesRef.current = appendStreamAudioLevelSample(
      audioLevelSamplesRef.current,
      createStreamAudioLevelSample(level, source)
    );
  }, []);
  const getAudioLevelSamples = useCallback(() => audioLevelSamplesRef.current, []);
  useEffect(() => {
    if (snapshot.state.status === "preparing") {
      audioLevelSamplesRef.current = [];
    }
  }, [snapshot.state.status]);
  const recordChatSpeechEvent = useCallback(
    (event: ChatSpeechQueueEvent) => {
      recordStreamSessionEvent(
        createStreamChatSpeechEvent(
          event.phase === "started" ? "speech-started" : event.phase === "spoken" ? "speech-spoken" : "speech-failed",
          {
            messageSource: event.message.source,
            textLength: event.textLength
          }
        )
      );
    },
    [recordStreamSessionEvent]
  );
  const recordPlatformChatReconnectDecision = useCallback(
    (decision: Parameters<typeof createStreamChatReconnectEvent>[0]) => {
      recordStreamSessionEvent(createStreamChatReconnectEvent(decision));
    },
    [recordStreamSessionEvent]
  );
  const runStreamAnnouncementAutoPost = useCallback(
    async (nextProfile: StudioProfile, signal: StreamAnnouncementAutoPostSignal, force = false) => {
      const engineSnapshot = engine.getSnapshot();
      const decision = force
        ? { shouldPost: true as const, sessionKey: null, reason: "platform-visible-live" as const }
        : createStreamAnnouncementAutoPostDecision({
            settings: nextProfile.streamAnnouncement,
            destinationPlatform: nextProfile.destination.platform,
            youtubeBroadcastPrivacyStatus: nextProfile.platformPublishing.youtubeBroadcastPrivacyStatus,
            youtubeConfiguredPrivacyStatus: nextProfile.platformPublishing.privacyStatus,
            youtubeBroadcastStatus: nextProfile.platformPublishing.youtubeBroadcastStatus,
            twitchLiveStatus: nextProfile.platformPublishing.twitchLiveStatus,
            enginePlatform: engineSnapshot.platform,
            streamStatus: engineSnapshot.state.status,
            sessionStartedAt: engineSnapshot.state.startedAt,
            signal,
            postedSessionKeys: streamAnnouncementAutoPostedSessionKeys.current
          });

      if (!decision.shouldPost) {
        if (decision.reason === "invalid-webhook") {
          setStreamAnnouncementAutoPostStatus("Discord webhook URL is invalid. Use the full https://discord.com/api/webhooks/{id}/{token} URL.");
        }
        return;
      }

      if (decision.sessionKey) {
        streamAnnouncementAutoPostedSessionKeys.current.add(decision.sessionKey);
      }

      const secrets = createDiagnosticRedactionSecrets({
        streamKey: nextProfile.destination.streamKey,
        discordWebhookUrl: nextProfile.streamAnnouncement.discordWebhookUrl,
        platformChatOAuthCredentials
      });
      const preview = createStreamAnnouncementPreview({
        profile: nextProfile,
        twitchLogin: platformChatOAuthCredentials.twitch?.twitchLogin ?? platformChatAuth.twitchLogin,
        secrets
      });

      try {
        const result = await postDiscordStreamAnnouncement({
          webhookUrl: nextProfile.streamAnnouncement.discordWebhookUrl,
          content: preview.text,
          fetcher: fetch
        });
        const status = force ? "📣 Discord test announcement posted." : "📣 Discord に告知を投稿したよ";
        setStreamAnnouncementAutoPostStatus(status);
        recordStreamSessionEvent(
          createStreamAnnouncementAutoPostEvent({
            phase: "posted",
            message: `${result.message} Content: ${preview.text}`
          })
        );
      } catch (error) {
        const safeMessage = formatStreamAnnouncementAutoPostError(error, nextProfile.streamAnnouncement.discordWebhookUrl);
        setStreamAnnouncementAutoPostStatus(`Discord announcement failed: ${safeMessage} Use Share announcement for manual sharing.`);
        recordStreamSessionEvent(
          createStreamAnnouncementAutoPostEvent({
            phase: "failed",
            message: safeMessage
          })
        );
      }
    },
    [engine, platformChatAuth.twitchLogin, platformChatOAuthCredentials, recordStreamSessionEvent]
  );
  const testStreamAnnouncementAutoPost = useCallback(
    () => runStreamAnnouncementAutoPost(profile, "youtube-status-refresh", true),
    [profile, runStreamAnnouncementAutoPost]
  );
  const platformChatConnection = usePlatformChatConnection({
    settings: profile.platformChat,
    auth: platformChatAuth,
    onMessages: (messages) => {
      setChatReader((current) => messages.reduce(enqueueChatMessage, current));
    },
    autoReconnect: {
      enabled: true,
      streamActive: snapshot.state.status === "live" || snapshot.state.status === "reconnecting",
      chatReaderEnabled: chatReader.settings.enabled,
      onDecision: recordPlatformChatReconnectDecision
    }
  });
  const streamHealthSamples = useStreamHealthHistory(snapshot);
  const persistStreamSessionSummaries = useCallback(
    (summaries: StreamSessionSummary[]) =>
      saveStreamSessionSummaries(summaries, [profile.destination.streamKey, profile.streamAnnouncement.discordWebhookUrl]),
    [profile.destination.streamKey, profile.streamAnnouncement.discordWebhookUrl]
  );
  const clearPersistedStreamSessionSummaries = useCallback(() => {
    clearStreamSessionSummaries();
  }, []);
  const streamSessionSummaries = useStreamSessionSummaries({
    snapshot,
    events: streamSessionEvents,
    healthSamples: streamHealthSamples,
    quality: readiness.sanitizedProfile.quality,
    initialSummaries: initialStreamSessionSummaries,
    onSummariesChange: persistStreamSessionSummaries,
    onSummariesClear: clearPersistedStreamSessionSummaries,
    getAudioLevelSamples
  });

  useEffect(() => engine.subscribe(setSnapshot), [engine]);
  useChatSpeechQueue(chatReader, setChatReader, chatSpeechEngine, { onSpeechEvent: recordChatSpeechEvent });

  useEffect(() => {
    if (!liveCaption.settings.enabled) {
      setLiveCaptionClock(Date.now());
      return undefined;
    }
    const timer = window.setInterval(() => setLiveCaptionClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [liveCaption.settings.enabled]);

  useEffect(() => {
    if (!hasActiveTextOverlayClockSources) {
      setTextOverlayClock(Date.now());
      return undefined;
    }
    const timer = window.setInterval(() => setTextOverlayClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [hasActiveTextOverlayClockSources]);

  useEffect(() => {
    let active = true;
    if (!liveCaption.settings.enabled) {
      void liveCaptionEngine.stop();
      setLiveCaption((current) => setLiveCaptionStatus(current, "idle"));
      return () => {
        active = false;
      };
    }

    if (!liveCaptionEngine.isSupported()) {
      setLiveCaption((current) =>
        setLiveCaptionStatus(current, "unsupported", "Speech recognition is not available in this browser.")
      );
      return () => {
        active = false;
      };
    }

    setLiveCaption((current) => setLiveCaptionStatus(current, "listening"));
    void liveCaptionEngine
      .start({
        language: liveCaption.settings.language,
        interimResults: liveCaption.settings.interimResults,
        onCue: (cue) => {
          if (active) {
            setLiveCaption((current) => ingestLiveCaptionCue(current, cue));
          }
        },
        onStatus: (status, message) => {
          if (active) {
            setLiveCaption((current) => setLiveCaptionStatus(current, status, message));
          }
        }
      })
      .catch((error) => {
        if (active) {
          setLiveCaption((current) => setLiveCaptionStatus(current, "error", errorToSafeMessage(error, "Speech recognition failed.")));
        }
      });

    return () => {
      active = false;
      void liveCaptionEngine.stop();
    };
  }, [liveCaption.settings.enabled, liveCaption.settings.interimResults, liveCaption.settings.language, liveCaptionEngine]);

  useEffect(() => {
    saveSceneCollection(JSON.parse(persistableSceneCollectionJson) as SceneCollection);
  }, [persistableSceneCollectionJson]);

  useEffect(() => {
    setSelectedSourceId((currentSourceId) =>
      scene.sources.some((source) => source.id === currentSourceId)
        ? currentSourceId
        : scene.sources[0]?.id ?? currentSourceId
    );
    setAvatarRuntime(createAvatarRuntimeStateFromScene(scene, Date.now()));
  }, [scene.id]);

  const updateActiveSceneDocument = useCallback(
    (nextSceneOrUpdater: SceneDocument | ((currentScene: SceneDocument) => SceneDocument)) => {
      setSceneCollection((currentCollection) => {
        const currentScene = selectActiveScene(currentCollection);
        const nextScene =
          typeof nextSceneOrUpdater === "function" ? nextSceneOrUpdater(currentScene) : nextSceneOrUpdater;
        return updateActiveScene(currentCollection, nextScene);
      });
    },
    []
  );

  const startSceneTransitionPreview = useCallback((fromScene: SceneDocument, settings: SceneTransitionSettings) => {
    if (settings.kind !== "fade" || settings.durationMs <= 0) {
      setSceneTransitionPreview(null);
      return;
    }
    setSceneTransitionPreview({
      scene: fromScene,
      startedAt: Date.now(),
      settings
    });
  }, []);

  const switchScene = useCallback((sceneId: string) => {
    if (sceneId === sceneCollection.activeSceneId) {
      return;
    }
    const fromScene = selectActiveScene(sceneCollection);
    const nextCollection = setActiveScene(sceneCollection, sceneId);
    if (nextCollection.activeSceneId !== sceneCollection.activeSceneId) {
      startSceneTransitionPreview(fromScene, sceneCollection.transition);
      setSceneCollection(nextCollection);
    }
  }, [sceneCollection, startSceneTransitionPreview]);

  const createScene = useCallback((templateId: SceneTemplateId) => {
    const fromScene = selectActiveScene(sceneCollection);
    const nextCollection = addSceneToCollection(sceneCollection, createSceneFromTemplate(templateId));
    startSceneTransitionPreview(fromScene, sceneCollection.transition);
    setSceneCollection(nextCollection);
  }, [sceneCollection, startSceneTransitionPreview]);

  const duplicateScene = useCallback(() => {
    const fromScene = selectActiveScene(sceneCollection);
    const nextCollection = duplicateActiveScene(sceneCollection);
    startSceneTransitionPreview(fromScene, sceneCollection.transition);
    setSceneCollection(nextCollection);
  }, [sceneCollection, startSceneTransitionPreview]);

  const updateSceneTransitionSettings = useCallback((settings: Partial<SceneTransitionSettings>) => {
    setSceneCollection((currentCollection) => updateSceneTransition(currentCollection, settings));
  }, []);

  useEffect(() => {
    if (!sceneTransitionPreview) {
      return undefined;
    }
    const timeout = window.setTimeout(
      () => setSceneTransitionPreview(null),
      Math.max(80, sceneTransitionPreview.settings.durationMs + 80)
    );
    return () => window.clearTimeout(timeout);
  }, [sceneTransitionPreview]);

  useEffect(() => {
    if (!shouldPushSceneToEngine(snapshot.state.status)) {
      return;
    }
    void engine.updateScene(scene, renderGraphRuntime);
  }, [engine, renderGraphRuntime, scene, snapshot.state.status]);

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
          recordAudioLevelSample(nextAvatar.mouthOpen, trackingProfile.enabled ? "face-tracking" : "manual");

          updateActiveSceneDocument((currentScene) => {
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
  }, [profile.faceTracking, recordAudioLevelSample, updateActiveSceneDocument]);

  const updateMicLevel = (level: number) => {
    recordAudioLevelSample(level, "manual");
    setAvatarRuntime((current) => {
      const next = { ...current, mouthOpen: level };
      updateActiveSceneDocument((currentScene) => applyAvatarRuntime(currentScene, next.expression, next.mouthOpen, next.blink));
      return next;
    });
  };

  const updateExpression = (expression: AvatarExpression) => {
    setAvatarRuntime((current) => {
      const next = setExpression(current, expression);
      updateActiveSceneDocument((currentScene) => applyAvatarRuntime(currentScene, next.expression, next.mouthOpen, next.blink));
      return next;
    });
  };

  const calibrateFaceTracking = () => {
    setProfile((current) => ({
      ...current,
      faceTracking: calibrateFaceTrackingProfile(current.faceTracking, faceTrackingRuntime)
    }));
  };

  const clearChatReadout = useCallback(() => {
    void chatSpeechEngine.stop().catch((error) => console.warn("Chat speech stop failed", error));
    setChatReader(clearChatReaderSession);
  }, [chatSpeechEngine]);

  const clearLiveCaptions = useCallback(() => {
    void liveCaptionEngine.stop().catch((error) => console.warn("Live caption stop failed", error));
    setLiveCaption((current) => setLiveCaptionStatus(clearLiveCaptionCues(current), "idle"));
  }, [liveCaptionEngine]);

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
        faceTrackingRuntime,
        {
          chatReader: chatReader.settings,
          platformChatConnection: platformChatConnection.connection,
          audioLevelSamples: getAudioLevelSamples(),
          liveCaption
        }
      );
      const preflight = createStreamStartPreflightReport({
        readiness,
        streamStatus: engineSnapshot.state.status,
        enginePlatform: engineSnapshot.platform,
        profile,
        validation: diagnostics.validation,
        validationEvidence: diagnostics.validationEvidence,
        chatReader: chatReader.settings,
        platformChatAuth,
        platformChatOAuthCredentials,
        platformChatConnection: platformChatConnection.connection,
        faceTracking: diagnostics.faceTracking,
        liveCaption: diagnostics.liveCaption
      });
      if (!preflight.canStart) {
        throw new Error(formatStreamStartPreflightBlockMessage(preflight));
      }
      const publicLaunchChecklist = createPublicLaunchChecklist({
        preflight,
        diagnostics,
        platformPublishingFreshness: assessPlatformPublishingFreshness(diagnostics.platformPublishing),
        profile
      });
      if (!publicLaunchChecklist.canStart) {
        throw new Error(formatPublicLaunchChecklistBlockMessage(publicLaunchChecklist));
      }
      const publicLaunchConfirmation = createPublicLaunchConfirmation(profile, publicLaunchChecklist);
      if (publicLaunchConfirmation) {
        const confirmed = window.confirm(publicLaunchConfirmation.message);
        if (!confirmed) {
          const message = formatPublicLaunchConfirmationCancelMessage(publicLaunchConfirmation);
          recordStreamSessionEvent(createStreamSafetyEvent("public-launch-cancelled", message));
          throw new StreamOperationCancelledError(message);
        }
        recordStreamSessionEvent(
          createStreamSafetyEvent("public-launch-confirmed", formatPublicLaunchConfirmationEventMessage(publicLaunchConfirmation))
        );
      }
      await engine.prepare(scene, readiness.sanitizedProfile, renderGraphRuntime);
      await engine.start();
      if (profile.streamAnnouncement.promptAfterGoLive) {
        setStreamAnnouncementPromptNonce((current) => current + 1);
      }
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
    await runStreamOperation("stop", async () => {
      const shouldDisconnectChat = shouldDisconnectPlatformChatOnStreamStop(platformChatConnection.connection.phase);
      try {
        await engine.stop();
      } finally {
        if (shouldDisconnectChat) {
          platformChatConnection.disconnect();
          recordStreamSessionEvent(
            createStreamChatEvent(
              "auto-disconnect-stopped",
              "Stopping stream disconnected platform chat readout.",
              "info"
            )
          );
        }
        clearChatReadout();
      }
    });
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
      if (isStreamOperationCancelledError(error)) {
        setOperationStatus(null);
        recordStreamSessionEvent(createStreamOperationEvent(action, "cancelled", error.message));
        return;
      }
      const failed = createFailedStreamOperation(action, error);
      setOperationStatus(failed);
      recordStreamSessionEvent(createStreamOperationEvent(action, "failed", failed.message));
    } finally {
      operationInFlight.current = false;
    }
  }, [recordStreamSessionEvent]);
  const runPlatformApiOperation = useCallback(async <T,>(label: string, operation: () => Promise<T>): Promise<T> => {
    const currentLabel = platformApiOperationGate.getCurrentLabel();
    if (currentLabel) {
      const skipped = new PlatformApiOperationInFlightError(label, currentLabel);
      recordStreamSessionEvent(
        createStreamPlatformApiOperationEvent({
          label,
          phase: "skipped",
          message: errorToSafeMessage(skipped, skipped.message)
        })
      );
      throw skipped;
    }

    setPlatformApiOperationLabel(label);
    recordStreamSessionEvent(
      createStreamPlatformApiOperationEvent({
        label,
        phase: "started"
      })
    );
    try {
      const result = await platformApiOperationGate.run(label, operation);
      recordStreamSessionEvent(
        createStreamPlatformApiOperationEvent({
          label,
          phase: "succeeded"
        })
      );
      return result;
    } catch (error) {
      const retrySchedule = createPlatformApiRetrySchedule(error, { fallbackDelayMs: null });
      recordStreamSessionEvent(
        createStreamPlatformApiOperationEvent({
          label,
          phase: "failed",
          message: errorToSafeMessage(error, `${label} failed.`),
          retryDelayLabel: retrySchedule.retryable ? retrySchedule.label : null
        })
      );
      throw error;
    } finally {
      setPlatformApiOperationLabel(null);
    }
  }, [platformApiOperationGate, recordStreamSessionEvent]);
  const recordRecoveryDecision = useCallback(
    (decision: Parameters<typeof createStreamRecoveryEvent>[0]) => {
      recordStreamSessionEvent(createStreamRecoveryEvent(decision));
    },
    [recordStreamSessionEvent]
  );
  const autoRecoveryCanStart = useMemo(() => {
    const activeSessionEligible = canAutomateStreamRecovery({
      streamStatus: snapshot.state.status,
      elapsedSeconds: snapshot.health.elapsedSeconds,
      reconnectAttempts: snapshot.health.reconnectAttempts,
      publicLaunchCanStart: false
    });
    if (activeSessionEligible) {
      return true;
    }

    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      snapshot,
      streamSessionEvents,
      streamHealthSamples,
      streamSessionSummaries.summaries,
      streamValidationRuns,
      faceTrackingRuntime,
      {
        chatReader: chatReader.settings,
        platformChatConnection: platformChatConnection.connection,
        audioLevelSamples: getAudioLevelSamples(),
        liveCaption
      }
    );
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: snapshot.state.status,
      enginePlatform: snapshot.platform,
      profile,
      validation: diagnostics.validation,
      validationEvidence: diagnostics.validationEvidence,
      chatReader: chatReader.settings,
      platformChatAuth,
      platformChatOAuthCredentials,
      platformChatConnection: platformChatConnection.connection,
      faceTracking: diagnostics.faceTracking,
      liveCaption: diagnostics.liveCaption
    });
    const publicLaunchChecklist = createPublicLaunchChecklist({
      preflight,
      diagnostics,
      platformPublishingFreshness: assessPlatformPublishingFreshness(diagnostics.platformPublishing),
      profile
    });

    return canAutomateStreamRecovery({
      streamStatus: snapshot.state.status,
      elapsedSeconds: snapshot.health.elapsedSeconds,
      reconnectAttempts: snapshot.health.reconnectAttempts,
      publicLaunchCanStart: publicLaunchChecklist.canStart
    });
  }, [
    chatReader.settings,
    faceTrackingRuntime,
    getAudioLevelSamples,
    liveCaption,
    platformChatAuth,
    platformChatConnection.connection,
    profile,
    readiness,
    scene,
    snapshot,
    streamHealthSamples,
    streamSessionEvents,
    streamSessionSummaries.summaries,
    streamValidationRuns
  ]);
  const qualityAutomationDiagnostics = useMemo(
    () =>
      createStreamDiagnostics(
        scene,
        profile,
        readiness,
        snapshot,
        streamSessionEvents,
        streamHealthSamples,
        streamSessionSummaries.summaries,
        streamValidationRuns,
        faceTrackingRuntime,
        {
          chatReader: chatReader.settings,
          platformChatConnection: platformChatConnection.connection,
          audioLevelSamples: getAudioLevelSamples(),
          liveCaption
        }
      ),
    [
      chatReader.settings,
      faceTrackingRuntime,
      getAudioLevelSamples,
      liveCaption,
      platformChatConnection.connection,
      profile,
      readiness,
      scene,
      snapshot,
      streamHealthSamples,
      streamSessionEvents,
      streamSessionSummaries.summaries,
      streamValidationRuns
    ]
  );
  const qualityAutomationDecision = useMemo(
    () =>
      createStreamQualityAutomationDecision({
        advisor: qualityAutomationDiagnostics.qualityAdvisor,
        streamStatus: snapshot.state.status,
        elapsedSeconds: snapshot.health.elapsedSeconds,
        canApplyLiveTarget: canApplyStreamQualityAdvisorTargetLive(
          profile,
          qualityAutomationDiagnostics.qualityAdvisor.suggestedTarget
        )
      }),
    [profile, qualityAutomationDiagnostics.qualityAdvisor, snapshot.health.elapsedSeconds, snapshot.state.status]
  );

  useStreamAutoRecovery({
    engine,
    snapshot,
    quality: readiness.sanitizedProfile.quality,
    canStart: autoRecoveryCanStart,
    operationInFlight,
    runStreamOperation,
    onRecoveryDecision: recordRecoveryDecision
  });
  useStreamQualityAutomation({
    decision: qualityAutomationDecision,
    streamStatus: snapshot.state.status,
    onDecision: (decision) => recordStreamSessionEvent(createStreamQualityAutomationEvent(decision)),
    onApplyLiveTarget: (target) => {
      const nextProfile = applyStreamQualityAdvisorTarget(profile, target);
      void engine.updateQuality(nextProfile)
        .then(() => setProfile(nextProfile))
        .catch((error) => {
          const safeMessage = errorToSafeMessage(error, "Live quality update failed.");
          recordStreamSessionEvent(
            createStreamQualityAutomationEvent({
              ...qualityAutomationDecision,
              command: "alert",
              key: `live-quality-update-failed:${Date.now()}`,
              severity: "fail",
              title: "Live quality update failed",
              summary: "The native encoder rejected the live quality update.",
              reason: safeMessage,
              action: "Keep the current stream stable; stop and restart with the safer quality target if instability continues."
            })
          );
        });
    },
    onApplyNextTarget: (target) => {
      setProfile((current) => applyStreamQualityAdvisorTarget(current, target));
    }
  });

  const submitChatComment = (author: string, body: string) => {
    setChatReader((current) => enqueueChatMessage(current, createChatMessage({ author, body })));
  };

  const pinChatComment = (messageId: string) => {
    setChatReader((current) => pinChatMessage(current, messageId));
  };

  const unpinChatComment = () => {
    setChatReader(unpinChatMessage);
  };

  const updateChatSettings = (settings: Partial<ChatReaderSettings>) => {
    setChatReader((current) => updateChatReaderSettings(current, settings));
  };

  const clearChatComments = () => {
    clearChatReadout();
  };

  const updateLiveCaptionSettings = (settings: Partial<LiveCaptionSettings>) => {
    setSceneCollection((currentCollection) =>
      updateActiveScene(currentCollection, syncLiveCaptionTextSourceForSettings(selectActiveScene(currentCollection), settings))
    );
    setLiveCaption((current) => updateLiveCaptionSettingsDomain(current, settings));
  };

  const submitTestLiveCaptionCue = () => {
    setLiveCaption((current) =>
      ingestLiveCaptionCue(current, {
        speaker: "Host",
        text: "ライブ字幕テスト",
        language: current.settings.language,
        confidence: 1,
        isFinal: true,
        timestampMs: Date.now()
      })
    );
  };

  const activatePrivacyShield = useCallback(async () => {
    const fromScene = selectActiveScene(sceneCollection);
    const nextCollection = activatePrivacyShieldScene(sceneCollection);
    const nextScene = selectActiveScene(nextCollection);
    const nextProfile = applyEmergencyBroadcastMute(profile);

    if (nextCollection.activeSceneId !== sceneCollection.activeSceneId) {
      startSceneTransitionPreview(fromScene, sceneCollection.transition);
    }
    setSceneCollection(nextCollection);
    setProfile(nextProfile);
    clearChatReadout();
    clearLiveCaptions();
    recordStreamSessionEvent(
      createStreamSafetyEvent(
        "privacy-shield-armed",
        "Privacy Shield switched to a blackout scene, muted all broadcast audio channels, and stopped chat readout."
      )
    );

    if (!shouldPushSceneToEngine(snapshot.state.status)) {
      return;
    }

    try {
      await engine.updateScene(nextScene, { chatMessages: [], captions: [], captionsEnabled: false });
      await engine.updateQuality(nextProfile);
    } catch (error) {
      const safeMessage = errorToSafeMessage(error, "Privacy Shield native update failed.");
      recordStreamSessionEvent(createStreamSafetyEvent("privacy-shield-failed", safeMessage));
    }
  }, [
    clearChatReadout,
    clearLiveCaptions,
    engine,
    profile,
    recordStreamSessionEvent,
    sceneCollection,
    snapshot.state.status,
    startSceneTransitionPreview
  ]);

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

  const rememberPlatformChatOAuthCredential = (credential: PlatformChatOAuthCredential) => {
    const optimisticCredentials = upsertPlatformChatOAuthCredential(platformChatOAuthCredentialsRef.current, credential);
    platformChatOAuthCredentialsRef.current = optimisticCredentials;
    setPlatformChatOAuthCredentials((current) => {
      const nextCredentials = upsertPlatformChatOAuthCredential(current, credential);
      platformChatOAuthCredentialsRef.current = nextCredentials;
      return nextCredentials;
    });
    setPlatformChatAuth((currentAuth) => mergeOAuthAuth(currentAuth, createPlatformChatAuthFromCredentialStore(optimisticCredentials)));
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
      const result = await runPlatformApiOperation("Twitch device OAuth start", () =>
        startTwitchDeviceCodeOAuthFlow(platformChatOAuth, fetch)
      );
      setTwitchDeviceOAuthFlow(result.flow);
      setPlatformChatOAuthStatus(result.message);
      window.open(result.flow.verificationUri, "_blank", "noopener,noreferrer");
    } catch (error) {
      setPlatformChatOAuthStatus(toErrorMessage(error));
    }
  };

  const pollTwitchDeviceOAuth = async () => {
    try {
      const result = await runPlatformApiOperation("Twitch device OAuth polling", () =>
        pollTwitchDeviceCodeOAuthFlow(twitchDeviceOAuthFlow, platformChatOAuth, fetch)
      );
      if (result.status === "pending") {
        setTwitchDeviceOAuthFlow(result.flow);
        setPlatformChatOAuthStatus(result.message);
        return;
      }

      setPlatformChatAuth((current) => mergeOAuthAuth(current, result.auth));
      rememberPlatformChatOAuthCredential(result.credential);
      setTwitchDeviceOAuthFlow(null);
      setPlatformChatOAuthStatus(result.message);
    } catch (error) {
      setPlatformChatOAuthStatus(toErrorMessage(error));
    }
  };

  const applyPlatformChatOAuthCallback = async () => {
    try {
      const result = await runPlatformApiOperation("OAuth callback exchange", () =>
        completePlatformChatOAuthCallback(platformChatOAuth.callbackUrl, platformChatOAuthFlow, platformChatOAuth, fetch)
      );
      setPlatformChatAuth((current) => mergeOAuthAuth(current, result.auth));
      rememberPlatformChatOAuthCredential(result.credential);
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

  const preparePlatformApiCredential = async (
    platform: PlatformChatOAuthCredential["platform"]
  ): Promise<PlatformChatOAuthCredential | null> => {
    const result = await ensureFreshPlatformChatOAuthCredential(
      getPlatformChatOAuthCredential(platformChatOAuthCredentials, platform),
      platformChatOAuth,
      fetch
    );
    if (result.credential && (result.refreshed || result.validated)) {
      rememberPlatformChatOAuthCredential(result.credential);
      if (result.message) {
        setPlatformChatOAuthStatus(result.message);
      }
    }
    return result.credential;
  };

  const applyPlatformStreamKey = async () => {
    const platform = resolvePlatformStreamKeyOperationPlatform(profile);
    try {
      const operationInfo = getPlatformStreamKeyOperationInfo(platform);
      await runPlatformApiOperation(operationInfo.operationLabel, async () => {
        const credential = await preparePlatformApiCredential(platform);
        const result =
          platform === "youtube"
            ? await rotateYouTubeStreamKey(profile, credential, fetch)
            : await syncTwitchStreamKey(profile, credential, fetch);
        setProfile(result.profile);
        setPlatformStreamKeyStatus({ platform, message: result.message });
      });
    } catch (error) {
      setPlatformStreamKeyStatus({ platform, message: toErrorMessage(error) });
    }
  };

  const applyPlatformPublishingSetup = async () => {
    try {
      await runPlatformApiOperation("Platform publishing setup", async () => {
        if (profile.destination.platform === "custom") {
          throw new Error("Platform publishing setup requires a YouTube Live or Twitch destination.");
        }
        const credential = await preparePlatformApiCredential(profile.destination.platform === "youtube-live" ? "youtube" : "twitch");
        const result =
          profile.destination.platform === "youtube-live"
            ? await createYouTubeBroadcastAndBindStream(profile, credential, fetch)
            : await applyTwitchChannelMetadata(profile, credential, fetch);
        setProfile(result.profile);
        setPlatformPublishingStatus(result.message);
      });
    } catch (error) {
      setPlatformPublishingStatus(toErrorMessage(error));
    }
  };

  const transitionYouTubeBroadcastState = async (broadcastStatus: YouTubeBroadcastTransitionStatus) => {
    try {
      await runPlatformApiOperation(`YouTube broadcast ${broadcastStatus}`, async () => {
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
          faceTrackingRuntime,
          {
            chatReader: chatReader.settings,
            platformChatConnection: platformChatConnection.connection,
            audioLevelSamples: getAudioLevelSamples(),
            liveCaption
          }
        );
        const startPreflight = createStreamStartPreflightReport({
          readiness,
          streamStatus: engineSnapshot.state.status,
          enginePlatform: engineSnapshot.platform,
          profile,
          validation: diagnostics.validation,
          validationEvidence: diagnostics.validationEvidence,
          chatReader: chatReader.settings,
          platformChatAuth,
          platformChatOAuthCredentials,
          platformChatConnection: platformChatConnection.connection,
          faceTracking: diagnostics.faceTracking,
          liveCaption: diagnostics.liveCaption
        });
        const publicLaunchChecklist = createPublicLaunchChecklist({
          preflight: startPreflight,
          diagnostics,
          platformPublishingFreshness: assessPlatformPublishingFreshness(diagnostics.platformPublishing),
          profile
        });
        const preflight = createYouTubeBroadcastTransitionPreflightReport({
          profile,
          transitionStatus: broadcastStatus,
          streamStatus: engineSnapshot.state.status,
          validation: diagnostics.validation,
          publicLaunchChecklist,
          platformChatOAuthCredentials
        });
        if (!preflight.canProceed) {
          throw new Error(formatPlatformPublishingPreflightBlockMessage(preflight));
        }
        const credential = await preparePlatformApiCredential("youtube");
        const result = await transitionYouTubeBroadcast(profile, credential, broadcastStatus, fetch);
        setProfile(result.profile);
        setPlatformPublishingStatus(result.message);
        if (broadcastStatus === "live") {
          void runStreamAnnouncementAutoPost(result.profile, "youtube-live-transition");
        }
      });
    } catch (error) {
      setPlatformPublishingStatus(toErrorMessage(error));
    }
  };

  const refreshPlatformPublishingStatus = async () => {
    try {
      await runPlatformApiOperation("Platform publishing status refresh", async () => {
        const credential = await preparePlatformApiCredential(profile.destination.platform === "youtube-live" ? "youtube" : "twitch");
        const result =
          profile.destination.platform === "youtube-live"
            ? await refreshYouTubeBroadcastStatus(profile, credential, fetch)
            : profile.destination.platform === "twitch"
              ? await refreshTwitchChannelStatus(profile, credential, fetch)
              : null;

        if (!result) {
          throw new Error("Platform publishing status refresh requires a YouTube Live or Twitch destination.");
        }

        setProfile(result.profile);
        setPlatformPublishingStatus(result.message);
        if (result.profile.destination.platform === "youtube-live") {
          void runStreamAnnouncementAutoPost(result.profile, "youtube-status-refresh");
        }
        if (result.profile.destination.platform === "twitch") {
          void runStreamAnnouncementAutoPost(result.profile, "twitch-status-refresh");
        }
      });
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
      saveStreamValidationRuns(next, [profile.destination.streamKey, profile.streamAnnouncement.discordWebhookUrl]);
      return next;
    });
  };

  const clearRecordedStreamValidationRuns = () => {
    clearStreamValidationRuns();
    setStreamValidationRuns([]);
  };

  return (
    <Suspense fallback={<div className="studio-loading" role="status">Loading studio...</div>}>
      <StudioScreen
        scene={scene}
        scenes={sceneCollection.scenes}
        activeSceneId={sceneCollection.activeSceneId}
        sceneTransitionSettings={sceneCollection.transition}
        sceneTransitionPreview={sceneTransitionPreview}
        profile={profile}
        selectedSourceId={selectedSourceId}
        snapshot={snapshot}
        streamSessionEvents={streamSessionEvents}
        streamHealthSamples={streamHealthSamples}
        streamSessionSummaries={streamSessionSummaries.summaries}
        audioLevelSamples={getAudioLevelSamples()}
        streamValidationRuns={streamValidationRuns}
        qualityAutomationDecision={qualityAutomationDecision}
        operationStatus={operationStatus}
        streamAnnouncementPromptNonce={streamAnnouncementPromptNonce}
        streamAnnouncementAutoPostStatus={streamAnnouncementAutoPostStatus}
        streamAnnouncementWebhookStorageNotice="Browser mode keeps the Discord webhook URL in memory only; reload clears it."
        readiness={readiness}
        liveCaption={liveCaption}
        liveCaptionCues={liveCaptionCues}
        chatReader={chatReader}
        platformChat={profile.platformChat}
        platformChatAuth={platformChatAuth}
        platformChatOAuth={platformChatOAuth}
        platformChatOAuthCredentials={platformChatOAuthCredentials}
        platformChatOAuthFlow={platformChatOAuthFlow}
        twitchDeviceOAuthFlow={twitchDeviceOAuthFlow}
        platformChatOAuthStatus={platformChatOAuthStatus}
        platformStreamKeyStatus={platformStreamKeyStatusMessage}
        platformPublishingStatus={platformPublishingStatus}
        platformApiOperationLabel={platformApiOperationLabel}
        platformChatConnection={platformChatConnection.connection}
        avatarRuntime={avatarRuntime}
        faceTrackingRuntime={faceTrackingRuntime}
        onSceneChange={updateActiveSceneDocument}
        onSceneSwitch={switchScene}
        onSceneCreate={createScene}
        onSceneDuplicate={duplicateScene}
        onSceneTransitionChange={updateSceneTransitionSettings}
        onProfileChange={setProfile}
        onSelectSource={setSelectedSourceId}
        onMicLevelChange={updateMicLevel}
        onExpressionChange={updateExpression}
        onFaceTrackingCalibrate={calibrateFaceTracking}
        onStart={startStream}
        onStop={stopStream}
        onReconnect={reconnectStream}
        onChatCommentSubmit={submitChatComment}
        onChatCommentPin={pinChatComment}
        onChatCommentUnpin={unpinChatComment}
        onChatReaderSettingsChange={updateChatSettings}
        onChatCommentsClear={clearChatComments}
        onLiveCaptionSettingsChange={updateLiveCaptionSettings}
        onLiveCaptionClear={clearLiveCaptions}
        onLiveCaptionTestCue={submitTestLiveCaptionCue}
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
        onStreamAnnouncementWebhookTest={testStreamAnnouncementAutoPost}
        onPlatformChatConnect={platformChatConnection.connect}
        onPlatformChatDisconnect={platformChatConnection.disconnect}
        onPlatformChatSampleIngest={ingestPlatformChatSample}
        onClearStreamKey={clearSavedStreamKey}
        onPrivacyShieldActivate={activatePrivacyShield}
        onClearStreamSessionSummaries={clearCompletedStreamSessionSummaries}
        onRecordStreamValidationRun={recordStreamValidationRun}
        onClearStreamValidationRuns={clearRecordedStreamValidationRuns}
      />
    </Suspense>
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

const shouldDisconnectPlatformChatOnStreamStop = (phase: string): boolean =>
  phase === "connecting" || phase === "connected" || phase === "failed";

const toErrorMessage = (error: unknown): string => errorToSafeMessage(error, "OAuth operation failed.");
