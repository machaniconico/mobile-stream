import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createAvatarRuntimeStateFromScene, setExpression, tickAutoBlink, type AvatarExpression } from "../domain/avatar";
import {
  clearChatReaderSession,
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
  createLostFaceTrackingFrame,
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
  createEmptyPlatformChatOAuthCredentialStore,
  createPlatformChatAuthFromCredentialStore,
  createDefaultPlatformChatOAuthSettings,
  createPlatformChatOAuthFlow,
  ensureFreshPlatformChatOAuthCredential,
  getPlatformChatOAuthCredential,
  normalizePlatformChatOAuthSettings,
  pollTwitchDeviceCodeOAuthFlow,
  refreshTwitchOAuthCredential,
  refreshYouTubeOAuthCredential,
  shouldRefreshPlatformChatOAuthCredential,
  shouldValidateTwitchOAuthCredential,
  startTwitchDeviceCodeOAuthFlow,
  upsertPlatformChatOAuthCredential,
  validateTwitchOAuthToken,
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
import {
  createYouTubeBroadcastTransitionPreflightReport,
  formatPlatformPublishingPreflightBlockMessage
} from "../domain/platformPublishingPreflight";
import { assessPlatformPublishingFreshness } from "../domain/platformPublishingFreshness";
import {
  createPublicLaunchChecklist,
  formatPublicLaunchChecklistBlockMessage
} from "../domain/publicLaunchChecklist";
import { rotateYouTubeStreamKey, syncTwitchStreamKey } from "../domain/platformStreamKeys";
import { clearStreamKey, createDefaultStudioProfile, type StudioProfile } from "../domain/profiles";
import { createReadinessReport } from "../domain/readiness";
import {
  createDefaultScene,
  stripTransientSceneRuntime,
  updateSource,
  type Live2DSource,
  type PNGTuberSource,
  type SceneDocument
} from "../domain/scene";
import {
  createFailedStreamOperation,
  createPendingStreamOperation,
  type StreamControlAction,
  type StreamOperationStatus
} from "../domain/streamOperation";
import { canAutomateStreamRecovery } from "../domain/streamRecovery";
import {
  createStreamStartPreflightReport,
  formatStreamStartPreflightBlockMessage
} from "../domain/streamStartPreflight";
import { createStreamDiagnostics } from "../domain/streamDiagnostics";
import { createPlatformApiRetrySchedule } from "../domain/platformApiRetry";
import { createPlatformApiOperationGate } from "../domain/platformApiOperationGate";
import { errorToSafeMessage } from "../domain/sensitiveText";
import {
  createStreamChatEvent,
  createStreamChatSpeechEvent,
  createStreamChatReconnectEvent,
  createStreamOperationEvent,
  createStreamQualityAutomationEvent,
  createStreamRecoveryEvent
} from "../domain/streamSessionLog";
import {
  applyStreamQualityAdvisorTarget,
  canApplyStreamQualityAdvisorTargetLive
} from "../domain/streamQualityAdvisor";
import { createStreamQualityAutomationDecision } from "../domain/streamQualityAutomation";
import {
  appendStreamAudioLevelSample,
  createStreamAudioLevelSample,
  type StreamAudioLevelSample,
  type StreamAudioLevelSource,
  type StreamSessionSummary
} from "../domain/streamSessionSummary";
import {
  appendStreamValidationRun,
  mergeStreamValidationRuns,
  normalizeStreamValidationRuns,
  type StreamValidationRun
} from "../domain/streamValidationEvidence";
import { MockLiveCaster } from "../native/MockLiveCaster";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import { useChatSpeechQueue, type ChatSpeechQueueEvent } from "../native/ChatSpeechEngine";
import { usePlatformChatConnection } from "../native/usePlatformChatConnection";
import { useStreamAutoRecovery } from "../native/useStreamAutoRecovery";
import { useStreamHealthHistory } from "../native/useStreamHealthHistory";
import { useStreamQualityAutomation } from "../native/useStreamQualityAutomation";
import { useStreamSessionLog } from "../native/useStreamSessionLog";
import { useStreamSessionSummaries } from "../native/useStreamSessionSummaries";
import { AndroidLiveCaster, canUseAndroidLiveCaster } from "./AndroidLiveCaster";
import { IOSLiveCaster, canUseIOSLiveCaster } from "./IOSLiveCaster";
import { MobileStudioScreen } from "./MobileStudioScreen";
import { NativeChatSpeechEngine } from "./NativeChatSpeechEngine";
import { NativeFaceTrackingInput } from "./NativeFaceTrackingInput";
import { loadMobileScene, saveMobileScene } from "./sceneStore";
import {
  clearMobileStreamSessionSummaries,
  loadMobileStreamSessionSummaries,
  saveMobileStreamSessionSummaries
} from "./sessionSummaryStore";
import {
  clearMobileStreamValidationRuns,
  loadMobileStreamValidationRuns,
  saveMobileStreamValidationRuns
} from "./validationRunStore";
import {
  clearSecureOAuthCredential,
  loadSecureOAuthCredentials,
  loadSecureProfile,
  saveSecureOAuthCredentials,
  saveSecureProfile
} from "./secureProfileStore";
import { useAudioRouteMonitor } from "./useAudioRouteMonitor";

const isAvatarSource = (source: SceneDocument["sources"][number]): source is PNGTuberSource | Live2DSource =>
  source.kind === "pngtuber" || source.kind === "live2d";

export const MobileApp = () => {
  const engine = useMemo(
    () => (canUseIOSLiveCaster() ? new IOSLiveCaster() : canUseAndroidLiveCaster() ? new AndroidLiveCaster() : new MockLiveCaster()),
    []
  );
  const platformApiOperationGate = useMemo(() => createPlatformApiOperationGate(), []);
  const chatSpeechEngine = useMemo(() => new NativeChatSpeechEngine(), []);
  const faceTrackingInput = useMemo(() => new NativeFaceTrackingInput(), []);
  const [scene, setScene] = useState<SceneDocument>(() => createDefaultScene());
  const [profile, setProfile] = useState<StudioProfile>(() => createDefaultStudioProfile());
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [persistedStreamSessionSummaries, setPersistedStreamSessionSummaries] = useState<StreamSessionSummary[]>([]);
  const [streamSessionSummariesLoaded, setStreamSessionSummariesLoaded] = useState(false);
  const [streamValidationRuns, setStreamValidationRuns] = useState<StreamValidationRun[]>([]);
  const [streamValidationRunsLoaded, setStreamValidationRunsLoaded] = useState(false);
  const [chatReader, setChatReader] = useState(() => createDefaultChatReaderState());
  const [platformChatAuth, setPlatformChatAuth] = useState<PlatformChatAuthSession>(() => createDefaultPlatformChatAuthSession());
  const [platformChatOAuth, setPlatformChatOAuth] = useState<PlatformChatOAuthSettings>(() => createDefaultPlatformChatOAuthSettings());
  const [platformChatOAuthFlow, setPlatformChatOAuthFlow] = useState<PlatformChatOAuthFlow | null>(null);
  const [twitchDeviceOAuthFlow, setTwitchDeviceOAuthFlow] = useState<TwitchDeviceCodeOAuthFlow | null>(null);
  const [platformChatOAuthStatus, setPlatformChatOAuthStatus] = useState("OAuth not started.");
  const [platformChatOAuthCredentials, setPlatformChatOAuthCredentials] = useState<PlatformChatOAuthCredentialStore>(() =>
    createEmptyPlatformChatOAuthCredentialStore()
  );
  const [platformStreamKeyStatus, setPlatformStreamKeyStatus] = useState("Platform stream key sync idle.");
  const [platformPublishingStatus, setPlatformPublishingStatus] = useState("Platform publishing setup idle.");
  const [selectedSourceId, setSelectedSourceId] = useState("source-avatar");
  const [snapshot, setSnapshot] = useState<NativeEngineSnapshot>(() => engine.getSnapshot());
  const [avatarRuntime, setAvatarRuntime] = useState(() => createAvatarRuntimeStateFromScene(scene, Date.now()));
  const [faceTrackingRuntime, setFaceTrackingRuntime] = useState(() => createFaceTrackingRuntimeState(Date.now()));
  const [operationStatus, setOperationStatus] = useState<StreamOperationStatus | null>(null);
  const audioRoute = useAudioRouteMonitor();
  const operationInFlight = useRef(false);
  const platformChatOAuthSyncInFlight = useRef(false);
  const platformChatOAuthSyncRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const platformChatOAuthSyncRetryUntil = useRef(0);
  const platformChatOAuthSyncRequest = useRef<(() => void) | null>(null);
  const audioLevelSamplesRef = useRef<StreamAudioLevelSample[]>([]);
  const readiness = useMemo(() => createReadinessReport(scene, profile), [scene, profile]);
  const persistableSceneJson = useMemo(() => JSON.stringify(stripTransientSceneRuntime(scene)), [scene]);
  const { events: streamSessionEvents, recordEvent: recordStreamSessionEvent } = useStreamSessionLog(snapshot);
  const recordAudioLevelSample = useCallback((level: number, source: StreamAudioLevelSource) => {
    audioLevelSamplesRef.current = appendStreamAudioLevelSample(
      audioLevelSamplesRef.current,
      createStreamAudioLevelSample(level, source)
    );
  }, []);
  const getAudioLevelSamples = useCallback(() => audioLevelSamplesRef.current, []);
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
  const persistStreamSessionSummaries = useCallback((summaries: StreamSessionSummary[]) => {
    if (!streamSessionSummariesLoaded) {
      return;
    }
    void saveMobileStreamSessionSummaries(summaries).catch(() => undefined);
  }, [streamSessionSummariesLoaded]);
  const clearPersistedStreamSessionSummaries = useCallback(() => {
    setPersistedStreamSessionSummaries([]);
    void clearMobileStreamSessionSummaries().catch(() => undefined);
  }, []);
  const streamSessionSummaries = useStreamSessionSummaries({
    snapshot,
    events: streamSessionEvents,
    healthSamples: streamHealthSamples,
    quality: readiness.sanitizedProfile.quality,
    initialSummaries: persistedStreamSessionSummaries,
    initialSummariesReady: streamSessionSummariesLoaded,
    onSummariesChange: streamSessionSummariesLoaded ? persistStreamSessionSummaries : undefined,
    onSummariesClear: clearPersistedStreamSessionSummaries,
    getAudioLevelSamples
  });
  const captureOAuthCallbackUrl = useCallback((url: string | null) => {
    if (!url || !isPlatformChatOAuthCallbackUrl(url)) {
      return;
    }
    setPlatformChatOAuth((current) => ({
      ...current,
      callbackUrl: url
    }));
    setPlatformChatOAuthStatus("OAuth callback received. Apply it to finish this session.");
  }, []);

  const clearPlatformChatOAuthSyncRetry = useCallback(() => {
    if (platformChatOAuthSyncRetryTimer.current) {
      clearTimeout(platformChatOAuthSyncRetryTimer.current);
      platformChatOAuthSyncRetryTimer.current = null;
    }
    platformChatOAuthSyncRetryUntil.current = 0;
  }, []);

  const persistPlatformChatOAuthCredential = useCallback(async (
    credential: PlatformChatOAuthCredential,
    baseCredentials: PlatformChatOAuthCredentialStore = platformChatOAuthCredentials
  ): Promise<PlatformChatOAuthCredentialStore> => {
    clearPlatformChatOAuthSyncRetry();
    const nextCredentials = upsertPlatformChatOAuthCredential(baseCredentials, credential);
    setPlatformChatAuth((current) => mergeOAuthAuth(current, createPlatformChatAuthFromCredentialStore(nextCredentials)));
    setPlatformChatOAuthCredentials(nextCredentials);
    await saveSecureOAuthCredentials(nextCredentials);
    return nextCredentials;
  }, [clearPlatformChatOAuthSyncRetry, platformChatOAuthCredentials]);

  const clearStoredPlatformChatOAuthCredential = useCallback(async (
    status: string,
    platform?: PlatformChatOAuthCredential["platform"]
  ) => {
    clearPlatformChatOAuthSyncRetry();
    const nextCredentials = platform
      ? {
          ...platformChatOAuthCredentials,
          [platform]: null
        }
      : createEmptyPlatformChatOAuthCredentialStore();
    setPlatformChatOAuthCredentials(nextCredentials);
    if (platform) {
      setPlatformChatAuth((current) =>
        normalizePlatformChatAuthSession({
          youtubeAccessToken: platform === "youtube" ? "" : current.youtubeAccessToken,
          twitchOauthToken: platform === "twitch" ? "" : current.twitchOauthToken,
          twitchLogin: platform === "twitch" ? "" : current.twitchLogin
        })
      );
      await saveSecureOAuthCredentials(nextCredentials).catch(() => undefined);
    } else {
      setPlatformChatAuth(createDefaultPlatformChatAuthSession());
      await clearSecureOAuthCredential().catch(() => undefined);
    }
    setPlatformChatOAuthStatus(status);
  }, [clearPlatformChatOAuthSyncRetry, platformChatOAuthCredentials]);

  const syncStoredPlatformChatOAuthCredential = useCallback(
    async (credentialOverride?: PlatformChatOAuthCredential | null) => {
      if (!credentialOverride && platformChatOAuthSyncRetryUntil.current > Date.now()) {
        return;
      }

      const credentials = credentialOverride
        ? [credentialOverride]
        : [platformChatOAuthCredentials.youtube, platformChatOAuthCredentials.twitch].filter(
            (credential): credential is PlatformChatOAuthCredential => Boolean(credential)
          );
      if (credentials.length === 0 || platformChatOAuthSyncInFlight.current) {
        return;
      }
      if (!credentialOverride && platformApiOperationGate.getCurrentLabel()) {
        return;
      }

      platformChatOAuthSyncInFlight.current = true;
      clearPlatformChatOAuthSyncRetry();
      let activeCredentialPlatform: PlatformChatOAuthCredential["platform"] | null = null;
      let nextCredentials = platformChatOAuthCredentials;
      try {
        await platformApiOperationGate.run("Stored OAuth credential maintenance", async () => {
          for (const credential of credentials) {
            activeCredentialPlatform = credential.platform;
            if (shouldRefreshPlatformChatOAuthCredential(credential)) {
              const refreshed =
                credential.platform === "youtube"
                  ? await refreshYouTubeOAuthCredential(credential, platformChatOAuth, fetch)
                  : await refreshTwitchOAuthCredential(credential, platformChatOAuth, fetch);
              nextCredentials = await persistPlatformChatOAuthCredential(refreshed, nextCredentials);
              setPlatformChatOAuthStatus(`${credential.platform === "youtube" ? "YouTube" : "Twitch"} OAuth token refreshed from secure storage.`);
              continue;
            }

            if (credential.platform === "twitch" && shouldValidateTwitchOAuthCredential(credential)) {
              const validatedToken = await validateTwitchOAuthToken(credential.accessToken, fetch);
              const validated = {
                ...credential,
                ...validatedToken,
                refreshToken: credential.refreshToken,
                scopes: validatedToken.scopes.length > 0 ? validatedToken.scopes : credential.scopes,
                clientId: credential.clientId,
                redirectUri: credential.redirectUri
              };
              nextCredentials = await persistPlatformChatOAuthCredential(validated, nextCredentials);
              setPlatformChatOAuthStatus("Twitch OAuth token validated from secure storage.");
            }
          }
        });
      } catch (error) {
        const message = toErrorMessage(error);
        if (activeCredentialPlatform && shouldClearStoredOAuthCredential(message)) {
          await clearStoredPlatformChatOAuthCredential(`Stored OAuth credential needs reconnect: ${message}`, activeCredentialPlatform);
        } else {
          const retrySchedule = createPlatformApiRetrySchedule(error, {
            fallbackDelayMs: 60000,
            minDelayMs: 5000,
            maxDelayMs: 300000
          });
          if (retrySchedule.retryable && retrySchedule.delayMs !== null) {
            const retryLabel = retrySchedule.label ?? "soon";
            platformChatOAuthSyncRetryUntil.current = Date.now() + retrySchedule.delayMs;
            platformChatOAuthSyncRetryTimer.current = setTimeout(() => {
              platformChatOAuthSyncRetryTimer.current = null;
              platformChatOAuthSyncRetryUntil.current = 0;
              platformChatOAuthSyncRequest.current?.();
            }, retrySchedule.delayMs);
            setPlatformChatOAuthStatus(
              `Stored OAuth credential sync failed; scheduled background retry in ${retryLabel}: ${message}`
            );
          } else {
            setPlatformChatOAuthStatus(`Stored OAuth credential sync failed; will retry: ${message}`);
          }
        }
      } finally {
        platformChatOAuthSyncInFlight.current = false;
      }
    },
    [
      clearStoredPlatformChatOAuthCredential,
      clearPlatformChatOAuthSyncRetry,
      persistPlatformChatOAuthCredential,
      platformApiOperationGate,
      platformChatOAuth,
      platformChatOAuthCredentials
    ]
  );

  useEffect(() => {
    platformChatOAuthSyncRequest.current = () => {
      void syncStoredPlatformChatOAuthCredential();
    };
    return () => {
      platformChatOAuthSyncRequest.current = null;
    };
  }, [syncStoredPlatformChatOAuthCredential]);

  useEffect(() => engine.subscribe(setSnapshot), [engine]);
  useChatSpeechQueue(chatReader, setChatReader, chatSpeechEngine, { onSpeechEvent: recordChatSpeechEvent });

  useEffect(() => () => faceTrackingInput.stop(), [faceTrackingInput]);

  useEffect(() => {
    void Linking.getInitialURL().then(captureOAuthCallbackUrl).catch(() => undefined);
    const subscription = Linking.addEventListener("url", (event) => {
      captureOAuthCallbackUrl(event.url);
    });
    return () => {
      subscription.remove();
    };
  }, [captureOAuthCallbackUrl]);

  useEffect(() => {
    let cancelled = false;
    void loadMobileScene()
      .catch(() => null)
      .then((storedScene) => {
        if (cancelled || !storedScene) {
          return;
        }
        setScene(storedScene);
        setAvatarRuntime(createAvatarRuntimeStateFromScene(storedScene, Date.now()));
        setSelectedSourceId((currentSourceId) =>
          storedScene.sources.some((source) => source.id === currentSourceId)
            ? currentSourceId
            : storedScene.sources[0]?.id ?? currentSourceId
        );
      })
      .finally(() => {
        if (!cancelled) {
          setSceneLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSecureProfile()
      .catch(() => null)
      .then((storedProfile) => {
        if (!cancelled && storedProfile) {
          setProfile(storedProfile);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProfileLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadMobileStreamSessionSummaries()
      .catch(() => [])
      .then((storedSummaries) => {
        if (!cancelled) {
          setPersistedStreamSessionSummaries(storedSummaries);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStreamSessionSummariesLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadMobileStreamValidationRuns()
      .catch(() => [])
      .then((storedRuns) => {
        if (!cancelled) {
          setStreamValidationRuns((current) => mergeStreamValidationRuns(current, storedRuns));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStreamValidationRunsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!streamValidationRunsLoaded) {
      return;
    }
    void saveMobileStreamValidationRuns(streamValidationRuns).catch(() => undefined);
  }, [streamValidationRuns, streamValidationRunsLoaded]);

  useEffect(() => {
    let cancelled = false;
    void loadSecureOAuthCredentials()
      .catch(() => createEmptyPlatformChatOAuthCredentialStore())
      .then((storedCredentials) => {
        if (cancelled || (!storedCredentials.youtube && !storedCredentials.twitch)) {
          return;
        }
        setPlatformChatOAuthCredentials(storedCredentials);
        setPlatformChatAuth((current) => mergeOAuthAuth(current, createPlatformChatAuthFromCredentialStore(storedCredentials)));
        setPlatformChatOAuthStatus(
          `${formatStoredOAuthPlatforms(storedCredentials)} OAuth credential${storedCredentials.youtube && storedCredentials.twitch ? "s" : ""} loaded from secure storage.`
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!platformChatOAuthCredentials.youtube && !platformChatOAuthCredentials.twitch) {
      clearPlatformChatOAuthSyncRetry();
      return undefined;
    }

    const timer = setInterval(() => {
      void syncStoredPlatformChatOAuthCredential();
    }, 60000);
    void syncStoredPlatformChatOAuthCredential();
    return () => clearInterval(timer);
  }, [clearPlatformChatOAuthSyncRetry, platformChatOAuthCredentials, syncStoredPlatformChatOAuthCredential]);

  useEffect(() => () => clearPlatformChatOAuthSyncRetry(), [clearPlatformChatOAuthSyncRetry]);

  useEffect(() => {
    if (!shouldPushSceneToEngine(snapshot.state.status)) {
      return;
    }
    void engine.updateScene(scene);
  }, [engine, scene, snapshot.state.status]);

  useEffect(() => {
    if (!profileLoaded) {
      return;
    }
    void saveSecureProfile(profile).catch(() => undefined);
  }, [profile, profileLoaded]);

  useEffect(() => {
    if (!sceneLoaded) {
      return;
    }
    void saveMobileScene(JSON.parse(persistableSceneJson) as SceneDocument).catch(() => undefined);
  }, [persistableSceneJson, sceneLoaded]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const trackingProfile = profile.faceTracking;

      setFaceTrackingRuntime((currentTracking) => {
        faceTrackingInput.refresh(trackingProfile, now);
        const nativeFrame =
          trackingProfile.inputMode === "native-camera" ? faceTrackingInput.readFrame(now) : null;
        const frame =
          trackingProfile.inputMode === "native-camera"
            ? nativeFrame ?? createLostFaceTrackingFrame(now)
            : createSimulatedFaceTrackingFrame(now, trackingProfile);
        const nextTracking = trackingProfile.enabled
          ? updateFaceTrackingRuntime(
              currentTracking,
              frame,
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
    }, 140);
    return () => clearInterval(timer);
  }, [faceTrackingInput, profile.faceTracking, recordAudioLevelSample]);

  const updateMicLevel = (level: number) => {
    recordAudioLevelSample(level, "manual");
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

  const clearChatReadout = useCallback(() => {
    void chatSpeechEngine.stop().catch(() => undefined);
    setChatReader(clearChatReaderSession);
  }, [chatSpeechEngine]);

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
          audioRoute
        }
      );
      const preflight = createStreamStartPreflightReport({
        readiness,
        streamStatus: engineSnapshot.state.status,
        profile,
        validation: diagnostics.validation,
        chatReader: chatReader.settings,
        platformChatAuth,
        platformChatOAuthCredentials,
        platformChatConnection: platformChatConnection.connection,
        audioRoute
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
        audioRoute
      }
    );
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: snapshot.state.status,
      profile,
      validation: diagnostics.validation,
      chatReader: chatReader.settings,
      platformChatAuth,
      platformChatOAuthCredentials,
      platformChatConnection: platformChatConnection.connection,
      audioRoute
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
    audioRoute,
    chatReader.settings,
    faceTrackingRuntime,
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
          audioRoute
        }
      ),
    [
      audioRoute,
      chatReader.settings,
      faceTrackingRuntime,
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

  const updateChatSettings = (settings: Partial<ChatReaderSettings>) => {
    setChatReader((current) => updateChatReaderSettings(current, settings));
  };

  const clearChatComments = () => {
    clearChatReadout();
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

  const startPlatformChatOAuth = async () => {
    try {
      const flow = createPlatformChatOAuthFlow(profile.platformChat.platform, platformChatOAuth);
      setPlatformChatOAuthFlow(flow);
      setPlatformChatOAuthStatus(`OAuth started for ${profile.platformChat.platform}. Complete consent and paste the callback URL.`);
      await Linking.openURL(flow.authorizationUrl);
    } catch (error) {
      setPlatformChatOAuthStatus(toErrorMessage(error));
    }
  };

  const startTwitchDeviceOAuth = async () => {
    try {
      const result = await platformApiOperationGate.run("Twitch device OAuth start", () =>
        startTwitchDeviceCodeOAuthFlow(platformChatOAuth, fetch)
      );
      setTwitchDeviceOAuthFlow(result.flow);
      setPlatformChatOAuthStatus(result.message);
      await Linking.openURL(result.flow.verificationUri);
    } catch (error) {
      setPlatformChatOAuthStatus(toErrorMessage(error));
    }
  };

  const pollTwitchDeviceOAuth = async () => {
    try {
      const result = await platformApiOperationGate.run("Twitch device OAuth polling", () =>
        pollTwitchDeviceCodeOAuthFlow(twitchDeviceOAuthFlow, platformChatOAuth, fetch)
      );
      if (result.status === "pending") {
        setTwitchDeviceOAuthFlow(result.flow);
        setPlatformChatOAuthStatus(result.message);
        return;
      }

      await persistPlatformChatOAuthCredential(result.credential);
      setTwitchDeviceOAuthFlow(null);
      setPlatformChatOAuthStatus(result.message);
    } catch (error) {
      setPlatformChatOAuthStatus(toErrorMessage(error));
    }
  };

  const applyPlatformChatOAuthCallback = async () => {
    try {
      const result = await platformApiOperationGate.run("OAuth callback exchange", () =>
        completePlatformChatOAuthCallback(platformChatOAuth.callbackUrl, platformChatOAuthFlow, platformChatOAuth, fetch)
      );
      await persistPlatformChatOAuthCredential(result.credential);
      setPlatformChatOAuthFlow(null);
      setPlatformChatOAuth((current) => ({
        ...current,
        callbackUrl: ""
      }));
      setPlatformChatOAuthStatus(`${result.credential.platform === "youtube" ? "YouTube" : "Twitch"} OAuth connected and saved securely on this device.`);
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
      await persistPlatformChatOAuthCredential(result.credential);
      if (result.message) {
        setPlatformChatOAuthStatus(result.message);
      }
    }
    return result.credential;
  };

  const applyPlatformStreamKey = async () => {
    try {
      await platformApiOperationGate.run("Platform stream key sync", async () => {
        const platform = resolvePlatformApiCredentialPlatform(profile);
        const credential = await preparePlatformApiCredential(platform);
        const result =
          platform === "youtube"
            ? await rotateYouTubeStreamKey(profile, credential, fetch)
            : await syncTwitchStreamKey(profile, credential, fetch);
        setProfile(result.profile);
        await saveSecureProfile(result.profile).catch(() => undefined);
        setPlatformStreamKeyStatus(result.message);
      });
    } catch (error) {
      setPlatformStreamKeyStatus(toErrorMessage(error));
    }
  };

  const applyPlatformPublishingSetup = async () => {
    try {
      await platformApiOperationGate.run("Platform publishing setup", async () => {
        if (profile.destination.platform === "custom") {
          throw new Error("Platform publishing setup requires a YouTube Live or Twitch destination.");
        }
        const credential = await preparePlatformApiCredential(profile.destination.platform === "youtube-live" ? "youtube" : "twitch");
        const result =
          profile.destination.platform === "youtube-live"
            ? await createYouTubeBroadcastAndBindStream(profile, credential, fetch)
            : await applyTwitchChannelMetadata(profile, credential, fetch);
        setProfile(result.profile);
        await saveSecureProfile(result.profile).catch(() => undefined);
        setPlatformPublishingStatus(result.message);
      });
    } catch (error) {
      setPlatformPublishingStatus(toErrorMessage(error));
    }
  };

  const transitionYouTubeBroadcastState = async (broadcastStatus: YouTubeBroadcastTransitionStatus) => {
    try {
      await platformApiOperationGate.run(`YouTube broadcast ${broadcastStatus}`, async () => {
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
            audioRoute
          }
        );
        const startPreflight = createStreamStartPreflightReport({
          readiness,
          streamStatus: engineSnapshot.state.status,
          profile,
          validation: diagnostics.validation,
          chatReader: chatReader.settings,
          platformChatAuth,
          platformChatOAuthCredentials,
          platformChatConnection: platformChatConnection.connection,
          audioRoute
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
        await saveSecureProfile(result.profile).catch(() => undefined);
        setPlatformPublishingStatus(result.message);
      });
    } catch (error) {
      setPlatformPublishingStatus(toErrorMessage(error));
    }
  };

  const refreshPlatformPublishingStatus = async () => {
    try {
      await platformApiOperationGate.run("Platform publishing status refresh", async () => {
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
        await saveSecureProfile(result.profile).catch(() => undefined);
        setPlatformPublishingStatus(result.message);
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

  const clearSavedStreamKey = async () => {
    if (operationInFlight.current) {
      return;
    }
    const nextProfile = clearStreamKey(profile);
    setProfile(nextProfile);
    await saveSecureProfile(nextProfile).catch(() => undefined);
  };

  const clearCompletedStreamSessionSummaries = () => {
    streamSessionSummaries.clearSummaries();
  };

  const recordStreamValidationRun = (run: StreamValidationRun) => {
    setStreamValidationRuns((current) => {
      const next = appendStreamValidationRun(current, run);
      return next;
    });
  };

  const clearRecordedStreamValidationRuns = () => {
    setStreamValidationRuns([]);
    void clearMobileStreamValidationRuns().catch(() => undefined);
  };

  return (
    <SafeAreaProvider>
      <MobileStudioScreen
        scene={scene}
        profile={profile}
        selectedSourceId={selectedSourceId}
        snapshot={snapshot}
        streamSessionEvents={streamSessionEvents}
        streamHealthSamples={streamHealthSamples}
        streamSessionSummaries={streamSessionSummaries.summaries}
        streamValidationRuns={streamValidationRuns}
        qualityAutomationDecision={qualityAutomationDecision}
        operationStatus={operationStatus}
        readiness={readiness}
        chatReader={chatReader}
        platformChat={profile.platformChat}
        platformChatAuth={platformChatAuth}
        platformChatOAuth={platformChatOAuth}
        platformChatOAuthCredentials={platformChatOAuthCredentials}
        platformChatOAuthFlow={platformChatOAuthFlow}
        twitchDeviceOAuthFlow={twitchDeviceOAuthFlow}
        platformChatOAuthStatus={platformChatOAuthStatus}
        platformStreamKeyStatus={platformStreamKeyStatus}
        platformPublishingStatus={platformPublishingStatus}
        platformChatConnection={platformChatConnection.connection}
        audioRoute={audioRoute}
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
        onChatCommentsClear={clearChatComments}
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
    </SafeAreaProvider>
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

const resolvePlatformApiCredentialPlatform = (
  profile: Pick<StudioProfile, "destination" | "platformChat">
): PlatformChatOAuthCredential["platform"] =>
  profile.destination.platform === "youtube-live"
    ? "youtube"
    : profile.destination.platform === "twitch"
      ? "twitch"
      : profile.platformChat.platform;

const formatStoredOAuthPlatforms = (credentials: PlatformChatOAuthCredentialStore): string =>
  [credentials.youtube ? "YouTube" : "", credentials.twitch ? "Twitch" : ""].filter(Boolean).join(" and ");

const toErrorMessage = (error: unknown): string => errorToSafeMessage(error, "OAuth operation failed.");

const isPlatformChatOAuthCallbackUrl = (url: string): boolean =>
  url.startsWith("mobilelivecaster://oauth/") || url.startsWith("com.mobilelivecaster.app:/oauth/");

const shouldClearStoredOAuthCredential = (message: string): boolean => /HTTP (400|401|403)\b/.test(message);
