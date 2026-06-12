import { useEffect, useMemo, useState } from "react";
import { createAvatarRuntimeState, setExpression, tickAutoBlink, type AvatarExpression } from "../domain/avatar";
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
import { createDefaultStudioProfile, type StudioProfile } from "../domain/profiles";
import { createReadinessReport } from "../domain/readiness";
import {
  createDefaultScene,
  defaultAvatarMotion,
  updateSource,
  type PNGTuberSource,
  type Live2DSource,
  type SceneDocument
} from "../domain/scene";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import { MockLiveCaster } from "../native/MockLiveCaster";
import { useChatSpeechQueue } from "../native/ChatSpeechEngine";
import { loadProfile, loadScene, saveProfile, saveScene } from "../storage/localStore";
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
  const [selectedSourceId, setSelectedSourceId] = useState("source-avatar");
  const [snapshot, setSnapshot] = useState<NativeEngineSnapshot>(() => engine.getSnapshot());
  const [avatarRuntime, setAvatarRuntime] = useState(() => createAvatarRuntimeState(Date.now()));
  const [faceTrackingRuntime, setFaceTrackingRuntime] = useState(() => createFaceTrackingRuntimeState(Date.now()));
  const readiness = useMemo(() => createReadinessReport(scene, profile), [scene, profile]);
  const persistableSceneJson = useMemo(() => JSON.stringify(stripTransientAvatarRuntime(scene)), [scene]);

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
    if (!readiness.canStart) {
      return;
    }
    await engine.prepare(scene, readiness.sanitizedProfile);
    await engine.start();
  };

  const stopStream = async () => {
    await engine.stop();
  };

  const reconnectStream = async () => {
    await engine.reconnect();
  };

  const submitChatComment = (author: string, body: string) => {
    setChatReader((current) => enqueueChatMessage(current, createChatMessage({ author, body })));
  };

  const updateChatSettings = (settings: Partial<ChatReaderSettings>) => {
    setChatReader((current) => updateChatReaderSettings(current, settings));
  };

  return (
    <StudioScreen
      scene={scene}
      profile={profile}
      selectedSourceId={selectedSourceId}
      snapshot={snapshot}
      readiness={readiness}
      chatReader={chatReader}
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

const stripTransientAvatarRuntime = (scene: SceneDocument): SceneDocument => ({
  ...scene,
  sources: scene.sources.map((source) => {
    if (!isAvatarSource(source)) {
      return source;
    }
    return {
      ...source,
      mouthOpen: 0,
      blink: 0,
      motion: defaultAvatarMotion()
    };
  })
});

const shouldPushSceneToEngine = (status: NativeEngineSnapshot["state"]["status"]) =>
  status === "preparing" || status === "live" || status === "reconnecting";
