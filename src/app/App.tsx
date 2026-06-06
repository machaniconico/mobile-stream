import { useEffect, useMemo, useState } from "react";
import { createAvatarRuntimeState, setExpression, tickAutoBlink, type AvatarExpression } from "../domain/avatar";
import { createDefaultStudioProfile, type StudioProfile } from "../domain/profiles";
import { createReadinessReport } from "../domain/readiness";
import {
  createDefaultScene,
  updateSource,
  type PNGTuberSource,
  type Live2DSource,
  type SceneDocument
} from "../domain/scene";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import { MockLiveCaster } from "../native/MockLiveCaster";
import { loadProfile, loadScene, saveProfile, saveScene } from "../storage/localStore";
import { StudioScreen } from "../screens/StudioScreen";

const isAvatarSource = (source: SceneDocument["sources"][number]): source is PNGTuberSource | Live2DSource =>
  source.kind === "pngtuber" || source.kind === "live2d";

export const App = () => {
  const engine = useMemo(() => new MockLiveCaster(), []);
  const [scene, setScene] = useState<SceneDocument>(() => loadScene() ?? createDefaultScene());
  const [profile, setProfile] = useState<StudioProfile>(() => loadProfile() ?? createDefaultStudioProfile());
  const [selectedSourceId, setSelectedSourceId] = useState("source-avatar");
  const [snapshot, setSnapshot] = useState<NativeEngineSnapshot>(() => engine.getSnapshot());
  const [avatarRuntime, setAvatarRuntime] = useState(() => createAvatarRuntimeState(Date.now()));
  const readiness = useMemo(() => createReadinessReport(scene, profile), [scene, profile]);

  useEffect(() => engine.subscribe(setSnapshot), [engine]);

  useEffect(() => {
    saveScene(scene);
    void engine.updateScene(scene);
  }, [engine, scene]);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAvatarRuntime((current) => {
        const next = tickAutoBlink(current, Date.now());
        setScene((currentScene) => applyAvatarRuntime(currentScene, next.expression, next.mouthOpen, next.blink));
        return next;
      });
    }, 120);
    return () => window.clearInterval(timer);
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

  const stopStream = async () => {
    await engine.stop();
  };

  const reconnectStream = async () => {
    await engine.reconnect();
  };

  return (
    <StudioScreen
      scene={scene}
      profile={profile}
      selectedSourceId={selectedSourceId}
      snapshot={snapshot}
      readiness={readiness}
      avatarRuntime={avatarRuntime}
      onSceneChange={setScene}
      onProfileChange={setProfile}
      onSelectSource={setSelectedSourceId}
      onMicLevelChange={updateMicLevel}
      onExpressionChange={updateExpression}
      onStart={startStream}
      onStop={stopStream}
      onReconnect={reconnectStream}
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
