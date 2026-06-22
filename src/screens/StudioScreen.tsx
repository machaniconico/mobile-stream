import {
  Activity,
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  Layers,
  Lock,
  MessageCircle,
  Mic,
  MonitorSmartphone,
  Play,
  Plus,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  ShieldCheck,
  Square,
  Unlock,
  Volume2,
  Wifi
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { AvatarExpression, AvatarRuntimeState } from "../domain/avatar";
import { normalizeMutedWordsInput, type ChatReaderSettings, type ChatReaderState } from "../domain/chatReader";
import type { FaceTrackingRuntimeState } from "../domain/faceTracking";
import { getPlatformChatConnectionStatus, type PlatformChatSettings } from "../domain/platformChat";
import type { PlatformChatAuthSession, PlatformChatConnectionState } from "../domain/platformChatConnection";
import type { PlatformChatOAuthFlow, PlatformChatOAuthSettings, TwitchDeviceCodeOAuthFlow } from "../domain/platformChatOAuth";
import type { YouTubeBroadcastTransitionStatus } from "../domain/platformPublishing";
import { applyMicEffectPreset, micEffectPresets, type MicEffectPresetId, type StudioProfile } from "../domain/profiles";
import type { ReadinessReport } from "../domain/readiness";
import {
  addSource,
  createSource,
  defaultAvatarMotion,
  reorderSource,
  setLocked,
  setVisibility,
  toRenderGraph,
  updateSource,
  updateTransform,
  type SceneDocument,
  type SceneSource,
  type SourceKind
} from "../domain/scene";
import type { StreamOperationStatus } from "../domain/streamOperation";
import type { StreamHealthSample } from "../domain/streamHealthHistory";
import {
  createStreamStartPreflightReport,
  type StreamStartPreflightReport
} from "../domain/streamStartPreflight";
import {
  createStreamDiagnosticReport,
  createStreamDiagnostics,
  serializeStreamDiagnosticReport,
  type StreamDiagnostics
} from "../domain/streamDiagnostics";
import type { StreamSessionEvent } from "../domain/streamSessionLog";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import {
  createSupportBundle,
  serializeSupportBundle
} from "../domain/supportBundle";
import { LiveSetupScreen } from "./LiveSetupScreen";
import { PanelTitle } from "./ui";

interface StudioScreenProps {
  scene: SceneDocument;
  profile: StudioProfile;
  selectedSourceId: string;
  snapshot: NativeEngineSnapshot;
  streamSessionEvents: StreamSessionEvent[];
  streamHealthSamples: StreamHealthSample[];
  operationStatus: StreamOperationStatus | null;
  readiness: ReadinessReport;
  chatReader: ChatReaderState;
  platformChat: PlatformChatSettings;
  platformChatAuth: PlatformChatAuthSession;
  platformChatOAuth: PlatformChatOAuthSettings;
  platformChatOAuthFlow: PlatformChatOAuthFlow | null;
  twitchDeviceOAuthFlow: TwitchDeviceCodeOAuthFlow | null;
  platformChatOAuthStatus: string;
  platformStreamKeyStatus: string;
  platformPublishingStatus: string;
  platformChatConnection: PlatformChatConnectionState;
  avatarRuntime: AvatarRuntimeState;
  faceTrackingRuntime: FaceTrackingRuntimeState;
  onSceneChange(scene: SceneDocument): void;
  onProfileChange(profile: StudioProfile): void;
  onSelectSource(sourceId: string): void;
  onMicLevelChange(level: number): void;
  onExpressionChange(expression: AvatarExpression): void;
  onFaceTrackingCalibrate(): void;
  onStart(): Promise<void>;
  onStop(): Promise<void>;
  onReconnect(): Promise<void>;
  onChatCommentSubmit(author: string, body: string): void;
  onChatReaderSettingsChange(settings: Partial<ChatReaderSettings>): void;
  onPlatformChatSettingsChange(settings: Partial<PlatformChatSettings>): void;
  onPlatformChatAuthChange(settings: Partial<PlatformChatAuthSession>): void;
  onPlatformChatOAuthChange(settings: Partial<PlatformChatOAuthSettings>): void;
  onPlatformChatOAuthStart(): void | Promise<void>;
  onTwitchDeviceOAuthStart(): void | Promise<void>;
  onTwitchDeviceOAuthPoll(): void | Promise<void>;
  onPlatformChatOAuthCallbackApply(): void | Promise<void>;
  onPlatformStreamKeyApply(): void | Promise<void>;
  onPlatformPublishingApply(): void | Promise<void>;
  onPlatformPublishingStatusRefresh(): void | Promise<void>;
  onYouTubeBroadcastTransition(status: YouTubeBroadcastTransitionStatus): void | Promise<void>;
  onPlatformChatConnect(): void;
  onPlatformChatDisconnect(): void;
  onPlatformChatSampleIngest(): void;
  onClearStreamKey(): void;
}

const sourceLabels: Record<SourceKind, string> = {
  screen: "Screen",
  pngtuber: "PNGTuber",
  live2d: "Live2D",
  image: "Image",
  solid: "Solid",
  text: "Text"
};

const sourceKinds: SourceKind[] = ["pngtuber", "live2d", "text", "image", "solid"];

const expressions: AvatarExpression[] = ["neutral", "happy", "angry", "surprised"];

const downloadStreamDiagnosticReport = (diagnostics: StreamDiagnostics) => {
  const generatedAt = new Date();
  const report = serializeStreamDiagnosticReport(createStreamDiagnosticReport(diagnostics, generatedAt));
  const blob = new Blob([report], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `mobile-live-caster-diagnostics-${generatedAt.toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const downloadSupportBundle = ({
  scene,
  profile,
  readiness,
  preflight,
  diagnostics
}: {
  scene: SceneDocument;
  profile: StudioProfile;
  readiness: ReadinessReport;
  preflight: StreamStartPreflightReport;
  diagnostics: StreamDiagnostics;
}) => {
  const generatedAt = new Date();
  const bundle = serializeSupportBundle(
    createSupportBundle({
      scene,
      profile,
      readiness,
      preflight,
      diagnostics,
      now: generatedAt
    })
  );
  const blob = new Blob([bundle], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `mobile-live-caster-support-${generatedAt.toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const recoveryMetricLabel = (diagnostics: StreamDiagnostics): string => {
  const retryDelay =
    diagnostics.recovery.nextRetryDelayMs === null ? "" : ` / next ${Math.round(diagnostics.recovery.nextRetryDelayMs / 1000)}s`;
  return `${diagnostics.recovery.mode} / ${diagnostics.recovery.attemptsRemaining} retries left${retryDelay}`;
};

const historyMetricLabel = (diagnostics: StreamDiagnostics): string =>
  diagnostics.history.sampleCount === 0
    ? "No samples yet"
    : `${diagnostics.history.stability} / avg ${diagnostics.history.averageBitrateKbps} kbps / ${diagnostics.history.averageFps} fps`;

const qualityIncidentSummaryTone = (diagnostics: StreamDiagnostics): "pass" | "warn" | "fail" => {
  if (diagnostics.qualityIncidents.incidents.some((incident) => incident.severity === "fail")) {
    return "fail";
  }
  return diagnostics.qualityIncidents.incidents.length > 0 ? "warn" : "pass";
};

export const StudioScreen = ({
  scene,
  profile,
  selectedSourceId,
  snapshot,
  streamSessionEvents,
  streamHealthSamples,
  operationStatus,
  readiness,
  chatReader,
  platformChat,
  platformChatAuth,
  platformChatOAuth,
  platformChatOAuthFlow,
  twitchDeviceOAuthFlow,
  platformChatOAuthStatus,
  platformStreamKeyStatus,
  platformPublishingStatus,
  platformChatConnection,
  avatarRuntime,
  faceTrackingRuntime,
  onSceneChange,
  onProfileChange,
  onSelectSource,
  onMicLevelChange,
  onExpressionChange,
  onFaceTrackingCalibrate,
  onStart,
  onStop,
  onReconnect,
  onChatCommentSubmit,
  onChatReaderSettingsChange,
  onPlatformChatSettingsChange,
  onPlatformChatAuthChange,
  onPlatformChatOAuthChange,
  onPlatformChatOAuthStart,
  onTwitchDeviceOAuthStart,
  onTwitchDeviceOAuthPoll,
  onPlatformChatOAuthCallbackApply,
  onPlatformStreamKeyApply,
  onPlatformPublishingApply,
  onPlatformPublishingStatusRefresh,
  onYouTubeBroadcastTransition,
  onPlatformChatConnect,
  onPlatformChatDisconnect,
  onPlatformChatSampleIngest,
  onClearStreamKey
}: StudioScreenProps) => {
  const selectedSource = scene.sources.find((source) => source.id === selectedSourceId) ?? scene.sources[0];
  const isLive = snapshot.state.status === "live" || snapshot.state.status === "reconnecting";
  const isBusy = snapshot.state.status === "preparing" || snapshot.state.status === "stopping";
  const operationBusy = operationStatus?.kind === "pending";
  const setupLocked = isLive || isBusy || operationBusy;
  const startPreflight = createStreamStartPreflightReport({
    readiness,
    streamStatus: snapshot.state.status,
    operationStatus
  });
  const canGoLive = startPreflight.canStart;
  const diagnostics = createStreamDiagnostics(scene, profile, readiness, snapshot, streamSessionEvents, streamHealthSamples);
  const updateMicEffects = (update: Partial<StudioProfile["micEffects"]>) => {
    if (setupLocked) {
      return;
    }
    onProfileChange({
      ...profile,
      micEffects: {
        ...profile.micEffects,
        ...update
      }
    });
  };
  const updateMicPreset = (presetId: MicEffectPresetId) => {
    if (setupLocked) {
      return;
    }
    onProfileChange(applyMicEffectPreset(profile, presetId));
  };
  const updateFaceTracking = (update: Partial<StudioProfile["faceTracking"]>) => {
    if (setupLocked) {
      return;
    }
    onProfileChange({
      ...profile,
      faceTracking: {
        ...profile.faceTracking,
        ...update
      }
    });
  };

  const addNewSource = (kind: SourceKind) => {
    if (setupLocked) {
      return;
    }
    const source = createSource(kind);
    onSceneChange(addSource(scene, source));
    onSelectSource(source.id);
  };

  const updateSelectedTransform = (key: keyof SceneSource["transform"], value: number) => {
    onSceneChange(updateTransform(scene, selectedSource.id, { [key]: value }));
  };

  const updateSelectedName = (name: string) => {
    onSceneChange(updateSource(scene, selectedSource.id, (source) => ({ ...source, name })));
  };

  return (
    <main className="studio-shell">
      <header className="top-bar">
        <div className="brand-block">
          <div className="app-mark" aria-hidden="true">
            ML
          </div>
          <div>
            <h1>MobileLiveCaster</h1>
            <p>OBS Mode</p>
          </div>
        </div>
        <div className="status-strip" aria-label="stream status">
          <StatusPill label={snapshot.state.status} tone={isLive ? "live" : snapshot.state.status === "failed" ? "bad" : "idle"} />
          <Metric icon={<Wifi size={16} />} label={`${snapshot.health.bitrateKbps} kbps`} />
          <Metric icon={<Activity size={16} />} label={`${snapshot.health.fps} fps`} />
          <Metric icon={<Radio size={16} />} label={`${snapshot.health.droppedFrames} drops`} />
          {snapshot.health.reconnectAttempts > 0 ? (
            <Metric icon={<RotateCcw size={16} />} label={`${snapshot.health.reconnectAttempts} retries`} />
          ) : null}
        </div>
      </header>

      <section className="studio-grid">
        <aside className="left-rail" aria-label="scene sources">
          <PanelTitle icon={<Layers size={18} />} title="Sources" />
          <div className="source-list">
            {[...scene.sources].reverse().map((source) => (
              <button
                key={source.id}
                className={`source-row ${source.id === selectedSource.id ? "selected" : ""}`}
                type="button"
                onClick={() => onSelectSource(source.id)}
              >
                <span className="source-kind">{sourceLabels[source.kind]}</span>
                <span className="source-name">{source.name}</span>
                <span className="source-actions">
                  {source.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  {source.locked ? <Lock size={16} /> : <Unlock size={16} />}
                </span>
              </button>
            ))}
          </div>

          <div className="button-grid">
            {sourceKinds.map((kind) => (
              <button key={kind} className="tool-button" type="button" disabled={setupLocked} onClick={() => addNewSource(kind)}>
                <Plus size={16} />
                <span>{sourceLabels[kind]}</span>
              </button>
            ))}
          </div>

          <div className="source-tools">
            <button
              className="icon-button"
              type="button"
              aria-label="move source up"
              disabled={setupLocked}
              onClick={() => onSceneChange(reorderSource(scene, selectedSource.id, 1))}
            >
              <ArrowUp size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="move source down"
              disabled={setupLocked}
              onClick={() => onSceneChange(reorderSource(scene, selectedSource.id, -1))}
            >
              <ArrowDown size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={selectedSource.visible ? "hide source" : "show source"}
              disabled={setupLocked}
              onClick={() => onSceneChange(setVisibility(scene, selectedSource.id, !selectedSource.visible))}
            >
              {selectedSource.visible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={selectedSource.locked ? "unlock source" : "lock source"}
              disabled={setupLocked}
              onClick={() => onSceneChange(setLocked(scene, selectedSource.id, !selectedSource.locked))}
            >
              {selectedSource.locked ? <Lock size={18} /> : <Unlock size={18} />}
            </button>
          </div>
        </aside>

        <section className="program-column" aria-label="program preview">
          <ProgramPreview scene={scene} selectedSourceId={selectedSource.id} onSelectSource={onSelectSource} />
          <div className="transport-bar">
            <button
              className="primary-action"
              type="button"
              disabled={!canGoLive}
              aria-describedby="go-live-readiness"
              onClick={onStart}
            >
              <Play size={18} />
              <span>Go Live</span>
            </button>
            <button className="danger-action" type="button" disabled={operationBusy || isBusy || !isLive} onClick={onStop}>
              <Square size={18} />
              <span>Stop</span>
            </button>
            <button className="secondary-action" type="button" disabled={operationBusy || !isLive} onClick={onReconnect}>
              <RotateCcw size={18} />
              <span>Reconnect</span>
            </button>
            <div className="transport-readout">
              <span>{formatElapsed(snapshot.health.elapsedSeconds)}</span>
              <span>{snapshot.health.message}</span>
            </div>
          </div>
          {operationStatus ? (
            <div className={`operation-banner ${operationStatus.kind}`} role={operationStatus.kind === "error" ? "alert" : "status"}>
              {operationStatus.message}
            </div>
          ) : null}
          <StartPreflightBanner report={startPreflight} />
        </section>

        <aside className="right-rail" aria-label="inspector and setup">
          <section className="control-panel">
            <PanelTitle icon={<SlidersHorizontal size={18} />} title="Transform" />
            <label className="field">
              <span>Name</span>
              <input value={selectedSource.name} disabled={setupLocked} onChange={(event) => updateSelectedName(event.target.value)} />
            </label>
            <Slider label="X" value={selectedSource.transform.x} disabled={setupLocked} onChange={(value) => updateSelectedTransform("x", value)} />
            <Slider label="Y" value={selectedSource.transform.y} disabled={setupLocked} onChange={(value) => updateSelectedTransform("y", value)} />
            <Slider
              label="Width"
              value={selectedSource.transform.width}
              disabled={setupLocked}
              onChange={(value) => updateSelectedTransform("width", value)}
            />
            <Slider
              label="Height"
              value={selectedSource.transform.height}
              disabled={setupLocked}
              onChange={(value) => updateSelectedTransform("height", value)}
            />
            <Slider
              label="Opacity"
              value={selectedSource.transform.opacity}
              disabled={setupLocked}
              onChange={(value) => updateSelectedTransform("opacity", value)}
            />
          </section>

          <section className="control-panel">
            <PanelTitle icon={<Mic size={18} />} title="Mixer" />
            <Slider label="Lip sync" value={avatarRuntime.mouthOpen} onChange={onMicLevelChange} />
            <div className="level-meter" aria-label="lip sync meter">
              <span style={{ width: `${Math.round(avatarRuntime.mouthOpen * 100)}%` }} />
            </div>
            <div className="expression-grid">
              {expressions.map((expression) => (
                <button
                  key={expression}
                  className={`expression-button ${avatarRuntime.expression === expression ? "active" : ""}`}
                  type="button"
                  onClick={() => onExpressionChange(expression)}
                >
                  {expression}
                </button>
              ))}
            </div>
            <div className="mic-effects">
              <div className="protocol-row" role="group" aria-label="mic effects power">
                <button
                  className={`segmented-button ${!profile.micEffects.enabled ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateMicEffects({ enabled: false })}
                >
                  Off
                </button>
                <button
                  className={`segmented-button ${profile.micEffects.enabled ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateMicEffects({ enabled: true })}
                >
                  FX
                </button>
              </div>
              <label className="field">
                <span>Mic preset</span>
                <select
                  value={profile.micEffects.presetId}
                  disabled={setupLocked}
                  onChange={(event) => updateMicPreset(event.target.value as MicEffectPresetId)}
                >
                  {micEffectPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <SpeechSlider
                label="Gain dB"
                value={profile.micEffects.inputGainDb}
                min={-12}
                max={12}
                step={1}
                disabled={setupLocked}
                onChange={(inputGainDb) => updateMicEffects({ inputGainDb })}
              />
              <SpeechSlider
                label="Gate dB"
                value={profile.micEffects.noiseGateDb}
                min={-70}
                max={-25}
                step={1}
                disabled={setupLocked}
                onChange={(noiseGateDb) => updateMicEffects({ noiseGateDb })}
              />
              <SpeechSlider
                label="Compression"
                value={profile.micEffects.compression}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(compression) => updateMicEffects({ compression })}
              />
              <div className="monitor-row">
                <button
                  className={`segmented-button ${profile.micEffects.monitorEnabled ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateMicEffects({ monitorEnabled: !profile.micEffects.monitorEnabled })}
                >
                  <Headphones size={16} />
                  Monitor
                </button>
                <button
                  className={`segmented-button ${profile.micEffects.monitorHeadphonesOnly ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateMicEffects({ monitorHeadphonesOnly: !profile.micEffects.monitorHeadphonesOnly })}
                >
                  Phones
                </button>
              </div>
              <SpeechSlider
                label="Monitor"
                value={profile.micEffects.monitorVolume}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked || !profile.micEffects.monitorEnabled}
                onChange={(monitorVolume) => updateMicEffects({ monitorVolume })}
              />
            </div>
            <div className="face-tracking">
              <div className="protocol-row" role="group" aria-label="face tracking power">
                <button
                  className={`segmented-button ${!profile.faceTracking.enabled ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateFaceTracking({ enabled: false })}
                >
                  Off
                </button>
                <button
                  className={`segmented-button ${profile.faceTracking.enabled ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateFaceTracking({ enabled: true })}
                >
                  Track
                </button>
              </div>
              <label className="field">
                <span>Face input</span>
                <select
                  value={profile.faceTracking.inputMode}
                  disabled={setupLocked}
                  onChange={(event) => updateFaceTracking({ inputMode: event.target.value as StudioProfile["faceTracking"]["inputMode"] })}
                >
                  <option value="simulated">Simulated</option>
                  <option value="native-camera">Native camera</option>
                </select>
              </label>
              <label className="field">
                <span>Rig</span>
                <select
                  value={profile.faceTracking.rigMode}
                  disabled={setupLocked}
                  onChange={(event) => updateFaceTracking({ rigMode: event.target.value as StudioProfile["faceTracking"]["rigMode"] })}
                >
                  <option value="still-image-2d">Still image 2D</option>
                  <option value="layered-2d">Layered 2D</option>
                </select>
              </label>
              <SpeechSlider
                label="Strength"
                value={profile.faceTracking.trackingStrength}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(trackingStrength) => updateFaceTracking({ trackingStrength })}
              />
              <SpeechSlider
                label="Smoothing"
                value={profile.faceTracking.smoothing}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(smoothing) => updateFaceTracking({ smoothing })}
              />
              <SpeechSlider
                label="Head range"
                value={profile.faceTracking.headRange}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(headRange) => updateFaceTracking({ headRange })}
              />
              <SpeechSlider
                label="Body range"
                value={profile.faceTracking.bodyRange}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(bodyRange) => updateFaceTracking({ bodyRange })}
              />
              <SpeechSlider
                label="Mouth"
                value={profile.faceTracking.mouthSensitivity}
                min={0.2}
                max={2}
                step={0.05}
                disabled={setupLocked}
                onChange={(mouthSensitivity) => updateFaceTracking({ mouthSensitivity })}
              />
              <SpeechSlider
                label="Blink"
                value={profile.faceTracking.blinkSensitivity}
                min={0.2}
                max={2}
                step={0.05}
                disabled={setupLocked}
                onChange={(blinkSensitivity) => updateFaceTracking({ blinkSensitivity })}
              />
              <div className="monitor-row">
                <button
                  className={`segmented-button ${profile.faceTracking.autoExpression ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateFaceTracking({ autoExpression: !profile.faceTracking.autoExpression })}
                >
                  Auto Expr
                </button>
                <button className="segmented-button" type="button" disabled={setupLocked} onClick={onFaceTrackingCalibrate}>
                  Calibrate
                </button>
              </div>
              <div className={`tracking-readout ${faceTrackingRuntime.status}`}>
                <span>{faceTrackingRuntime.status}</span>
                <span>yaw {faceTrackingRuntime.yaw.toFixed(2)}</span>
                <span>pitch {faceTrackingRuntime.pitch.toFixed(2)}</span>
                <span>conf {Math.round(faceTrackingRuntime.confidence * 100)}%</span>
              </div>
            </div>
          </section>

          <ChatReaderPanel
        chatReader={chatReader}
        platformChat={platformChat}
        platformChatAuth={platformChatAuth}
        platformChatOAuth={platformChatOAuth}
        platformChatOAuthFlow={platformChatOAuthFlow}
        twitchDeviceOAuthFlow={twitchDeviceOAuthFlow}
        platformChatOAuthStatus={platformChatOAuthStatus}
        platformStreamKeyStatus={platformStreamKeyStatus}
        platformChatConnection={platformChatConnection}
        onSubmit={onChatCommentSubmit}
        onSettingsChange={onChatReaderSettingsChange}
        onPlatformChatSettingsChange={onPlatformChatSettingsChange}
        onPlatformChatAuthChange={onPlatformChatAuthChange}
        onPlatformChatOAuthChange={onPlatformChatOAuthChange}
        onPlatformChatOAuthStart={onPlatformChatOAuthStart}
        onTwitchDeviceOAuthStart={onTwitchDeviceOAuthStart}
        onTwitchDeviceOAuthPoll={onTwitchDeviceOAuthPoll}
        onPlatformChatOAuthCallbackApply={onPlatformChatOAuthCallbackApply}
        onPlatformStreamKeyApply={onPlatformStreamKeyApply}
        onPlatformChatConnect={onPlatformChatConnect}
        onPlatformChatDisconnect={onPlatformChatDisconnect}
        onPlatformChatSampleIngest={onPlatformChatSampleIngest}
      />

          <LiveSetupScreen
            profile={profile}
            readiness={readiness}
            locked={setupLocked}
            platformPublishingStatus={platformPublishingStatus}
            onProfileChange={onProfileChange}
            onPlatformPublishingApply={onPlatformPublishingApply}
            onPlatformPublishingStatusRefresh={onPlatformPublishingStatusRefresh}
            onYouTubeBroadcastTransition={onYouTubeBroadcastTransition}
            onClearStreamKey={onClearStreamKey}
          />

          <StreamDiagnosticsPanel
            scene={scene}
            profile={profile}
            readiness={readiness}
            preflight={startPreflight}
            diagnostics={diagnostics}
          />
        </aside>
      </section>
    </main>
  );
};

const StartPreflightBanner = ({ report }: { report: StreamStartPreflightReport }) => (
  <div id="go-live-readiness" className={`start-preflight-banner ${report.status}`}>
    <div className="start-preflight-summary">
      <ShieldCheck size={16} />
      <span>{report.summary}</span>
    </div>
    <span className="start-preflight-action">{report.primaryAction}</span>
    {report.issues.length > 0 ? (
      <div className="start-preflight-list">
        {report.issues.slice(0, 3).map((issue) => (
          <span key={issue.code} className={`start-preflight-issue ${issue.severity}`}>
            {issue.label}: {issue.message}
          </span>
        ))}
      </div>
    ) : null}
  </div>
);

const StreamDiagnosticsPanel = ({
  scene,
  profile,
  readiness,
  preflight,
  diagnostics
}: {
  scene: SceneDocument;
  profile: StudioProfile;
  readiness: ReadinessReport;
  preflight: StreamStartPreflightReport;
  diagnostics: StreamDiagnostics;
}) => (
  <section className="control-panel">
    <PanelTitle icon={<Activity size={18} />} title="Diagnostics" />
    <div className="diagnostic-summary-row">
      <div className={`diagnostic-summary ${diagnostics.status}`}>{diagnostics.summary}</div>
      <div className="diagnostic-actions">
        <button className="secondary-action compact-action diagnostic-export" type="button" onClick={() => downloadStreamDiagnosticReport(diagnostics)}>
          <Download size={15} />
          Diagnostics
        </button>
        <button
          className="secondary-action compact-action diagnostic-export"
          type="button"
          onClick={() => downloadSupportBundle({ scene, profile, readiness, preflight, diagnostics })}
        >
          <Download size={15} />
          Support
        </button>
      </div>
    </div>
    <div className="diagnostic-grid">
      <span>Target</span>
      <strong>{diagnostics.target.platform}</strong>
      <span>Endpoint</span>
      <strong>{diagnostics.target.host}</strong>
      <span>App</span>
      <strong>{diagnostics.target.application}</strong>
      <span>Publish URL</span>
      <strong>{diagnostics.target.publishUrlPreview}</strong>
      <span>Quality</span>
      <strong>
        {diagnostics.quality.resolution} / {diagnostics.quality.fps}fps
      </strong>
      <span>Upload target</span>
      <strong>{diagnostics.quality.estimatedUploadKbps} kbps</strong>
      <span>Telemetry</span>
      <strong>
        {diagnostics.telemetry.bitrateKbps} kbps / {diagnostics.telemetry.fps} fps
      </strong>
      <span>Recovery</span>
      <strong>{recoveryMetricLabel(diagnostics)}</strong>
      <span>History</span>
      <strong>{historyMetricLabel(diagnostics)}</strong>
    </div>
    <div className="diagnostic-incidents">
      <div className={`diagnostic-incident-summary ${qualityIncidentSummaryTone(diagnostics)}`}>
        {diagnostics.qualityIncidents.summary}
      </div>
      {diagnostics.qualityIncidents.incidents.map((incident) => (
        <div key={incident.code} className={`diagnostic-incident ${incident.severity}`}>
          <strong>{incident.label}</strong>
          <span>{incident.message}</span>
          <em>{incident.recommendation}</em>
        </div>
      ))}
    </div>
    <div className="diagnostic-events">
      {diagnostics.session.events.slice(-5).map((event) => (
        <div key={event.id} className={`diagnostic-event ${event.severity}`}>
          <strong>{event.title}</strong>
          <span>{event.message}</span>
        </div>
      ))}
      {diagnostics.session.events.length === 0 ? <span className="diagnostic-empty">No session events yet.</span> : null}
    </div>
    <div className="diagnostic-checks">
      {diagnostics.checks.map((check) => (
        <div key={check.code} className={`diagnostic-check ${check.status}`}>
          <strong>{check.label}</strong>
          <span>{check.message}</span>
        </div>
      ))}
    </div>
  </section>
);

const ChatReaderPanel = ({
  chatReader,
  platformChat,
  platformChatAuth,
  platformChatOAuth,
  platformChatOAuthFlow,
  twitchDeviceOAuthFlow,
  platformChatOAuthStatus,
  platformStreamKeyStatus,
  platformChatConnection,
  onSubmit,
  onSettingsChange,
  onPlatformChatSettingsChange,
  onPlatformChatAuthChange,
  onPlatformChatOAuthChange,
  onPlatformChatOAuthStart,
  onTwitchDeviceOAuthStart,
  onTwitchDeviceOAuthPoll,
  onPlatformChatOAuthCallbackApply,
  onPlatformStreamKeyApply,
  onPlatformChatConnect,
  onPlatformChatDisconnect,
  onPlatformChatSampleIngest
}: {
  chatReader: ChatReaderState;
  platformChat: PlatformChatSettings;
  platformChatAuth: PlatformChatAuthSession;
  platformChatOAuth: PlatformChatOAuthSettings;
  platformChatOAuthFlow: PlatformChatOAuthFlow | null;
  twitchDeviceOAuthFlow: TwitchDeviceCodeOAuthFlow | null;
  platformChatOAuthStatus: string;
  platformStreamKeyStatus: string;
  platformChatConnection: PlatformChatConnectionState;
  onSubmit(author: string, body: string): void;
  onSettingsChange(settings: Partial<ChatReaderSettings>): void;
  onPlatformChatSettingsChange(settings: Partial<PlatformChatSettings>): void;
  onPlatformChatAuthChange(settings: Partial<PlatformChatAuthSession>): void;
  onPlatformChatOAuthChange(settings: Partial<PlatformChatOAuthSettings>): void;
  onPlatformChatOAuthStart(): void | Promise<void>;
  onTwitchDeviceOAuthStart(): void | Promise<void>;
  onTwitchDeviceOAuthPoll(): void | Promise<void>;
  onPlatformChatOAuthCallbackApply(): void | Promise<void>;
  onPlatformStreamKeyApply(): void | Promise<void>;
  onPlatformChatConnect(): void;
  onPlatformChatDisconnect(): void;
  onPlatformChatSampleIngest(): void;
}) => {
  const [author, setAuthor] = useState("viewer");
  const [body, setBody] = useState("Nice stream!");
  const [mutedWords, setMutedWords] = useState(chatReader.settings.mutedWords.join(", "));
  const platformStatus = getPlatformChatConnectionStatus(platformChat);
  const isNetworkConnected = platformChatConnection.phase === "connected" || platformChatConnection.phase === "connecting";
  const oauthClientId = platformChat.platform === "youtube" ? platformChatOAuth.youtubeClientId : platformChatOAuth.twitchClientId;
  const oauthRedirectUri = platformChat.platform === "youtube" ? platformChatOAuth.youtubeRedirectUri : platformChatOAuth.twitchRedirectUri;
  const oauthClientKey = platformChat.platform === "youtube" ? "youtubeClientId" : "twitchClientId";
  const oauthRedirectKey = platformChat.platform === "youtube" ? "youtubeRedirectUri" : "twitchRedirectUri";

  const submit = () => {
    if (!body.trim()) {
      return;
    }
    onSubmit(author, body);
    setBody("");
  };

  const updateMutedWords = (value: string) => {
    setMutedWords(value);
    onSettingsChange({ mutedWords: normalizeMutedWordsInput(value) });
  };

  return (
    <section className="control-panel">
      <PanelTitle icon={<MessageCircle size={18} />} title="Chat Reader" />
      <div className="chat-reader-status">
        <button
          className={`segmented-button ${chatReader.settings.enabled ? "active" : ""}`}
          type="button"
          onClick={() => onSettingsChange({ enabled: !chatReader.settings.enabled })}
        >
          <Volume2 size={16} />
          <span>{chatReader.settings.enabled ? "Read On" : "Read Off"}</span>
        </button>
        <span>{chatReader.queue.length} queued</span>
      </div>

      <label className="field">
        <span>Author</span>
        <input value={author} onChange={(event) => setAuthor(event.target.value)} />
      </label>
      <label className="field">
        <span>Comment</span>
        <input value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} />
      </label>
      <button className="secondary-action chat-submit" type="button" onClick={submit}>
        Test Read
      </button>

      <div className="chat-platform-panel">
        <div className="chat-platform-row">
          <button
            className={`segmented-button ${platformChat.enabled ? "active" : ""}`}
            type="button"
            onClick={() => onPlatformChatSettingsChange({ enabled: !platformChat.enabled })}
          >
            <Radio size={15} />
            <span>{platformChat.enabled ? "Platform On" : "Platform Off"}</span>
          </button>
          <span className={`chat-source-status ${platformStatus.status}`}>{platformStatus.label}</span>
        </div>
        <div className="protocol-row">
          <button
            className={`segmented-button ${platformChat.platform === "youtube" ? "active" : ""}`}
            type="button"
            onClick={() => onPlatformChatSettingsChange({ platform: "youtube" })}
          >
            YouTube
          </button>
          <button
            className={`segmented-button ${platformChat.platform === "twitch" ? "active" : ""}`}
            type="button"
            onClick={() => onPlatformChatSettingsChange({ platform: "twitch" })}
          >
            Twitch
          </button>
        </div>
        <div className="chat-oauth-panel">
          <label className="field">
            <span>OAuth client ID</span>
            <input
              autoComplete="off"
              value={oauthClientId}
              onChange={(event) => onPlatformChatOAuthChange({ [oauthClientKey]: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Redirect URI</span>
            <input value={oauthRedirectUri} onChange={(event) => onPlatformChatOAuthChange({ [oauthRedirectKey]: event.target.value })} />
          </label>
          <div className="chat-platform-row">
            <span className={`chat-source-status ${platformChatOAuthFlow?.platform === platformChat.platform ? "connecting" : "idle"}`}>
              {platformChatOAuthFlow?.platform === platformChat.platform ? "OAuth pending" : "OAuth idle"}
            </span>
            <button className="secondary-action compact-action" type="button" onClick={onPlatformChatOAuthStart}>
              <ShieldCheck size={15} />
              Start OAuth
            </button>
          </div>
          {platformChat.platform === "twitch" ? (
            <div className="chat-platform-row chat-device-row">
              <span className={`chat-source-status ${twitchDeviceOAuthFlow ? "connecting" : "idle"}`}>
                {twitchDeviceOAuthFlow ? `Device code ${twitchDeviceOAuthFlow.userCode}` : "Device OAuth idle"}
              </span>
              <button className="secondary-action compact-action" type="button" onClick={onTwitchDeviceOAuthStart}>
                Device OAuth
              </button>
              <button
                className="secondary-action compact-action"
                type="button"
                disabled={!twitchDeviceOAuthFlow}
                onClick={onTwitchDeviceOAuthPoll}
              >
                Check
              </button>
            </div>
          ) : null}
          <label className="field">
            <span>Callback URL</span>
            <input
              autoComplete="off"
              type="password"
              value={platformChatOAuth.callbackUrl}
              onChange={(event) => onPlatformChatOAuthChange({ callbackUrl: event.target.value })}
            />
          </label>
          <button className="secondary-action compact-action chat-ingest-action" type="button" onClick={onPlatformChatOAuthCallbackApply}>
            Apply OAuth Callback
          </button>
          <span className="chat-network-message">{platformChatOAuthStatus}</span>
          <button className="secondary-action compact-action chat-ingest-action" type="button" onClick={onPlatformStreamKeyApply}>
            <KeyRound size={15} />
            {platformChat.platform === "youtube" ? "Rotate Stream Key" : "Sync Stream Key"}
          </button>
          <span className="chat-network-message">{platformStreamKeyStatus}</span>
        </div>
        {platformChat.platform === "youtube" ? (
          <>
            <label className="field">
              <span>Live chat ID</span>
              <input
                value={platformChat.youtubeLiveChatId}
                onChange={(event) => onPlatformChatSettingsChange({ youtubeLiveChatId: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Access token</span>
              <input
                autoComplete="off"
                type="password"
                value={platformChatAuth.youtubeAccessToken}
                onChange={(event) => onPlatformChatAuthChange({ youtubeAccessToken: event.target.value })}
              />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>Twitch channel</span>
              <input value={platformChat.twitchChannel} onChange={(event) => onPlatformChatSettingsChange({ twitchChannel: event.target.value })} />
            </label>
            <label className="field">
              <span>Twitch login</span>
              <input
                autoComplete="off"
                value={platformChatAuth.twitchLogin}
                onChange={(event) => onPlatformChatAuthChange({ twitchLogin: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Access token</span>
              <input
                autoComplete="off"
                type="password"
                value={platformChatAuth.twitchOauthToken}
                onChange={(event) => onPlatformChatAuthChange({ twitchOauthToken: event.target.value })}
              />
            </label>
          </>
        )}
        <div className="chat-platform-row">
          <span className={`chat-source-status ${platformChatConnection.phase}`}>{platformChatConnection.label}</span>
          <button
            className="secondary-action compact-action"
            type="button"
            disabled={!platformChat.enabled}
            onClick={isNetworkConnected ? onPlatformChatDisconnect : onPlatformChatConnect}
          >
            <Wifi size={15} />
            {isNetworkConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
        <span className="chat-network-message">{platformChatConnection.message}</span>
        <button className="secondary-action compact-action chat-ingest-action" type="button" disabled={!platformChat.enabled} onClick={onPlatformChatSampleIngest}>
          <MessageCircle size={15} />
          Test Platform Chat
        </button>
      </div>

      <SpeechSlider label="Rate" value={chatReader.settings.rate} min={0.5} max={1.5} step={0.05} onChange={(rate) => onSettingsChange({ rate })} />
      <SpeechSlider label="Pitch" value={chatReader.settings.pitch} min={0.5} max={1.5} step={0.05} onChange={(pitch) => onSettingsChange({ pitch })} />
      <SpeechSlider label="Volume" value={chatReader.settings.volume} min={0} max={1} step={0.05} onChange={(volume) => onSettingsChange({ volume })} />
      <SpeechSlider
        label="Max length"
        value={chatReader.settings.maxMessageLength}
        min={40}
        max={240}
        step={10}
        onChange={(maxMessageLength) => onSettingsChange({ maxMessageLength })}
      />
      <SpeechSlider
        label="Queue limit"
        value={chatReader.settings.maxQueueLength}
        min={4}
        max={24}
        step={1}
        onChange={(maxQueueLength) => onSettingsChange({ maxQueueLength })}
      />
      <SpeechSlider
        label="Dedupe window"
        value={chatReader.settings.duplicateWindowSeconds}
        min={0}
        max={120}
        step={5}
        onChange={(duplicateWindowSeconds) => onSettingsChange({ duplicateWindowSeconds })}
      />

      <label className="field">
        <span>Muted words</span>
        <input value={mutedWords} onChange={(event) => updateMutedWords(event.target.value)} />
      </label>

      <div className="chat-history" aria-label="recent comments">
        {chatReader.history.length === 0 ? (
          <span className="chat-empty">No comments yet</span>
        ) : (
          chatReader.history.slice(0, 4).map((message) => (
            <span key={message.id} className="chat-history-row">
              <strong>{message.author}</strong>
              <span>{message.body}</span>
            </span>
          ))
        )}
      </div>
    </section>
  );
};

interface ProgramPreviewProps {
  scene: SceneDocument;
  selectedSourceId: string;
  onSelectSource(sourceId: string): void;
}

const ProgramPreview = ({ scene, selectedSourceId, onSelectSource }: ProgramPreviewProps) => {
  const graph = toRenderGraph(scene);
  return (
    <div className="program-preview">
      <div className="preview-toolbar">
        <span>{scene.name}</span>
        <span>
          {scene.canvas.width}x{scene.canvas.height} / {scene.canvas.fps}fps
        </span>
      </div>
      <div className="program-stage">
        {graph.map((node) => {
          const source = scene.sources.find((item) => item.id === node.id);
          if (!source) {
            return null;
          }
          const style = {
            left: `${source.transform.x * 100}%`,
            top: `${source.transform.y * 100}%`,
            width: `${source.transform.width * 100}%`,
            height: `${source.transform.height * 100}%`,
            opacity: source.transform.opacity,
            transform: `rotate(${source.transform.rotation}deg)`
          };
          return (
            <button
              key={source.id}
              className={`program-source ${source.kind} ${source.id === selectedSourceId ? "selected" : ""}`}
              style={style}
              type="button"
              onClick={() => onSelectSource(source.id)}
            >
              <SourceVisual source={source} />
            </button>
          );
        })}
      </div>
    </div>
  );
};

const SourceVisual = ({ source }: { source: SceneSource }) => {
  if (source.kind === "screen") {
    return (
      <div className="screen-visual">
        <MonitorSmartphone size={32} />
        <span>Screen Capture</span>
      </div>
    );
  }

  if (source.kind === "pngtuber" || source.kind === "live2d") {
    const motion = source.motion ?? defaultAvatarMotion();
    const bodyTransform = `translateY(${(-motion.bodyBounce + motion.breathing) * 100}px) rotate(${motion.bodyLean * 10}deg)`;
    const headTransform = [
      `translate(${motion.headX * 100}%, ${motion.headY * 100}%)`,
      `rotate(${motion.headRoll * 18}deg)`,
      `skew(${motion.headYaw * 7}deg, ${-motion.headPitch * 5}deg)`
    ].join(" ");

    return (
      <div className={`avatar-visual ${source.expression}`} style={{ transform: bodyTransform }}>
        <span className="avatar-body" aria-hidden="true" />
        <div className="avatar-head" style={{ transform: headTransform }}>
          <span className="avatar-eye left" style={{ transform: `scaleY(${Math.max(0.1, 1 - source.blink)})` }} />
          <span className="avatar-eye right" style={{ transform: `scaleY(${Math.max(0.1, 1 - source.blink)})` }} />
          <span className="avatar-mouth" style={{ height: `${8 + source.mouthOpen * 34}px` }} />
        </div>
        <span className="avatar-label">{source.kind === "live2d" ? "Live2D" : "PNGTuber"}</span>
      </div>
    );
  }

  if (source.kind === "text") {
    return (
      <span className="text-visual" style={{ color: source.color, fontSize: `${fontSizeForTextSource(source)}px` }}>
        {source.text}
      </span>
    );
  }

  if (source.kind === "solid") {
    return <span className="solid-visual" style={{ background: source.color }} />;
  }

  return <span className="image-visual">Image</span>;
};

const StatusPill = ({ label, tone }: { label: string; tone: "live" | "idle" | "bad" }) => (
  <span className={`status-pill ${tone}`}>{label}</span>
);

const Metric = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <span className="metric">
    {icon}
    {label}
  </span>
);

const Slider = ({
  label,
  value,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange(value: number): void;
}) => (
  <label className="slider-field">
    <span>
      {label}
      <strong>{Math.round(value * 100)}</strong>
    </span>
    <input
      min="0"
      max="1"
      step="0.01"
      type="range"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
);

const SpeechSlider = ({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange(value: number): void;
}) => (
  <label className="slider-field">
    <span>
      {label}
      <strong>{Number.isInteger(value) ? value : value.toFixed(2)}</strong>
    </span>
    <input
      min={min}
      max={max}
      step={step}
      type="range"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
);

const formatElapsed = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
};

const fontSizeForTextSource = (source: Extract<SceneSource, { kind: "text" }>): number => {
  const sourceWidthBudget = source.transform.width * 42;
  const sourceHeightBudget = source.transform.height * 150;
  return Math.max(10, Math.min(source.fontSize / 2, sourceWidthBudget, sourceHeightBudget));
};
