import {
  Activity,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
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
import type { StudioProfile } from "../domain/profiles";
import type { ReadinessReport } from "../domain/readiness";
import {
  addSource,
  createSource,
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
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import { LiveSetupScreen } from "./LiveSetupScreen";
import { PanelTitle } from "./ui";

interface StudioScreenProps {
  scene: SceneDocument;
  profile: StudioProfile;
  selectedSourceId: string;
  snapshot: NativeEngineSnapshot;
  readiness: ReadinessReport;
  chatReader: ChatReaderState;
  avatarRuntime: AvatarRuntimeState;
  onSceneChange(scene: SceneDocument): void;
  onProfileChange(profile: StudioProfile): void;
  onSelectSource(sourceId: string): void;
  onMicLevelChange(level: number): void;
  onExpressionChange(expression: AvatarExpression): void;
  onStart(): Promise<void>;
  onStop(): Promise<void>;
  onReconnect(): Promise<void>;
  onChatCommentSubmit(author: string, body: string): void;
  onChatReaderSettingsChange(settings: Partial<ChatReaderSettings>): void;
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

export const StudioScreen = ({
  scene,
  profile,
  selectedSourceId,
  snapshot,
  readiness,
  chatReader,
  avatarRuntime,
  onSceneChange,
  onProfileChange,
  onSelectSource,
  onMicLevelChange,
  onExpressionChange,
  onStart,
  onStop,
  onReconnect,
  onChatCommentSubmit,
  onChatReaderSettingsChange
}: StudioScreenProps) => {
  const selectedSource = scene.sources.find((source) => source.id === selectedSourceId) ?? scene.sources[0];
  const isLive = snapshot.state.status === "live" || snapshot.state.status === "reconnecting";
  const isBusy = snapshot.state.status === "preparing" || snapshot.state.status === "stopping";
  const setupLocked = isLive || isBusy;
  const canGoLive = readiness.canStart && !isBusy && !isLive;

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
            <button className="danger-action" type="button" disabled={isBusy || !isLive} onClick={onStop}>
              <Square size={18} />
              <span>Stop</span>
            </button>
            <button className="secondary-action" type="button" disabled={!isLive} onClick={onReconnect}>
              <RotateCcw size={18} />
              <span>Reconnect</span>
            </button>
            <div className="transport-readout">
              <span>{formatElapsed(snapshot.health.elapsedSeconds)}</span>
              <span>{snapshot.health.message}</span>
            </div>
          </div>
          <div id="go-live-readiness" className={`readiness-banner ${readiness.canStart ? "ready" : "blocked"}`}>
            <ShieldCheck size={16} />
            <span>
              {readiness.canStart
                ? readiness.warningCount > 0
                  ? `${readiness.warningCount} warning${readiness.warningCount === 1 ? "" : "s"} before live`
                  : "Ready to go live"
                : `${readiness.errorCount} blocking item${readiness.errorCount === 1 ? "" : "s"} before live`}
            </span>
          </div>
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
          </section>

          <ChatReaderPanel
            chatReader={chatReader}
            onSubmit={onChatCommentSubmit}
            onSettingsChange={onChatReaderSettingsChange}
          />

          <LiveSetupScreen profile={profile} readiness={readiness} locked={setupLocked} onProfileChange={onProfileChange} />
        </aside>
      </section>
    </main>
  );
};

const ChatReaderPanel = ({
  chatReader,
  onSubmit,
  onSettingsChange
}: {
  chatReader: ChatReaderState;
  onSubmit(author: string, body: string): void;
  onSettingsChange(settings: Partial<ChatReaderSettings>): void;
}) => {
  const [author, setAuthor] = useState("viewer");
  const [body, setBody] = useState("Nice stream!");
  const [mutedWords, setMutedWords] = useState(chatReader.settings.mutedWords.join(", "));

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
    return (
      <div className={`avatar-visual ${source.expression}`}>
        <div className="avatar-head">
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
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
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
