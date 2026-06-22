import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
import { MockLiveCaster } from "../native/MockLiveCaster";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import { useChatSpeechQueue } from "../native/ChatSpeechEngine";
import { AndroidLiveCaster, canUseAndroidLiveCaster } from "./AndroidLiveCaster";
import { IOSLiveCaster, canUseIOSLiveCaster } from "./IOSLiveCaster";
import { MobileStudioScreen } from "./MobileStudioScreen";
import { NativeChatSpeechEngine } from "./NativeChatSpeechEngine";
import { NativeFaceTrackingInput } from "./NativeFaceTrackingInput";
import { loadMobileScene, saveMobileScene } from "./sceneStore";
import { loadSecureProfile, saveSecureProfile } from "./secureProfileStore";

const isAvatarSource = (source: SceneDocument["sources"][number]): source is PNGTuberSource | Live2DSource =>
  source.kind === "pngtuber" || source.kind === "live2d";

export const MobileApp = () => {
  const engine = useMemo(
    () => (canUseIOSLiveCaster() ? new IOSLiveCaster() : canUseAndroidLiveCaster() ? new AndroidLiveCaster() : new MockLiveCaster()),
    []
  );
  const chatSpeechEngine = useMemo(() => new NativeChatSpeechEngine(), []);
  const faceTrackingInput = useMemo(() => new NativeFaceTrackingInput(), []);
  const [scene, setScene] = useState<SceneDocument>(() => createDefaultScene());
  const [profile, setProfile] = useState<StudioProfile>(() => createDefaultStudioProfile());
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [chatReader, setChatReader] = useState(() => createDefaultChatReaderState());
  const [selectedSourceId, setSelectedSourceId] = useState("source-avatar");
  const [snapshot, setSnapshot] = useState<NativeEngineSnapshot>(() => engine.getSnapshot());
  const [avatarRuntime, setAvatarRuntime] = useState(() => createAvatarRuntimeStateFromScene(scene, Date.now()));
  const [faceTrackingRuntime, setFaceTrackingRuntime] = useState(() => createFaceTrackingRuntimeState(Date.now()));
  const [operationStatus, setOperationStatus] = useState<StreamOperationStatus | null>(null);
  const operationInFlight = useRef(false);
  const readiness = useMemo(() => createReadinessReport(scene, profile), [scene, profile]);
  const persistableSceneJson = useMemo(() => JSON.stringify(stripTransientSceneRuntime(scene)), [scene]);

  useEffect(() => engine.subscribe(setSnapshot), [engine]);
  useChatSpeechQueue(chatReader, setChatReader, chatSpeechEngine);

  useEffect(() => () => faceTrackingInput.stop(), [faceTrackingInput]);

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
        const frame = nativeFrame ?? createSimulatedFaceTrackingFrame(now, trackingProfile);
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
  }, [faceTrackingInput, profile.faceTracking]);

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
      if (!readiness.canStart) {
        return;
      }
      await engine.prepare(scene, readiness.sanitizedProfile);
      await engine.start();
    });
  };

  const stopStream = async () => {
    await runStreamOperation("stop", () => engine.stop());
  };

  const reconnectStream = async () => {
    await runStreamOperation("reconnect", () => engine.reconnect());
  };

  const runStreamOperation = async (action: StreamControlAction, operation: () => Promise<void>) => {
    if (operationInFlight.current) {
      return;
    }
    operationInFlight.current = true;
    setOperationStatus(createPendingStreamOperation(action));
    try {
      await operation();
      setOperationStatus(null);
    } catch (error) {
      setOperationStatus(createFailedStreamOperation(action, error));
    } finally {
      operationInFlight.current = false;
    }
  };

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

  return (
    <SafeAreaProvider>
      <MobileStudioScreen
        scene={scene}
        profile={profile}
        selectedSourceId={selectedSourceId}
        snapshot={snapshot}
        operationStatus={operationStatus}
        readiness={readiness}
        chatReader={chatReader}
        platformChat={profile.platformChat}
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
        onPlatformChatSampleIngest={ingestPlatformChatSample}
        onClearStreamKey={clearSavedStreamKey}
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
