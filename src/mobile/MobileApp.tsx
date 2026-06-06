import { useEffect, useMemo, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createAvatarRuntimeState, setExpression, tickAutoBlink, type AvatarExpression } from "../domain/avatar";
import { createDefaultStudioProfile, type StudioProfile } from "../domain/profiles";
import {
  createDefaultScene,
  updateSource,
  type Live2DSource,
  type PNGTuberSource,
  type SceneDocument
} from "../domain/scene";
import { MockLiveCaster } from "../native/MockLiveCaster";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import { MobileStudioScreen } from "./MobileStudioScreen";

const isAvatarSource = (source: SceneDocument["sources"][number]): source is PNGTuberSource | Live2DSource =>
  source.kind === "pngtuber" || source.kind === "live2d";

export const MobileApp = () => {
  const engine = useMemo(() => new MockLiveCaster(), []);
  const [scene, setScene] = useState<SceneDocument>(() => createDefaultScene());
  const [profile, setProfile] = useState<StudioProfile>(() => createDefaultStudioProfile());
  const [selectedSourceId, setSelectedSourceId] = useState("source-avatar");
  const [snapshot, setSnapshot] = useState<NativeEngineSnapshot>(() => engine.getSnapshot());
  const [avatarRuntime, setAvatarRuntime] = useState(() => createAvatarRuntimeState(Date.now()));

  useEffect(() => engine.subscribe(setSnapshot), [engine]);

  useEffect(() => {
    void engine.updateScene(scene);
  }, [engine, scene]);

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
    await engine.prepare(scene, profile);
    await engine.start();
  };

  return (
    <SafeAreaProvider>
      <MobileStudioScreen
        scene={scene}
        profile={profile}
        selectedSourceId={selectedSourceId}
        snapshot={snapshot}
        avatarRuntime={avatarRuntime}
        onSceneChange={setScene}
        onProfileChange={setProfile}
        onSelectSource={setSelectedSourceId}
        onMicLevelChange={updateMicLevel}
        onExpressionChange={updateExpression}
        onStart={startStream}
        onStop={() => engine.stop()}
        onReconnect={() => engine.reconnect()}
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
  let next = scene;

  for (const source of scene.sources) {
    if (!isAvatarSource(source)) {
      continue;
    }

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

  return next;
};
