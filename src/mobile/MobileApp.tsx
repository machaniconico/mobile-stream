import { useEffect, useMemo, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createAvatarRuntimeState, setExpression, tickAutoBlink, type AvatarExpression } from "../domain/avatar";
import {
  createChatMessage,
  createDefaultChatReaderState,
  enqueueChatMessage,
  updateChatReaderSettings,
  type ChatReaderSettings
} from "../domain/chatReader";
import { createDefaultStudioProfile, type StudioProfile } from "../domain/profiles";
import { createReadinessReport } from "../domain/readiness";
import {
  createDefaultScene,
  updateSource,
  type Live2DSource,
  type PNGTuberSource,
  type SceneDocument
} from "../domain/scene";
import { MockLiveCaster } from "../native/MockLiveCaster";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import { useChatSpeechQueue } from "../native/ChatSpeechEngine";
import { AndroidLiveCaster, canUseAndroidLiveCaster } from "./AndroidLiveCaster";
import { MobileStudioScreen } from "./MobileStudioScreen";
import { NativeChatSpeechEngine } from "./NativeChatSpeechEngine";
import { loadSecureProfile, saveSecureProfile } from "./secureProfileStore";

const isAvatarSource = (source: SceneDocument["sources"][number]): source is PNGTuberSource | Live2DSource =>
  source.kind === "pngtuber" || source.kind === "live2d";

export const MobileApp = () => {
  const engine = useMemo(() => (canUseAndroidLiveCaster() ? new AndroidLiveCaster() : new MockLiveCaster()), []);
  const chatSpeechEngine = useMemo(() => new NativeChatSpeechEngine(), []);
  const [scene, setScene] = useState<SceneDocument>(() => createDefaultScene());
  const [profile, setProfile] = useState<StudioProfile>(() => createDefaultStudioProfile());
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [chatReader, setChatReader] = useState(() => createDefaultChatReaderState());
  const [selectedSourceId, setSelectedSourceId] = useState("source-avatar");
  const [snapshot, setSnapshot] = useState<NativeEngineSnapshot>(() => engine.getSnapshot());
  const [avatarRuntime, setAvatarRuntime] = useState(() => createAvatarRuntimeState(Date.now()));
  const readiness = useMemo(() => createReadinessReport(scene, profile), [scene, profile]);

  useEffect(() => engine.subscribe(setSnapshot), [engine]);
  useChatSpeechQueue(chatReader, setChatReader, chatSpeechEngine);

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
    const timer = setInterval(() => {
      setAvatarRuntime((current) => {
        const next = tickAutoBlink(current, Date.now());
        setScene((currentScene) => applyAvatarRuntime(currentScene, next.expression, next.mouthOpen, next.blink));
        return next;
      });
    }, 140);
    return () => clearInterval(timer);
  }, []);

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

  const startStream = async () => {
    if (!readiness.canStart) {
      return;
    }
    await engine.prepare(scene, readiness.sanitizedProfile);
    await engine.start();
  };

  const submitChatComment = (author: string, body: string) => {
    setChatReader((current) => enqueueChatMessage(current, createChatMessage({ author, body })));
  };

  const updateChatSettings = (settings: Partial<ChatReaderSettings>) => {
    setChatReader((current) => updateChatReaderSettings(current, settings));
  };

  return (
    <SafeAreaProvider>
      <MobileStudioScreen
        scene={scene}
        profile={profile}
        selectedSourceId={selectedSourceId}
        snapshot={snapshot}
        readiness={readiness}
        chatReader={chatReader}
        avatarRuntime={avatarRuntime}
        onSceneChange={setScene}
        onProfileChange={setProfile}
        onSelectSource={setSelectedSourceId}
        onMicLevelChange={updateMicLevel}
        onExpressionChange={updateExpression}
        onStart={startStream}
        onStop={() => engine.stop()}
        onReconnect={() => engine.reconnect()}
        onChatCommentSubmit={submitChatComment}
        onChatReaderSettingsChange={updateChatSettings}
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
