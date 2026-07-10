import { normalizeLive2DModelJsonUri } from "./live2dModel";
import { createLive2DRuntimePose, serializeLive2DRuntimePose } from "./live2dRuntime";
import { normalizeVrmModelUri } from "./vrmModel";
import { createVrmRuntimePose, serializeVrmRuntimePose } from "./vrmRuntime";
import { redactSensitiveText } from "./sensitiveText";

export type SourceKind = "screen" | "pngtuber" | "live2d" | "vrm" | "image" | "solid" | "text" | "chat";

export type BlendMode = "normal" | "multiply" | "screen";

export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface AvatarMotion {
  headYaw: number;
  headPitch: number;
  headRoll: number;
  headX: number;
  headY: number;
  bodyLean: number;
  bodyBounce: number;
  breathing: number;
  depthTilt: number;
  meshWarp: number;
  eyeSquint: number;
  mouthDeform: number;
  hairSway: number;
  shoulderSway: number;
  confidence: number;
}

export interface AvatarIllustrationRig {
  faceCenterX: number;
  faceCenterY: number;
  faceRange: number;
  hairLineY: number;
  shoulderLineY: number;
  leftEyeX: number;
  rightEyeX: number;
  eyeLineY: number;
  mouthCenterX: number;
  mouthLineY: number;
  sliceCount: number;
}

export interface AvatarIllustrationForegroundBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface AvatarIllustrationImageAnalysis {
  imageAspectRatio: number;
  foregroundBounds: AvatarIllustrationForegroundBounds | null;
  foregroundCoverage: number;
  confidence: number;
}

export interface AvatarIllustrationLandmarkPoint {
  /** Normalized horizontal position. Values outside 0-1 are retained for detector diagnostics but ignored by rig inference. */
  x: number;
  /** Normalized vertical position in the still-image coordinate space, from top 0 to bottom 1. */
  y: number;
  confidence?: number;
}

export interface AvatarIllustrationLandmarkAnalysis {
  confidence: number;
  faceCenter?: AvatarIllustrationLandmarkPoint | null;
  leftEye?: AvatarIllustrationLandmarkPoint | null;
  rightEye?: AvatarIllustrationLandmarkPoint | null;
  mouthCenter?: AvatarIllustrationLandmarkPoint | null;
  hairLineY?: number | null;
  shoulderLineY?: number | null;
}

export type AvatarIllustrationDetectorLandmarkType = "eye" | "mouth" | "nose";

export interface AvatarIllustrationDetectorLandmark {
  type: AvatarIllustrationDetectorLandmarkType | string;
  locations: AvatarIllustrationLandmarkPoint[];
  confidence?: number;
}

export interface AvatarIllustrationDetectorFace {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
  landmarks?: AvatarIllustrationDetectorLandmark[] | null;
}

export interface AvatarIllustrationDetectorInput {
  width: number;
  height: number;
  faces: AvatarIllustrationDetectorFace[];
}

export interface AvatarIllustrationAlphaMaskInput {
  width: number;
  height: number;
  data: ArrayLike<number>;
  pixelStride?: number;
  alphaOffset?: number;
  alphaThreshold?: number;
  sampleStep?: number;
}

export interface AvatarIllustrationPixelFeatureInput extends AvatarIllustrationAlphaMaskInput {
  foregroundBounds?: AvatarIllustrationForegroundBounds | null;
  lumaThreshold?: number;
}

export interface BaseSource {
  id: string;
  kind: SourceKind;
  name: string;
  visible: boolean;
  locked: boolean;
  transform: Transform;
  blendMode: BlendMode;
}

export interface ScreenSource extends BaseSource {
  kind: "screen";
  captureMode: "android-media-projection" | "ios-replaykit";
}

export interface PNGTuberSource extends BaseSource {
  kind: "pngtuber";
  avatarId: string;
  imageUri: string;
  illustrationRig: AvatarIllustrationRig;
  expression: string;
  mouthOpen: number;
  blink: number;
  motion: AvatarMotion;
}

export interface Live2DSource extends BaseSource {
  kind: "live2d";
  modelId: string;
  modelJsonUri: string;
  expression: string;
  mouthOpen: number;
  blink: number;
  motion: AvatarMotion;
}

export interface VRMSource extends BaseSource {
  kind: "vrm";
  modelId: string;
  modelUri: string;
  expression: string;
  mouthOpen: number;
  blink: number;
  motion: AvatarMotion;
}

export interface ImageSource extends BaseSource {
  kind: "image";
  uri: string;
}

export interface SolidSource extends BaseSource {
  kind: "solid";
  color: string;
}

export type TextSourceMode = "label" | "subtitle" | "ticker" | "caption";
export type TextSourceAlign = "left" | "center" | "right";
export type TextSourceContentSource = "manual" | "runtime-caption";
export type TextSourceVisibilityMode = "always" | "timed";
export type TextSourceTimerMode = "none" | "countdown" | "uptime";
export type TextOverlayPresetId =
  | "subtitle"
  | "lower-third"
  | "ticker"
  | "live-caption"
  | "title"
  | "notice"
  | "badge"
  | "starting-soon-countdown"
  | "uptime-badge";
export type ManualTextOverlayPresetId = Exclude<TextOverlayPresetId, "live-caption">;

export interface ManualTextOverlayPreset {
  presetId: ManualTextOverlayPresetId;
  label: string;
  description: string;
}

export interface TextSource extends BaseSource {
  kind: "text";
  text: string;
  mode: TextSourceMode;
  contentSource: TextSourceContentSource;
  align: TextSourceAlign;
  showCaptionSpeaker: boolean;
  visibilityMode: TextSourceVisibilityMode;
  timerMode: TextSourceTimerMode;
  countdownTargetMs?: number;
  timerCompleteText: string;
  displayDurationMs: number;
  activatedAtMs: number;
  color: string;
  fontSize: number;
  backgroundColor: string;
  backgroundOpacity: number;
  outlineColor: string;
  outlineWidth: number;
  maxLines: number;
}

export interface ChatOverlaySource extends BaseSource {
  kind: "chat";
  maxMessages: number;
  maxMessageLength: number;
  showAuthor: boolean;
  redactUrls: boolean;
  color: string;
  fontSize: number;
  backgroundColor: string;
  backgroundOpacity: number;
}

export type SceneSource =
  | ScreenSource
  | PNGTuberSource
  | Live2DSource
  | VRMSource
  | ImageSource
  | SolidSource
  | TextSource
  | ChatOverlaySource;

export interface ChatOverlayMessage {
  author: string;
  body: string;
  source?: string;
  pinned?: boolean;
}

export interface CaptionOverlayCue {
  text: string;
  speaker?: string;
  language?: string;
  confidence?: number;
  isFinal?: boolean;
  timestampMs?: number;
}

export interface RenderGraphRuntime {
  chatMessages?: ChatOverlayMessage[];
  captions?: CaptionOverlayCue[];
  captionsEnabled?: boolean;
  nowMs?: number;
  streamStartedAtMs?: number;
}

export interface TimedTextOverlayRequest {
  text: string;
  sourceId?: string;
  presetId?: TextOverlayPresetId;
  durationMs?: number;
  nowMs?: number;
}

export interface PersistentTextOverlayRequest {
  text: string;
  sourceId?: string;
  presetId?: TextOverlayPresetId;
  nowMs?: number;
}

export interface HideTextOverlayRequest {
  sourceId?: string;
  includeRuntimeCaptions?: boolean;
}

export type QuickTextOverlayPresetId =
  | "welcome"
  | "reading-chat"
  | "mic-check"
  | "please-wait"
  | "follow-reminder"
  | "spoiler-alert"
  | "ending-soon"
  | "thanks"
  | "pinned-comment"
  | "starting-soon-countdown"
  | "uptime-badge"
  | "spoiler-clear"
  | "stream-trouble";

export type QuickTextOverlayPresetCategory = "subtitle" | "notice" | "engagement" | "safety" | "timer";

export interface QuickTextOverlayPreset {
  id: QuickTextOverlayPresetId;
  category: QuickTextOverlayPresetCategory;
  label: string;
  text: string;
  presetId: TextOverlayPresetId;
  durationMs: number;
}

export interface QuickTextOverlayPresetGroup {
  category: QuickTextOverlayPresetCategory;
  label: string;
  presets: readonly QuickTextOverlayPreset[];
}

export type QuickTextOverlayDurationPresetId = "short" | "standard" | "long" | "extended";
export type QuickTextOverlayPresetAction = "show" | "queue" | "pin";

export interface QuickTextOverlayDurationPreset {
  id: QuickTextOverlayDurationPresetId;
  label: string;
  durationMs: number;
}

export interface QuickTextOverlayPresetActionOption {
  action: QuickTextOverlayPresetAction;
  label: string;
}

export interface QuickTextOverlayDeckCue {
  id: string;
  label: string;
  text: string;
  presetId: ManualTextOverlayPresetId;
  durationMs: number;
}

export interface QuickTextOverlayDeckOptions {
  defaultPresetId?: ManualTextOverlayPresetId;
  defaultDurationMs?: number;
  maxCueCount?: number;
}

export interface TextOverlayRuntimeStatus {
  sourceCount: number;
  visibleSourceCount: number;
  activeSourceCount: number;
  activeManualSourceCount: number;
  activeCaptionSourceCount: number;
  timedSourceCount: number;
  queuedSourceCount: number;
  pinnedSourceCount: number;
  nextExpirationMs: number | null;
  remainingMs: number;
  previewText: string;
  nextQueuedStartMs: number | null;
  nextQueuedRemainingMs: number;
  queuedPreviewText: string;
}

export interface SceneDocument {
  version: 1;
  id: string;
  name: string;
  quickTextOverlayDeckInput?: string;
  canvas: {
    width: number;
    height: number;
    fps: number;
  };
  sources: SceneSource[];
}

export type SceneTemplateId = "main" | "starting-soon" | "break" | "privacy-shield";
export type SceneTransitionKind = "cut" | "fade";

export interface SceneTransitionSettings {
  kind: SceneTransitionKind;
  durationMs: number;
}

export interface SceneTransitionPreview {
  scene: SceneDocument;
  startedAt: number;
  settings: SceneTransitionSettings;
}

export interface SceneCollection {
  version: 1;
  activeSceneId: string;
  transition: SceneTransitionSettings;
  scenes: SceneDocument[];
}

export interface AvatarIllustrationRigInferenceInput {
  canvas?: Partial<SceneDocument["canvas"]> | null;
  transform?: Partial<Transform> | null;
  imageAspectRatio?: number | null;
  imageAnalysis?: AvatarIllustrationImageAnalysis | null;
  landmarkAnalysis?: AvatarIllustrationLandmarkAnalysis | null;
}

export interface RenderNode {
  id: string;
  kind: SourceKind;
  order: number;
  transform: Transform;
  payload: Record<string, string | number | boolean>;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clampRange = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const sourceKinds: readonly SourceKind[] = ["screen", "pngtuber", "live2d", "vrm", "image", "solid", "text", "chat"];
const blendModes: readonly BlendMode[] = ["normal", "multiply", "screen"];
const sceneTransitionKinds: readonly SceneTransitionKind[] = ["cut", "fade"];
const textSourceModes: readonly TextSourceMode[] = ["label", "subtitle", "ticker", "caption"];
const textSourceAlignments: readonly TextSourceAlign[] = ["left", "center", "right"];
const textSourceContentSources: readonly TextSourceContentSource[] = ["manual", "runtime-caption"];
const textSourceVisibilityModes: readonly TextSourceVisibilityMode[] = ["always", "timed"];
const textSourceTimerModes: readonly TextSourceTimerMode[] = ["none", "countdown", "uptime"];
const textOverlayLineMaxLength = 220;
const textOverlayTokenMaxLength = 48;
const textOverlayMinimumDisplayDurationMs = 1000;
const textOverlayMaximumDisplayDurationMs = 60000;
const textOverlayDefaultDisplayDurationMs = 5000;
const defaultCountdownPrefixText = "配信開始まで";
const defaultCountdownCompleteText = "まもなく開始…";
const defaultUptimePrefixText = "経過";
const quickSubtitleSourceName = "Quick Subtitle";
const queuedSubtitleSourceName = "Queued Subtitle";
const pinnedTextSourceName = "Pinned Text";
const quickTextOverlayDeckDefaultMaxCueCount = 12;
const quickTextOverlayDeckLabelMaxLength = 20;
const quickTextOverlayDeckInputMaxLength = 1200;

const normalizeTextOverlayDisplayDurationMs = (durationMs: number | undefined): number =>
  Math.round(
    clampRange(
      finiteNumber(durationMs, textOverlayDefaultDisplayDurationMs),
      textOverlayMinimumDisplayDurationMs,
      textOverlayMaximumDisplayDurationMs
    )
  );

export const formatTimerOverlayText = (
  nowMs: number,
  source: Pick<TextSource, "timerMode" | "countdownTargetMs" | "timerCompleteText" | "activatedAtMs" | "text">,
  runtime: Pick<RenderGraphRuntime, "streamStartedAtMs"> = {}
): string => {
  const mode = source.timerMode ?? "none";
  const now = Math.max(0, Math.round(finiteNumber(nowMs, Date.now())));

  if (mode === "countdown") {
    const targetMs = Math.max(0, Math.round(finiteNumber(source.countdownTargetMs, 0)));
    if (targetMs <= now) {
      return normalizeOverlayText(source.timerCompleteText || defaultCountdownCompleteText) || defaultCountdownCompleteText;
    }
    const prefix = normalizeTimerPrefix(source.text, defaultCountdownPrefixText);
    return `${prefix} ${formatTimerDurationSeconds(Math.ceil((targetMs - now) / 1000))}`;
  }

  if (mode === "uptime") {
    const streamStartedAtMs = Math.max(0, Math.round(finiteNumber(runtime.streamStartedAtMs, 0)));
    const sourceStartedAtMs = Math.max(0, Math.round(finiteNumber(source.activatedAtMs, 0)));
    const startedAtMs = streamStartedAtMs > 0 ? streamStartedAtMs : sourceStartedAtMs > 0 ? sourceStartedAtMs : now;
    const prefix = normalizeTimerPrefix(source.text, defaultUptimePrefixText);
    return `${prefix} ${formatTimerDurationSeconds(Math.floor(Math.max(0, now - startedAtMs) / 1000))}`;
  }

  return normalizeOverlayText(source.text);
};

const normalizeTimerPrefix = (value: string, fallback: string): string =>
  normalizeOverlayText(value).replace(/\s+$/, "") || fallback;

const formatTimerDurationSeconds = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(finiteNumber(totalSeconds, 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
};

export const quickTextOverlayDurationPresets: readonly QuickTextOverlayDurationPreset[] = [
  { id: "short", label: "3s", durationMs: 3000 },
  { id: "standard", label: "5s", durationMs: 5000 },
  { id: "long", label: "8s", durationMs: 8000 },
  { id: "extended", label: "12s", durationMs: 12000 }
];

export const quickTextOverlayPresetActions: readonly QuickTextOverlayPresetActionOption[] = [
  { action: "show", label: "表示" },
  { action: "queue", label: "キュー" },
  { action: "pin", label: "固定" }
];

export const quickTextOverlayPresets: readonly QuickTextOverlayPreset[] = [
  {
    id: "welcome",
    category: "subtitle",
    label: "初見歓迎",
    text: "初見さん歓迎です",
    presetId: "subtitle",
    durationMs: 5000
  },
  {
    id: "reading-chat",
    category: "subtitle",
    label: "コメント読む",
    text: "コメント読みます",
    presetId: "subtitle",
    durationMs: 4500
  },
  {
    id: "mic-check",
    category: "notice",
    label: "マイク確認",
    text: "マイク音量を確認中です",
    presetId: "notice",
    durationMs: 6000
  },
  {
    id: "please-wait",
    category: "notice",
    label: "少し待って",
    text: "少しお待ちください",
    presetId: "notice",
    durationMs: 7000
  },
  {
    id: "follow-reminder",
    category: "engagement",
    label: "フォローお願い",
    text: "フォロー・高評価お願いします",
    presetId: "ticker",
    durationMs: 8000
  },
  {
    id: "spoiler-alert",
    category: "safety",
    label: "ネタバレ注意",
    text: "ここからネタバレ注意",
    presetId: "badge",
    durationMs: 6000
  },
  {
    id: "ending-soon",
    category: "notice",
    label: "終了前",
    text: "まもなく配信を終了します",
    presetId: "notice",
    durationMs: 7000
  },
  {
    id: "thanks",
    category: "subtitle",
    label: "ありがとう",
    text: "ご視聴ありがとうございます",
    presetId: "subtitle",
    durationMs: 5500
  },
  {
    id: "pinned-comment",
    category: "engagement",
    label: "固定コメント",
    text: "固定コメントを確認してください",
    presetId: "lower-third",
    durationMs: 9000
  },
  {
    id: "starting-soon-countdown",
    category: "timer",
    label: "開始カウント",
    text: defaultCountdownPrefixText,
    presetId: "starting-soon-countdown",
    durationMs: 12000
  },
  {
    id: "uptime-badge",
    category: "timer",
    label: "経過バッジ",
    text: defaultUptimePrefixText,
    presetId: "uptime-badge",
    durationMs: 12000
  },
  {
    id: "spoiler-clear",
    category: "safety",
    label: "ネタバレ終了",
    text: "ネタバレ区間は終了しました",
    presetId: "badge",
    durationMs: 5000
  },
  {
    id: "stream-trouble",
    category: "notice",
    label: "配信不調",
    text: "配信が不安定なため調整中です",
    presetId: "notice",
    durationMs: 8000
  }
];

export const quickTextOverlayPresetCategories: readonly {
  category: QuickTextOverlayPresetCategory;
  label: string;
}[] = [
  { category: "subtitle", label: "字幕" },
  { category: "notice", label: "告知" },
  { category: "engagement", label: "誘導" },
  { category: "timer", label: "タイマー" },
  { category: "safety", label: "注意" }
];

export const quickTextOverlayPresetGroups: readonly QuickTextOverlayPresetGroup[] = quickTextOverlayPresetCategories.map(
  (group) => ({
    ...group,
    presets: quickTextOverlayPresets.filter((preset) => preset.category === group.category)
  })
);

export const defaultQuickTextOverlayDeckInput = [
  "[subtitle] 初見さん歓迎です",
  "[notice] 少しお待ちください",
  "[ticker] フォロー・高評価お願いします",
  "[badge] ネタバレ注意",
  "[lower-third] 固定コメントを確認してください"
].join("\n");

const quickTextOverlayDeckPresetAliases: Readonly<Record<string, ManualTextOverlayPresetId>> = {
  subtitle: "subtitle",
  captions: "subtitle",
  caption: "subtitle",
  "字幕": "subtitle",
  "テロップ": "subtitle",
  notice: "notice",
  alert: "notice",
  "告知": "notice",
  "通知": "notice",
  ticker: "ticker",
  crawl: "ticker",
  "帯": "ticker",
  "ニュース": "ticker",
  badge: "badge",
  live: "badge",
  "バッジ": "badge",
  "注意": "badge",
  "lower-third": "lower-third",
  lowerthird: "lower-third",
  lower: "lower-third",
  third: "lower-third",
  "肩書き": "lower-third",
  "左下": "lower-third",
  title: "title",
  "タイトル": "title",
  countdown: "starting-soon-countdown",
  "カウントダウン": "starting-soon-countdown",
  uptime: "uptime-badge",
  "経過": "uptime-badge"
};

export const createQuickTextOverlayDeck = (
  input: string,
  options: QuickTextOverlayDeckOptions = {}
): QuickTextOverlayDeckCue[] => {
  const defaultPresetId = normalizeManualTextOverlayPresetId(options.defaultPresetId, "subtitle");
  const defaultDurationMs = normalizeTextOverlayDisplayDurationMs(options.defaultDurationMs);
  const maxCueCount = Math.round(
    clampRange(finiteNumber(options.maxCueCount, quickTextOverlayDeckDefaultMaxCueCount), 1, quickTextOverlayDeckDefaultMaxCueCount)
  );

  return normalizeQuickTextOverlayDeckInput(input)
    .split(/\r?\n/)
    .flatMap((line, index) =>
      createQuickTextOverlayDeckCue(line, index, {
        defaultPresetId,
        defaultDurationMs
      })
    )
    .slice(0, maxCueCount);
};

export const normalizeQuickTextOverlayDeckInput = (input: unknown, fallback = ""): string => {
  const raw = typeof input === "string" ? input : fallback;
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => normalizeOverlayText(line))
    .filter((line) => line.length > 0)
    .slice(0, quickTextOverlayDeckDefaultMaxCueCount)
    .join("\n")
    .slice(0, quickTextOverlayDeckInputMaxLength);
};

export const manualTextOverlayPresets: readonly ManualTextOverlayPreset[] = [
  { presetId: "subtitle", label: "Subtitle", description: "Bottom subtitles for spoken copy or short reactions." },
  { presetId: "lower-third", label: "Lower Third", description: "Left-aligned lower-third title or announcement." },
  { presetId: "notice", label: "Notice", description: "Centered notice for breaks, waiting, or alerts." },
  { presetId: "ticker", label: "Ticker", description: "Full-width bottom ticker for repeated stream copy." },
  { presetId: "badge", label: "Badge", description: "Corner badge such as LIVE, SPOILER, or Q&A." },
  { presetId: "title", label: "Title", description: "Large top title text for scene labels." },
  { presetId: "starting-soon-countdown", label: "Starting Soon countdown", description: "Countdown text for pre-stream scenes." },
  { presetId: "uptime-badge", label: "Uptime badge", description: "Elapsed-stream timer badge." }
];

const createQuickTextOverlayDeckCue = (
  rawLine: string,
  index: number,
  options: Required<Pick<QuickTextOverlayDeckOptions, "defaultPresetId" | "defaultDurationMs">>
): QuickTextOverlayDeckCue[] => {
  const parsed = parseQuickTextOverlayDeckLine(rawLine, options.defaultPresetId);
  const text = serializeTextOverlayLines(parsed.text, 4).join("\n");
  if (!text) {
    return [];
  }

  return [
    {
      id: `deck-cue-${index + 1}-${createStableOverlayCueSlug(text)}`,
      label: createQuickTextOverlayDeckCueLabel(text),
      text,
      presetId: parsed.presetId,
      durationMs: options.defaultDurationMs
    }
  ];
};

const parseQuickTextOverlayDeckLine = (
  rawLine: string,
  defaultPresetId: ManualTextOverlayPresetId
): { text: string; presetId: ManualTextOverlayPresetId } => {
  const line = rawLine.trim();
  const match = line.match(/^\[([^\]]+)\]\s*(.*)$/u);
  if (!match) {
    return { text: line, presetId: defaultPresetId };
  }

  const alias = normalizeOverlayText(match[1] ?? "").toLowerCase();
  return {
    text: match[2] ?? "",
    presetId: quickTextOverlayDeckPresetAliases[alias] ?? defaultPresetId
  };
};

const createQuickTextOverlayDeckCueLabel = (text: string): string => {
  const singleLine = normalizeOverlayText(text.replace(/\n+/g, " "));
  if (singleLine.length <= quickTextOverlayDeckLabelMaxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, quickTextOverlayDeckLabelMaxLength - 1).trim()}…`;
};

const createStableOverlayCueSlug = (text: string): string => {
  const slug = normalizeOverlayText(text)
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ン一-龯]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "text";
};

const normalizeManualTextOverlayPresetId = (
  presetId: ManualTextOverlayPresetId | undefined,
  fallback: ManualTextOverlayPresetId
): ManualTextOverlayPresetId =>
  presetId && manualTextOverlayPresets.some((preset) => preset.presetId === presetId) ? presetId : fallback;

const clampTransform = (transform: Transform): Transform => ({
  x: clamp01(transform.x),
  y: clamp01(transform.y),
  width: clamp01(transform.width),
  height: clamp01(transform.height),
  rotation: Math.max(-180, Math.min(180, transform.rotation)),
  opacity: clamp01(transform.opacity)
});

const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const defaultSceneTransitionSettings = (
  overrides: Partial<SceneTransitionSettings> = {}
): SceneTransitionSettings => ({
  kind: sceneTransitionKinds.includes(overrides.kind as SceneTransitionKind) ? (overrides.kind as SceneTransitionKind) : "fade",
  durationMs: Math.round(clampRange(overrides.durationMs ?? 300, 0, 2000))
});

export const defaultAvatarMotion = (overrides: Partial<AvatarMotion> = {}): AvatarMotion => ({
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  headX: 0,
  headY: 0,
  bodyLean: 0,
  bodyBounce: 0,
  breathing: 0,
  depthTilt: 0,
  meshWarp: 0,
  eyeSquint: 0,
  mouthDeform: 0,
  hairSway: 0,
  shoulderSway: 0,
  confidence: 0,
  ...overrides
});

export const defaultAvatarIllustrationRig = (overrides: Partial<AvatarIllustrationRig> = {}): AvatarIllustrationRig => {
  const rawLeftEyeX = clampRange(overrides.leftEyeX ?? 0.42, 0.05, 0.95);
  const rawRightEyeX = clampRange(overrides.rightEyeX ?? 0.58, 0.05, 0.95);
  const eyeCenterX = clampRange((rawLeftEyeX + rawRightEyeX) / 2, 0.06, 0.94);
  const leftEyeX = rawRightEyeX - rawLeftEyeX >= 0.02 ? rawLeftEyeX : Math.max(0.05, eyeCenterX - 0.01);
  const rightEyeX = rawRightEyeX - rawLeftEyeX >= 0.02 ? rawRightEyeX : Math.min(0.95, eyeCenterX + 0.01);
  return {
    faceCenterX: clampRange(overrides.faceCenterX ?? 0.5, 0.05, 0.95),
    faceCenterY: clampRange(overrides.faceCenterY ?? 0.42, 0.15, 0.85),
    faceRange: clampRange(overrides.faceRange ?? 0.34, 0.08, 0.6),
    hairLineY: clampRange(overrides.hairLineY ?? 0.34, 0.05, 0.55),
    shoulderLineY: clampRange(overrides.shoulderLineY ?? 0.62, 0.45, 0.95),
    leftEyeX,
    rightEyeX,
    eyeLineY: clampRange(overrides.eyeLineY ?? 0.35, 0.12, 0.65),
    mouthCenterX: clampRange(overrides.mouthCenterX ?? 0.5, 0.05, 0.95),
    mouthLineY: clampRange(overrides.mouthLineY ?? 0.5, 0.25, 0.85),
    sliceCount: Math.round(clampRange(overrides.sliceCount ?? 24, 12, 40))
  };
};

export const analyzeAvatarIllustrationAlphaMask = (
  input: AvatarIllustrationAlphaMaskInput
): AvatarIllustrationImageAnalysis | null => {
  const width = Math.floor(finiteNumber(input.width, 0));
  const height = Math.floor(finiteNumber(input.height, 0));
  const pixelStride = Math.max(1, Math.floor(finiteNumber(input.pixelStride, 4)));
  const alphaOffset = Math.max(0, Math.floor(finiteNumber(input.alphaOffset, 3)));
  const alphaThreshold = clampRange(finiteNumber(input.alphaThreshold, 16), 0, 255);
  const sampleStep = Math.max(
    1,
    Math.floor(finiteNumber(input.sampleStep, Math.ceil(Math.max(width, height) / 512)))
  );
  const expectedLength = width * height * pixelStride;
  if (width <= 0 || height <= 0 || input.data.length < expectedLength || alphaOffset >= pixelStride) {
    return null;
  }

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let foregroundSamples = 0;
  let totalSamples = 0;
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      totalSamples += 1;
      const alpha = input.data[(y * width + x) * pixelStride + alphaOffset] ?? 0;
      if (alpha <= alphaThreshold) {
        continue;
      }
      foregroundSamples += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  const imageAspectRatio = width / height;
  if (foregroundSamples === 0 || totalSamples === 0) {
    return {
      imageAspectRatio,
      foregroundBounds: null,
      foregroundCoverage: 0,
      confidence: 0
    };
  }

  const left = minX / width;
  const right = Math.min(1, (maxX + sampleStep) / width);
  const top = minY / height;
  const bottom = Math.min(1, (maxY + sampleStep) / height);
  const foregroundCoverage = foregroundSamples / totalSamples;
  const bounds = {
    left,
    right,
    top,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };

  return {
    imageAspectRatio,
    foregroundBounds: bounds,
    foregroundCoverage,
    confidence: clamp01(bounds.width * bounds.height > 0 ? foregroundCoverage / Math.max(bounds.width * bounds.height, 0.01) : 0)
  };
};

export const createAvatarIllustrationLandmarkAnalysisFromPixelFeatures = (
  input: AvatarIllustrationPixelFeatureInput
): AvatarIllustrationLandmarkAnalysis | null => {
  const width = Math.floor(finiteNumber(input.width, 0));
  const height = Math.floor(finiteNumber(input.height, 0));
  const pixelStride = Math.max(1, Math.floor(finiteNumber(input.pixelStride, 4)));
  const alphaOffset = Math.max(0, Math.floor(finiteNumber(input.alphaOffset, 3)));
  const alphaThreshold = clampRange(finiteNumber(input.alphaThreshold, 16), 0, 255);
  const lumaThreshold = clampRange(finiteNumber(input.lumaThreshold, 112), 0, 255);
  const sampleStep = Math.max(
    1,
    Math.floor(finiteNumber(input.sampleStep, Math.ceil(Math.max(width, height) / 512)))
  );
  const expectedLength = width * height * pixelStride;
  if (width <= 0 || height <= 0 || input.data.length < expectedLength || alphaOffset >= pixelStride) {
    return null;
  }

  const foregroundBounds = normalizeAvatarIllustrationForegroundBounds(input.foregroundBounds);
  const bounds = foregroundBounds ?? {
    left: 0,
    right: 1,
    top: 0,
    bottom: 1,
    width: 1,
    height: 1
  };
  if (bounds.width < 0.08 || bounds.height < 0.18) {
    return null;
  }

  const candidates: AvatarIllustrationPixelFeatureCandidate[] = [];
  const minX = Math.max(0, Math.floor(bounds.left * width));
  const maxX = Math.min(width - 1, Math.ceil(bounds.right * width));
  const minY = Math.max(0, Math.floor((bounds.top + bounds.height * 0.12) * height));
  const maxY = Math.min(height - 1, Math.ceil((bounds.top + bounds.height * 0.78) * height));
  let foregroundSamples = 0;
  let darkSamples = 0;

  for (let y = minY; y <= maxY; y += sampleStep) {
    for (let x = minX; x <= maxX; x += sampleStep) {
      const offset = (y * width + x) * pixelStride;
      const alpha = input.data[offset + alphaOffset] ?? 0;
      if (alpha <= alphaThreshold) {
        continue;
      }
      foregroundSamples += 1;
      const red = input.data[offset] ?? 0;
      const green = input.data[offset + 1] ?? red;
      const blue = input.data[offset + 2] ?? red;
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const saturation = createRgbSaturation(red, green, blue);
      const darkStroke = luma <= lumaThreshold;
      const saturatedStroke = saturation >= 0.36 && luma <= lumaThreshold + 42;
      if (!darkStroke && !saturatedStroke) {
        continue;
      }
      darkSamples += 1;
      candidates.push({
        x: clamp01((x + sampleStep / 2) / width),
        y: clamp01((y + sampleStep / 2) / height),
        weight: clamp01((255 - luma) / 255 + saturation * 0.18)
      });
    }
  }

  if (foregroundSamples === 0 || candidates.length < 8 || darkSamples / foregroundSamples > 0.42) {
    return null;
  }

  const eyeSearchTop = bounds.top + bounds.height * 0.16;
  const eyeSearchBottom = bounds.top + bounds.height * 0.52;
  const eyeLine = findAvatarIllustrationFeatureLine(candidates, eyeSearchTop, eyeSearchBottom, height, sampleStep);
  if (!eyeLine) {
    return null;
  }
  const mouthSearchTop = Math.max(bounds.top + bounds.height * 0.36, eyeLine.y + Math.max(0.08, bounds.height * 0.12));
  const mouthSearchBottom = bounds.top + bounds.height * 0.76;
  const mouthLine = findAvatarIllustrationFeatureLine(candidates, mouthSearchTop, mouthSearchBottom, height, sampleStep);
  if (!mouthLine) {
    return null;
  }

  const eyeMouthGap = mouthLine.y - eyeLine.y;
  if (eyeMouthGap < 0.1 || eyeMouthGap > 0.34) {
    return null;
  }

  const centerX = bounds.left + bounds.width / 2;
  const leftEye = createFeaturePoint(eyeLine.candidates.filter((candidate) => candidate.x <= centerX));
  const rightEye = createFeaturePoint(eyeLine.candidates.filter((candidate) => candidate.x > centerX));
  const mouthCenter = createFeaturePoint(mouthLine.candidates);
  if (!mouthCenter || (!leftEye && !rightEye)) {
    return null;
  }

  const eyePairSpread =
    leftEye && rightEye ? clamp01((rightEye.x - leftEye.x) / Math.max(bounds.width * 0.28, Number.EPSILON)) : 0.45;
  const lineStrength = clamp01((eyeLine.weight + mouthLine.weight) / Math.max(candidates.length * 0.34, 1));
  const confidence = clamp01(0.56 + lineStrength * 0.24 + eyePairSpread * 0.12 + clamp01(eyeMouthGap / 0.2) * 0.08);

  return {
    confidence,
    faceCenter: {
      x: mouthCenter.x,
      y: clampRange(eyeLine.y + eyeMouthGap * 0.44, bounds.top + 0.08, bounds.bottom - 0.08),
      confidence
    },
    leftEye: leftEye ? { ...leftEye, confidence } : null,
    rightEye: rightEye ? { ...rightEye, confidence } : null,
    mouthCenter: { ...mouthCenter, confidence },
    hairLineY: clamp01(Math.max(bounds.top, eyeLine.y - eyeMouthGap * 0.85)),
    shoulderLineY: clamp01(Math.min(bounds.bottom, mouthLine.y + eyeMouthGap * 1.45))
  };
};

export const createAvatarIllustrationLandmarkAnalysisFromDetector = (
  input: AvatarIllustrationDetectorInput
): AvatarIllustrationLandmarkAnalysis | null => {
  const width = finiteNumber(input.width, 0);
  const height = finiteNumber(input.height, 0);
  if (width <= 0 || height <= 0 || input.faces.length === 0) {
    return null;
  }

  const face = input.faces
    .map((candidate) => normalizeDetectorFace(candidate, width, height))
    .filter((candidate): candidate is NormalizedDetectorFace => candidate !== null)
    .sort((left, right) => right.area * right.confidence - left.area * left.confidence)[0];
  if (!face) {
    return null;
  }

  const eyes = face.landmarks
    .filter((landmark) => landmark.type === "eye")
    .map((landmark) => averageLandmarkLocations(landmark.locations, landmark.confidence))
    .filter((point): point is AvatarIllustrationLandmarkPoint => point !== null)
    .sort((left, right) => left.x - right.x);
  const mouth = face.landmarks
    .filter((landmark) => landmark.type === "mouth")
    .map((landmark) => averageLandmarkLocations(landmark.locations, landmark.confidence))
    .filter((point): point is AvatarIllustrationLandmarkPoint => point !== null)
    .sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0))[0];
  const hasEyeLandmark = eyes.length > 0;
  const hasMouthLandmark = Boolean(mouth);
  const hasDetectorLandmarks = hasEyeLandmark || hasMouthLandmark;
  const fallbackConfidence = hasEyeLandmark && hasMouthLandmark ? 0.86 : hasDetectorLandmarks ? 0.78 : 0.62;
  const confidence = clamp01(Math.max(fallbackConfidence, face.confidence));
  const eyeConfidence = hasDetectorLandmarks ? confidence : confidence * 0.72;
  const mouthConfidence = mouth ? (mouth.confidence ?? confidence) : confidence * 0.7;
  const box = face.boundingBox;
  const leftEye =
    eyes.length >= 2
      ? eyes[0]
      : eyes[0] ?? {
          x: clamp01(box.x + box.width * 0.34),
          y: clamp01(box.y + box.height * 0.42),
          confidence: eyeConfidence
        };
  const rightEye =
    eyes.length >= 2
      ? eyes[eyes.length - 1]
      : eyes[0]
        ? null
        : {
            x: clamp01(box.x + box.width * 0.66),
            y: clamp01(box.y + box.height * 0.42),
            confidence: eyeConfidence
          };

  return {
    confidence,
    faceCenter: {
      x: clamp01(box.x + box.width / 2),
      y: clamp01(box.y + box.height * 0.54),
      confidence
    },
    leftEye,
    rightEye,
    mouthCenter: mouth ?? {
      x: clamp01(box.x + box.width / 2),
      y: clamp01(box.y + box.height * 0.74),
      confidence: mouthConfidence
    },
    hairLineY: clamp01(box.y - box.height * 0.18),
    shoulderLineY: clamp01(box.y + box.height * 1.58)
  };
};

export const inferAvatarIllustrationRig = (
  input: AvatarIllustrationRigInferenceInput = {},
  overrides: Partial<AvatarIllustrationRig> = {}
): AvatarIllustrationRig => {
  const canvasWidth = clampRange(input.canvas?.width ?? 1920, 1, 7680);
  const canvasHeight = clampRange(input.canvas?.height ?? 1080, 1, 4320);
  const transformWidth = clampRange(input.transform?.width ?? 0.3, 0.03, 1);
  const transformHeight = clampRange(input.transform?.height ?? 0.45, 0.03, 1);
  const imageAspectRatio = finiteNumber(input.imageAspectRatio, 0);
  const analysisRig = inferAvatarIllustrationRigFromImageAnalysis(input.imageAnalysis ?? null);
  const landmarkRig = inferAvatarIllustrationRigFromLandmarks(input.landmarkAnalysis ?? null, input.imageAnalysis ?? null);
  const renderAspect =
    input.imageAnalysis?.imageAspectRatio && input.imageAnalysis.imageAspectRatio > 0
      ? input.imageAnalysis.imageAspectRatio
      : imageAspectRatio > 0
        ? imageAspectRatio
        : (transformWidth * canvasWidth) / Math.max(transformHeight * canvasHeight, 1);
  const tallOrLarge = transformHeight >= 0.58 || renderAspect < 0.74;
  const closeUp = transformHeight <= 0.28 || renderAspect > 1.32;
  const inferred = tallOrLarge
    ? {
        faceCenterY: 0.32,
        faceRange: 0.24,
        hairLineY: 0.23,
        shoulderLineY: 0.54,
        eyeLineY: 0.28,
        mouthLineY: 0.39,
        sliceCount: 32
      }
    : closeUp
      ? {
          faceCenterY: 0.46,
          faceRange: 0.48,
          hairLineY: 0.26,
          shoulderLineY: 0.82,
          eyeLineY: 0.4,
          mouthLineY: 0.58,
          sliceCount: 20
        }
      : {
          faceCenterY: 0.39,
          faceRange: 0.34,
          hairLineY: 0.31,
          shoulderLineY: 0.63,
          eyeLineY: 0.34,
          mouthLineY: 0.49,
          sliceCount: 24
        };

  return defaultAvatarIllustrationRig({ ...inferred, ...analysisRig, ...landmarkRig, ...overrides });
};

const inferAvatarIllustrationRigFromLandmarks = (
  landmarks: AvatarIllustrationLandmarkAnalysis | null,
  imageAnalysis: AvatarIllustrationImageAnalysis | null
): Partial<AvatarIllustrationRig> => {
  if (!landmarks || clamp01(finiteNumber(landmarks.confidence, 0)) < 0.55) {
    return {};
  }
  const leftEye = normalizedPoint(landmarks.leftEye);
  const rightEye = normalizedPoint(landmarks.rightEye);
  const mouth = normalizedPoint(landmarks.mouthCenter);
  if (!mouth || (!leftEye && !rightEye)) {
    return {};
  }
  const eyeLineY = averageNumbers([leftEye?.y, rightEye?.y]);
  if (eyeLineY === null) {
    return {};
  }
  const eyeCenterX = averageNumbers([leftEye?.x, rightEye?.x]) ?? mouth.x;
  const faceCenter = normalizedPoint(landmarks.faceCenter);
  const foregroundBounds = imageAnalysis?.foregroundBounds;
  const topLimit = foregroundBounds?.top ?? 0;
  const bottomLimit = foregroundBounds?.bottom ?? 1;
  const eyeMouthGap = Math.max(0.08, mouth.y - eyeLineY);
  const measuredHairLineY = normalizedY(landmarks.hairLineY);
  const measuredShoulderLineY = normalizedY(landmarks.shoulderLineY);
  const hairLineY = Math.min(
    measuredHairLineY ?? clampRange(eyeLineY - eyeMouthGap * 0.85, topLimit, eyeLineY - 0.03),
    eyeLineY - 0.03
  );
  const mouthLineY = Math.max(mouth.y, eyeLineY + 0.11);
  const shoulderLineY = Math.max(
    measuredShoulderLineY ?? clampRange(mouthLineY + eyeMouthGap * 1.45, mouthLineY + 0.12, bottomLimit),
    mouthLineY + 0.12
  );
  const inferredFaceCenterY = faceCenter?.y ?? clampRange(eyeLineY + eyeMouthGap * 0.42, topLimit + 0.08, bottomLimit - 0.08);
  const lowerFaceReach = Math.max(mouthLineY - hairLineY, eyeMouthGap * 1.6);
  const faceRange = clampRange(lowerFaceReach * 1.15, 0.22, 0.64);
  const confidence = clamp01(finiteNumber(landmarks.confidence, 0));
  return {
    faceCenterX: faceCenter?.x ?? eyeCenterX,
    faceCenterY: inferredFaceCenterY,
    faceRange,
    hairLineY,
    shoulderLineY,
    leftEyeX: leftEye?.x ?? clampRange(eyeCenterX - 0.08, 0.05, 0.95),
    rightEyeX: rightEye?.x ?? clampRange(eyeCenterX + 0.08, 0.05, 0.95),
    eyeLineY,
    mouthCenterX: mouth.x,
    mouthLineY,
    sliceCount: confidence >= 0.82 ? 36 : 32
  };
};

const normalizedPoint = (point: AvatarIllustrationLandmarkPoint | null | undefined): AvatarIllustrationLandmarkPoint | null => {
  if (!point) {
    return null;
  }
  const y = normalizedY(point.y);
  const confidence = point.confidence === undefined ? 1 : clamp01(finiteNumber(point.confidence, 0));
  return y === null || confidence < 0.35 ? null : { x: clamp01(finiteNumber(point.x, 0.5)), y, confidence };
};

const normalizedY = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;

const averageNumbers = (values: Array<number | null | undefined>): number | null => {
  const finiteValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (finiteValues.length === 0) {
    return null;
  }
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
};

interface AvatarIllustrationPixelFeatureCandidate {
  x: number;
  y: number;
  weight: number;
}

interface AvatarIllustrationFeatureLine {
  y: number;
  weight: number;
  candidates: AvatarIllustrationPixelFeatureCandidate[];
}

const normalizeAvatarIllustrationForegroundBounds = (
  bounds: AvatarIllustrationForegroundBounds | null | undefined
): AvatarIllustrationForegroundBounds | null => {
  if (!bounds) {
    return null;
  }
  const left = clamp01(finiteNumber(bounds.left, 0));
  const right = clamp01(finiteNumber(bounds.right, 1));
  const top = clamp01(finiteNumber(bounds.top, 0));
  const bottom = clamp01(finiteNumber(bounds.bottom, 1));
  if (right <= left || bottom <= top) {
    return null;
  }
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top
  };
};

const createRgbSaturation = (red: number, green: number, blue: number): number => {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  return max <= 0 ? 0 : clamp01((max - min) / max);
};

const findAvatarIllustrationFeatureLine = (
  candidates: AvatarIllustrationPixelFeatureCandidate[],
  minY: number,
  maxY: number,
  imageHeight: number,
  sampleStep: number
): AvatarIllustrationFeatureLine | null => {
  const rows = new Map<number, { y: number; weight: number; count: number }>();
  for (const candidate of candidates) {
    if (candidate.y < minY || candidate.y > maxY) {
      continue;
    }
    const rowKey = Math.round((candidate.y * imageHeight) / Math.max(1, sampleStep));
    const row = rows.get(rowKey) ?? { y: candidate.y, weight: 0, count: 0 };
    row.y = (row.y * row.count + candidate.y) / (row.count + 1);
    row.weight += candidate.weight;
    row.count += 1;
    rows.set(rowKey, row);
  }
  if (rows.size === 0) {
    return null;
  }
  const sortedRows = [...rows.values()].sort((left, right) => right.weight - left.weight);
  const peak = sortedRows[0];
  const searchedRowCount = Math.max(1, Math.ceil(((maxY - minY) * imageHeight) / Math.max(1, sampleStep)));
  const averageWeight = sortedRows.reduce((sum, row) => sum + row.weight, 0) / searchedRowCount;
  if (!peak || peak.count < 2 || peak.weight < averageWeight * 1.45) {
    return null;
  }
  const band = Math.max(0.012, (sampleStep / Math.max(imageHeight, 1)) * 2.5);
  const lineCandidates = candidates.filter((candidate) => Math.abs(candidate.y - peak.y) <= band);
  const lineWeight = lineCandidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (lineCandidates.length < 2 || lineWeight <= 0) {
    return null;
  }
  return {
    y: lineCandidates.reduce((sum, candidate) => sum + candidate.y * candidate.weight, 0) / lineWeight,
    weight: lineWeight,
    candidates: lineCandidates
  };
};

const createFeaturePoint = (
  candidates: AvatarIllustrationPixelFeatureCandidate[]
): AvatarIllustrationLandmarkPoint | null => {
  const weight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (candidates.length === 0 || weight <= 0) {
    return null;
  }
  return {
    x: clamp01(candidates.reduce((sum, candidate) => sum + candidate.x * candidate.weight, 0) / weight),
    y: clamp01(candidates.reduce((sum, candidate) => sum + candidate.y * candidate.weight, 0) / weight),
    confidence: clamp01(0.55 + Math.min(0.4, weight / 18))
  };
};

interface NormalizedDetectorFace {
  boundingBox: AvatarIllustrationDetectorFace["boundingBox"];
  confidence: number;
  landmarks: AvatarIllustrationDetectorLandmark[];
  area: number;
}

const normalizeDetectorFace = (
  face: AvatarIllustrationDetectorFace,
  frameWidth: number,
  frameHeight: number
): NormalizedDetectorFace | null => {
  const x = finiteNumber(face.boundingBox.x, Number.NaN) / frameWidth;
  const y = finiteNumber(face.boundingBox.y, Number.NaN) / frameHeight;
  const width = finiteNumber(face.boundingBox.width, Number.NaN) / frameWidth;
  const height = finiteNumber(face.boundingBox.height, Number.NaN) / frameHeight;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }
  const left = clamp01(x);
  const top = clamp01(y);
  const right = clamp01(x + width);
  const bottom = clamp01(y + height);
  const boundingBox = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
  if (boundingBox.width <= 0 || boundingBox.height <= 0) {
    return null;
  }
  return {
    boundingBox,
    confidence: clamp01(finiteNumber(face.confidence, 0.74)),
    landmarks: (face.landmarks ?? []).map((landmark) => ({
      type: landmark.type,
      confidence: landmark.confidence,
      locations: landmark.locations
        .map((point) => ({
          x: finiteNumber(point.x, Number.NaN) / frameWidth,
          y: finiteNumber(point.y, Number.NaN) / frameHeight,
          confidence: point.confidence
        }))
        .filter((point) => normalizedPoint(point) !== null)
    })),
    area: boundingBox.width * boundingBox.height
  };
};

const averageLandmarkLocations = (
  locations: AvatarIllustrationLandmarkPoint[],
  confidence: number | undefined
): AvatarIllustrationLandmarkPoint | null => {
  const points = locations
    .map((point) => normalizedPoint(point))
    .filter((point): point is AvatarIllustrationLandmarkPoint => point !== null);
  if (points.length === 0) {
    return null;
  }
  return {
    x: averageNumbers(points.map((point) => point.x)) ?? 0.5,
    y: averageNumbers(points.map((point) => point.y)) ?? 0.5,
    confidence: clamp01(finiteNumber(confidence, averageNumbers(points.map((point) => point.confidence)) ?? 0.72))
  };
};

const inferAvatarIllustrationRigFromImageAnalysis = (
  analysis: AvatarIllustrationImageAnalysis | null
): Partial<AvatarIllustrationRig> => {
  const bounds = analysis?.foregroundBounds;
  if (!bounds || analysis.confidence < 0.25 || bounds.height < 0.18 || bounds.width < 0.08) {
    return {};
  }
  if (bounds.width > 0.96 && bounds.height > 0.96 && analysis.foregroundCoverage > 0.9) {
    return {};
  }
  const foregroundAspectRatio = bounds.width / Math.max(bounds.height, 0.01);
  const fullBody = foregroundAspectRatio < 0.46 || bounds.height > 0.78;
  const closeUp = foregroundAspectRatio > 1.15 || bounds.height < 0.38;
  const preset = fullBody
    ? {
        faceCenterY: 0.32,
        faceRange: 0.24,
        hairLineY: 0.23,
        shoulderLineY: 0.54,
        eyeLineY: 0.28,
        mouthLineY: 0.39,
        sliceCount: 32
      }
    : closeUp
      ? {
          faceCenterY: 0.46,
          faceRange: 0.48,
          hairLineY: 0.26,
          shoulderLineY: 0.82,
          eyeLineY: 0.4,
          mouthLineY: 0.58,
          sliceCount: 24
        }
      : {
          faceCenterY: 0.39,
          faceRange: 0.34,
          hairLineY: 0.31,
          shoulderLineY: 0.63,
          eyeLineY: 0.34,
          mouthLineY: 0.49,
          sliceCount: 28
        };
  const mapY = (value: number) => bounds.top + value * bounds.height;
  const centerX = bounds.left + bounds.width / 2;
  const eyeHalfSpread = Math.max(0.06, Math.min(0.14, bounds.width * 0.18));
  return {
    faceCenterX: centerX,
    faceCenterY: mapY(preset.faceCenterY),
    faceRange: preset.faceRange * bounds.height,
    hairLineY: mapY(preset.hairLineY),
    shoulderLineY: mapY(preset.shoulderLineY),
    leftEyeX: clampRange(centerX - eyeHalfSpread, 0.05, 0.95),
    rightEyeX: clampRange(centerX + eyeHalfSpread, 0.05, 0.95),
    eyeLineY: mapY(preset.eyeLineY),
    mouthCenterX: centerX,
    mouthLineY: mapY(preset.mouthLineY),
    sliceCount: analysis.confidence >= 0.65 ? preset.sliceCount : Math.max(20, preset.sliceCount - 4)
  };
};

export const defaultTransform = (overrides: Partial<Transform> = {}): Transform =>
  clampTransform({
    x: 0.05,
    y: 0.05,
    width: 0.3,
    height: 0.3,
    rotation: 0,
    opacity: 1,
    ...overrides
  });

export const createDefaultScene = (): SceneDocument => {
  const canvas = {
    width: 1920,
    height: 1080,
    fps: 30
  };
  const avatarTransform = defaultTransform({ x: 0.67, y: 0.44, width: 0.26, height: 0.45 });

  return {
    version: 1,
    id: "scene-main",
    name: "Main Scene",
    quickTextOverlayDeckInput: defaultQuickTextOverlayDeckInput,
    canvas,
    sources: [
    {
      id: "source-background",
      kind: "solid",
      name: "Background",
      visible: true,
      locked: true,
      blendMode: "normal",
      color: "#101015",
      transform: defaultTransform({ x: 0, y: 0, width: 1, height: 1 })
    },
    {
      id: "source-screen",
      kind: "screen",
      name: "Screen Capture",
      visible: true,
      locked: true,
      blendMode: "normal",
      captureMode: "android-media-projection",
      transform: defaultTransform({ x: 0, y: 0, width: 1, height: 1 })
    },
    {
      id: "source-avatar",
      kind: "pngtuber",
      name: "PNGTuber",
      visible: true,
      locked: false,
      blendMode: "normal",
      avatarId: "default-pngtuber",
      imageUri: "",
      illustrationRig: inferAvatarIllustrationRig({ canvas, transform: avatarTransform }),
      expression: "neutral",
      mouthOpen: 0.18,
      blink: 0,
      motion: defaultAvatarMotion(),
      transform: avatarTransform
    },
    {
      id: "source-label",
      kind: "text",
      name: "Stream Label",
      visible: true,
      locked: false,
      blendMode: "normal",
      text: "MobileLiveCaster",
      mode: "label",
      contentSource: "manual",
      align: "left",
      showCaptionSpeaker: true,
      visibilityMode: "always",
      timerMode: "none",
      countdownTargetMs: 0,
      timerCompleteText: defaultCountdownCompleteText,
      displayDurationMs: textOverlayDefaultDisplayDurationMs,
      activatedAtMs: 0,
      color: "#f8fafc",
      fontSize: 44,
      backgroundColor: "#000000",
      backgroundOpacity: 0,
      outlineColor: "#000000",
      outlineWidth: 3,
      maxLines: 1,
      transform: defaultTransform({ x: 0.04, y: 0.05, width: 0.55, height: 0.14 })
    },
    {
      id: "source-subtitle",
      kind: "text",
      name: "Subtitle",
      visible: true,
      locked: false,
      blendMode: "normal",
      text: "字幕テキスト",
      mode: "subtitle",
      contentSource: "manual",
      align: "center",
      showCaptionSpeaker: true,
      visibilityMode: "always",
      timerMode: "none",
      countdownTargetMs: 0,
      timerCompleteText: defaultCountdownCompleteText,
      displayDurationMs: textOverlayDefaultDisplayDurationMs,
      activatedAtMs: 0,
      color: "#f8fafc",
      fontSize: 54,
      backgroundColor: "#000000",
      backgroundOpacity: 0.46,
      outlineColor: "#000000",
      outlineWidth: 5,
      maxLines: 2,
      transform: defaultTransform({ x: 0.16, y: 0.77, width: 0.68, height: 0.16 })
    },
    {
      id: "source-chat",
      kind: "chat",
      name: "Chat Overlay",
      visible: true,
      locked: false,
      blendMode: "normal",
      maxMessages: 4,
      maxMessageLength: 160,
      showAuthor: true,
      redactUrls: true,
      color: "#f8fafc",
      fontSize: 34,
      backgroundColor: "#000000",
      backgroundOpacity: 0,
      transform: defaultTransform({ x: 0.04, y: 0.64, width: 0.48, height: 0.28 })
    }
  ]
  };
};

export const privacyShieldSceneId = "scene-privacy-shield";

const templateLabels: Record<SceneTemplateId, string> = {
  main: "Main Scene",
  "starting-soon": "Starting Soon",
  break: "Break",
  "privacy-shield": "Privacy Shield"
};

export const sceneTemplateIds: readonly SceneTemplateId[] = ["main", "starting-soon", "break", "privacy-shield"];

const defaultSource = <Kind extends SourceKind>(kind: Kind): Extract<SceneSource, { kind: Kind }> => {
  const source = createDefaultScene().sources.find((item): item is Extract<SceneSource, { kind: Kind }> => item.kind === kind);
  if (!source) {
    throw new Error(`Missing default ${kind} source.`);
  }
  return source;
};

export const createSceneFromTemplate = (templateId: SceneTemplateId): SceneDocument => {
  if (templateId === "main") {
    return createDefaultScene();
  }

  const canvas = createDefaultScene().canvas;
  const background = defaultSource("solid");
  const label = defaultSource("text");
  const avatar = defaultSource("pngtuber");
  const chat = defaultSource("chat");
  const isBreak = templateId === "break";

  if (templateId === "privacy-shield") {
    return {
      version: 1,
      id: privacyShieldSceneId,
      name: templateLabels[templateId],
      quickTextOverlayDeckInput: defaultQuickTextOverlayDeckInput,
      canvas,
      sources: [
        {
          ...background,
          id: "source-privacy-shield-background",
          name: "Privacy Background",
          color: "#050506",
          transform: defaultTransform({ x: 0, y: 0, width: 1, height: 1 })
        },
        {
          ...label,
          id: "source-privacy-shield-label",
          name: "Privacy Label",
          text: "Privacy Shield",
          mode: "label",
          align: "center",
          color: "#f8fafc",
          fontSize: 72,
          backgroundOpacity: 0,
          maxLines: 1,
          transform: defaultTransform({ x: 0.16, y: 0.38, width: 0.68, height: 0.16 })
        }
      ]
    };
  }

  return {
    version: 1,
    id: `scene-${templateId}`,
    name: templateLabels[templateId],
    quickTextOverlayDeckInput: defaultQuickTextOverlayDeckInput,
    canvas,
    sources: [
      {
        ...background,
        id: `source-${templateId}-background`,
        name: isBreak ? "Break Background" : "Waiting Background",
        color: isBreak ? "#15151c" : "#0f172a"
      },
      {
        ...label,
        id: `source-${templateId}-label`,
        name: isBreak ? "Break Label" : "Waiting Label",
        text: isBreak ? "Be right back" : "Starting soon",
        mode: "label",
        align: "center",
        fontSize: isBreak ? 70 : 76,
        backgroundOpacity: 0,
        maxLines: 1,
        transform: defaultTransform({ x: 0.08, y: 0.18, width: 0.72, height: 0.18 })
      },
      {
        ...avatar,
        id: `source-${templateId}-avatar`,
        name: "PNGTuber",
        transform: defaultTransform({ x: 0.68, y: 0.42, width: 0.24, height: 0.46 })
      },
      {
        ...chat,
        id: `source-${templateId}-chat`,
        name: "Chat Overlay",
        maxMessages: 5,
        transform: defaultTransform({ x: 0.08, y: 0.58, width: 0.44, height: 0.3 })
      }
    ]
  };
};

export const createDefaultSceneCollection = (): SceneCollection => ({
  version: 1,
  activeSceneId: "scene-main",
  transition: defaultSceneTransitionSettings(),
  scenes: sceneTemplateIds.map(createSceneFromTemplate)
});

export const createSource = (kind: SourceKind): SceneSource => {
  const base: BaseSource = {
    id: makeId(`source-${kind}`),
    kind,
    name:
      kind === "pngtuber"
        ? "PNGTuber"
        : kind === "live2d"
          ? "Live2D"
          : kind === "vrm"
            ? "VRM"
            : kind === "chat"
              ? "Chat Overlay"
              : `${kind} source`,
    visible: true,
    locked: false,
    blendMode: "normal",
    transform: defaultTransform({ x: 0.12, y: 0.12, width: 0.32, height: 0.24 })
  };

  switch (kind) {
    case "screen":
      return { ...base, kind, captureMode: "android-media-projection" };
    case "pngtuber":
      return {
        ...base,
        kind,
        avatarId: "default-pngtuber",
        imageUri: "",
        illustrationRig: inferAvatarIllustrationRig({ transform: base.transform }),
        expression: "neutral",
        mouthOpen: 0,
        blink: 0,
        motion: defaultAvatarMotion()
      };
    case "live2d":
      return {
        ...base,
        kind,
        modelId: "default-live2d",
        modelJsonUri: "",
        expression: "neutral",
        mouthOpen: 0,
        blink: 0,
        motion: defaultAvatarMotion()
      };
    case "vrm":
      return {
        ...base,
        kind,
        modelId: "default-vrm",
        modelUri: "",
        expression: "neutral",
        mouthOpen: 0,
        blink: 0,
        motion: defaultAvatarMotion()
      };
    case "image":
      return { ...base, kind, uri: "" };
    case "solid":
      return { ...base, kind, color: "#27272a" };
    case "text":
      return {
        ...base,
        kind,
        text: "Text",
        mode: "label",
        contentSource: "manual",
        align: "center",
        showCaptionSpeaker: true,
        visibilityMode: "always",
        timerMode: "none",
        countdownTargetMs: 0,
        timerCompleteText: defaultCountdownCompleteText,
        displayDurationMs: textOverlayDefaultDisplayDurationMs,
        activatedAtMs: 0,
        color: "#f8fafc",
        fontSize: 36,
        backgroundColor: "#000000",
        backgroundOpacity: 0,
        outlineColor: "#000000",
        outlineWidth: 3,
        maxLines: 1
      };
    case "chat":
      return {
        ...base,
        kind,
        maxMessages: 4,
        maxMessageLength: 160,
        showAuthor: true,
        redactUrls: true,
        color: "#f8fafc",
        fontSize: 34,
        backgroundColor: "#000000",
        backgroundOpacity: 0,
        transform: defaultTransform({ x: 0.04, y: 0.64, width: 0.48, height: 0.28 })
      };
  }
};

export const createTextOverlayPresetSource = (presetId: TextOverlayPresetId): TextSource => {
  const base = createSource("text") as TextSource;
  switch (presetId) {
    case "title":
      return {
        ...base,
        name: "Title Text",
        text: "配信タイトル",
        mode: "label",
        contentSource: "manual",
        align: "center",
        showCaptionSpeaker: true,
        fontSize: 64,
        backgroundColor: "#000000",
        backgroundOpacity: 0,
        outlineColor: "#000000",
        outlineWidth: 5,
        maxLines: 1,
        transform: defaultTransform({ x: 0.12, y: 0.05, width: 0.76, height: 0.14 })
      };
    case "subtitle":
      return {
        ...base,
        name: "Subtitle",
        text: "字幕テキスト",
        mode: "subtitle",
        contentSource: "manual",
        align: "center",
        showCaptionSpeaker: true,
        fontSize: 54,
        backgroundColor: "#000000",
        backgroundOpacity: 0.46,
        outlineColor: "#000000",
        outlineWidth: 5,
        maxLines: 2,
        transform: defaultTransform({ x: 0.16, y: 0.77, width: 0.68, height: 0.16 })
      };
    case "lower-third":
      return {
        ...base,
        name: "Lower Third",
        text: "配信タイトル / 告知テキスト",
        mode: "label",
        contentSource: "manual",
        align: "left",
        showCaptionSpeaker: true,
        fontSize: 44,
        backgroundColor: "#000000",
        backgroundOpacity: 0.36,
        outlineColor: "#000000",
        outlineWidth: 4,
        maxLines: 2,
        transform: defaultTransform({ x: 0.05, y: 0.72, width: 0.52, height: 0.18 })
      };
    case "notice":
      return {
        ...base,
        name: "Center Notice",
        text: "少しお待ちください",
        mode: "label",
        contentSource: "manual",
        align: "center",
        showCaptionSpeaker: true,
        fontSize: 58,
        backgroundColor: "#000000",
        backgroundOpacity: 0.44,
        outlineColor: "#000000",
        outlineWidth: 5,
        maxLines: 2,
        transform: defaultTransform({ x: 0.18, y: 0.4, width: 0.64, height: 0.18 })
      };
    case "ticker":
      return {
        ...base,
        name: "Ticker",
        text: "お知らせ: チャンネル登録と高評価お願いします",
        mode: "ticker",
        contentSource: "manual",
        align: "left",
        showCaptionSpeaker: true,
        fontSize: 38,
        backgroundColor: "#000000",
        backgroundOpacity: 0.52,
        outlineColor: "#000000",
        outlineWidth: 3,
        maxLines: 1,
        transform: defaultTransform({ x: 0, y: 0.91, width: 1, height: 0.09 })
      };
    case "badge":
      return {
        ...base,
        name: "Corner Badge",
        text: "LIVE",
        mode: "label",
        contentSource: "manual",
        align: "center",
        showCaptionSpeaker: true,
        color: "#ffffff",
        fontSize: 38,
        backgroundColor: "#dc2626",
        backgroundOpacity: 0.78,
        outlineColor: "#7f1d1d",
        outlineWidth: 2,
        maxLines: 1,
        transform: defaultTransform({ x: 0.79, y: 0.06, width: 0.16, height: 0.08 })
      };
    case "starting-soon-countdown":
      return {
        ...base,
        name: "Starting Soon Countdown",
        text: defaultCountdownPrefixText,
        mode: "label",
        contentSource: "manual",
        align: "center",
        showCaptionSpeaker: true,
        timerMode: "countdown",
        countdownTargetMs: Date.now() + 5 * 60 * 1000,
        timerCompleteText: defaultCountdownCompleteText,
        color: "#f8fafc",
        fontSize: 70,
        backgroundColor: "#020617",
        backgroundOpacity: 0.48,
        outlineColor: "#000000",
        outlineWidth: 5,
        maxLines: 1,
        transform: defaultTransform({ x: 0.16, y: 0.34, width: 0.68, height: 0.16 })
      };
    case "uptime-badge":
      return {
        ...base,
        name: "Uptime Badge",
        text: defaultUptimePrefixText,
        mode: "label",
        contentSource: "manual",
        align: "center",
        showCaptionSpeaker: true,
        timerMode: "uptime",
        countdownTargetMs: 0,
        timerCompleteText: defaultCountdownCompleteText,
        activatedAtMs: Date.now(),
        color: "#ffffff",
        fontSize: 36,
        backgroundColor: "#0f766e",
        backgroundOpacity: 0.82,
        outlineColor: "#042f2e",
        outlineWidth: 2,
        maxLines: 1,
        transform: defaultTransform({ x: 0.74, y: 0.16, width: 0.21, height: 0.08 })
      };
    case "live-caption":
      return {
        ...base,
        name: "Live Captions",
        text: "Live captions",
        mode: "caption",
        contentSource: "runtime-caption",
        align: "center",
        showCaptionSpeaker: false,
        fontSize: 48,
        backgroundColor: "#000000",
        backgroundOpacity: 0.42,
        outlineColor: "#000000",
        outlineWidth: 4,
        maxLines: 3,
        transform: defaultTransform({ x: 0.14, y: 0.72, width: 0.72, height: 0.2 })
      };
  }
};

export const applyTextOverlayPresetStyle = (source: TextSource, presetId: TextOverlayPresetId): TextSource => {
  const preset = createTextOverlayPresetSource(presetId);
  const shouldKeepCurrentText =
    source.text.trim().length > 0 && (source.timerMode ?? "none") === (preset.timerMode ?? "none");
  return {
    ...preset,
    id: source.id,
    visible: source.visible,
    locked: source.locked,
    blendMode: source.blendMode,
    visibilityMode: source.visibilityMode,
    displayDurationMs: source.displayDurationMs,
    activatedAtMs: source.activatedAtMs,
    text: shouldKeepCurrentText ? source.text : preset.text
  };
};

export const createSubtitleTextSource = (): TextSource => createTextOverlayPresetSource("subtitle");

export const createLiveCaptionTextSource = (): TextSource => createTextOverlayPresetSource("live-caption");

export const showTimedTextOverlay = (
  scene: SceneDocument,
  request: TimedTextOverlayRequest
): SceneDocument => {
  const text = serializeTextOverlayLines(request.text, 4).join("\n");
  if (!text) {
    return scene;
  }

  const nowMs = Math.max(0, Math.round(finiteNumber(request.nowMs, Date.now())));
  const displayDurationMs = normalizeTextOverlayDisplayDurationMs(request.durationMs);
  const requestedSource = request.sourceId
    ? scene.sources.find((source): source is TextSource => source.kind === "text" && source.id === request.sourceId)
    : null;
  const existingQuickSubtitle = scene.sources.find(
    (source): source is TextSource =>
      source.kind === "text" &&
      source.contentSource === "manual" &&
      source.name.trim().toLowerCase() === quickSubtitleSourceName.toLowerCase()
  );
  const targetSource = requestedSource?.contentSource === "manual" ? requestedSource : existingQuickSubtitle;

  if (targetSource) {
    return updateSource(scene, targetSource.id, (source) =>
      source.kind === "text"
        ? {
            ...(request.presetId ? applyTextOverlayPresetStyle(source, request.presetId) : source),
            name: source.name,
            text,
            contentSource: "manual",
            visible: true,
            visibilityMode: "timed",
            displayDurationMs,
            activatedAtMs: nowMs
          }
        : source
    );
  }

  const source: TextSource = {
    ...createTextOverlayPresetSource(request.presetId ?? "subtitle"),
    id: makeId("source-quick-subtitle"),
    name: quickSubtitleSourceName,
    text,
    visible: true,
    contentSource: "manual",
    visibilityMode: "timed" as const,
    displayDurationMs,
    activatedAtMs: nowMs
  };

  return addSource(scene, source);
};

export const selectQuickTextOverlayPreset = (presetId: string): QuickTextOverlayPreset | null =>
  quickTextOverlayPresets.find((preset) => preset.id === presetId) ?? null;

export const showQuickTextOverlayPreset = (
  scene: SceneDocument,
  presetId: QuickTextOverlayPresetId,
  request: Omit<Partial<TimedTextOverlayRequest>, "text" | "presetId"> = {}
): SceneDocument => {
  const preset = selectQuickTextOverlayPreset(presetId);
  if (!preset) {
    return scene;
  }

  return showTimedTextOverlay(scene, {
    ...request,
    text: preset.text,
    presetId: preset.presetId,
    durationMs: request.durationMs ?? preset.durationMs
  });
};

export const queueTimedTextOverlay = (
  scene: SceneDocument,
  request: TimedTextOverlayRequest
): SceneDocument => {
  const text = serializeTextOverlayLines(request.text, 4).join("\n");
  if (!text) {
    return scene;
  }

  const nowMs = Math.max(0, Math.round(finiteNumber(request.nowMs, Date.now())));
  const displayDurationMs = normalizeTextOverlayDisplayDurationMs(request.durationMs);
  const requestedSource = request.sourceId
    ? scene.sources.find((source): source is TextSource => source.kind === "text" && source.id === request.sourceId)
    : null;
  const baseSource =
    requestedSource?.contentSource === "manual"
      ? request.presetId
        ? applyTextOverlayPresetStyle(requestedSource, request.presetId)
        : requestedSource
      : createTextOverlayPresetSource(request.presetId ?? "subtitle");
  const activatedAtMs = selectNextQueuedTextOverlayStartMs(scene, nowMs);
  const source: TextSource = {
    ...baseSource,
    id: makeId("source-queued-subtitle"),
    name: queuedSubtitleSourceName,
    text,
    visible: true,
    locked: false,
    contentSource: "manual",
    visibilityMode: "timed",
    displayDurationMs,
    activatedAtMs
  };

  return addSource(scene, source);
};

export const queueQuickTextOverlayPreset = (
  scene: SceneDocument,
  presetId: QuickTextOverlayPresetId,
  request: Omit<Partial<TimedTextOverlayRequest>, "text" | "presetId"> = {}
): SceneDocument => {
  const preset = selectQuickTextOverlayPreset(presetId);
  if (!preset) {
    return scene;
  }

  return queueTimedTextOverlay(scene, {
    ...request,
    text: preset.text,
    presetId: preset.presetId,
    durationMs: request.durationMs ?? preset.durationMs
  });
};

export const showPersistentTextOverlay = (
  scene: SceneDocument,
  request: PersistentTextOverlayRequest
): SceneDocument => {
  const text = serializeTextOverlayLines(request.text, 4).join("\n");
  if (!text) {
    return scene;
  }

  const requestedSource = request.sourceId
    ? scene.sources.find((source): source is TextSource => source.kind === "text" && source.id === request.sourceId)
    : null;
  const existingPinnedText = scene.sources.find(
    (source): source is TextSource =>
      source.kind === "text" &&
      source.contentSource === "manual" &&
      source.name.trim().toLowerCase() === pinnedTextSourceName.toLowerCase()
  );
  const targetSource = requestedSource?.contentSource === "manual" ? requestedSource : existingPinnedText;

  if (targetSource) {
    return updateSource(scene, targetSource.id, (source) =>
      source.kind === "text"
        ? {
            ...(request.presetId ? applyTextOverlayPresetStyle(source, request.presetId) : source),
            name: source.name,
            text,
            contentSource: "manual",
            visible: true,
            visibilityMode: "always",
            activatedAtMs: Math.max(0, Math.round(finiteNumber(request.nowMs, 0)))
          }
        : source
    );
  }

  const source: TextSource = {
    ...createTextOverlayPresetSource(request.presetId ?? "subtitle"),
    id: makeId("source-pinned-text"),
    name: pinnedTextSourceName,
    text,
    visible: true,
    contentSource: "manual",
    visibilityMode: "always" as const,
    activatedAtMs: Math.max(0, Math.round(finiteNumber(request.nowMs, 0)))
  };

  return addSource(scene, source);
};

export const pinQuickTextOverlayPreset = (
  scene: SceneDocument,
  presetId: QuickTextOverlayPresetId,
  request: Omit<Partial<PersistentTextOverlayRequest>, "text" | "presetId"> = {}
): SceneDocument => {
  const preset = selectQuickTextOverlayPreset(presetId);
  if (!preset) {
    return scene;
  }

  return showPersistentTextOverlay(scene, {
    ...request,
    text: preset.text,
    presetId: preset.presetId
  });
};

export const applyQuickTextOverlayPreset = (
  scene: SceneDocument,
  presetId: QuickTextOverlayPresetId,
  action: QuickTextOverlayPresetAction,
  request: Omit<Partial<TimedTextOverlayRequest>, "text" | "presetId"> = {}
): SceneDocument => {
  switch (action) {
    case "queue":
      return queueQuickTextOverlayPreset(scene, presetId, request);
    case "pin":
      return pinQuickTextOverlayPreset(scene, presetId, request);
    case "show":
      return showQuickTextOverlayPreset(scene, presetId, request);
  }
};

export const applyQuickTextOverlayDeckCue = (
  scene: SceneDocument,
  cue: QuickTextOverlayDeckCue,
  action: QuickTextOverlayPresetAction,
  request: Omit<Partial<TimedTextOverlayRequest>, "text" | "presetId"> = {}
): SceneDocument => {
  switch (action) {
    case "queue":
      return queueTimedTextOverlay(scene, {
        ...request,
        text: cue.text,
        presetId: cue.presetId,
        durationMs: request.durationMs ?? cue.durationMs
      });
    case "pin":
      return showPersistentTextOverlay(scene, {
        sourceId: request.sourceId,
        nowMs: request.nowMs,
        text: cue.text,
        presetId: cue.presetId
      });
    case "show":
      return showTimedTextOverlay(scene, {
        ...request,
        text: cue.text,
        presetId: cue.presetId,
        durationMs: request.durationMs ?? cue.durationMs
      });
  }
};

export const updateQuickTextOverlayDeckInput = (scene: SceneDocument, input: string): SceneDocument => ({
  ...scene,
  quickTextOverlayDeckInput: normalizeQuickTextOverlayDeckInput(input)
});

export const hideTextOverlays = (
  scene: SceneDocument,
  request: HideTextOverlayRequest = {}
): SceneDocument => ({
  ...scene,
  sources: scene.sources.map((source) => {
    if (source.kind !== "text") {
      return source;
    }
    if (request.sourceId && source.id !== request.sourceId) {
      return source;
    }
    if (!request.includeRuntimeCaptions && source.contentSource !== "manual") {
      return source;
    }
    return {
      ...source,
      visible: false,
      activatedAtMs: 0
    };
  })
});

export const activateTimedTextSource = (
  scene: SceneDocument,
  sourceId: string,
  nowMs: number = Date.now()
): SceneDocument =>
  updateSource(scene, sourceId, (source) =>
    source.kind === "text"
      ? {
          ...source,
          visible: true,
          visibilityMode: "timed",
          activatedAtMs: Math.max(0, Math.round(nowMs))
        }
      : source
  );

export const selectLiveCaptionTextSource = (scene: SceneDocument): TextSource | null =>
  scene.sources.find(
    (source): source is TextSource =>
      source.kind === "text" && source.contentSource === "runtime-caption"
  ) ?? null;

export const ensureLiveCaptionTextSource = (scene: SceneDocument): SceneDocument => {
  const liveCaptionSource = selectLiveCaptionTextSource(scene);
  if (!liveCaptionSource) {
    return addSource(scene, createLiveCaptionTextSource());
  }
  if (liveCaptionSource.visible) {
    return scene;
  }
  return updateSource(scene, liveCaptionSource.id, (source) =>
    source.kind === "text" && source.contentSource === "runtime-caption" ? { ...source, visible: true } : source
  );
};

export const hideLiveCaptionTextSources = (scene: SceneDocument): SceneDocument => {
  if (!scene.sources.some((source) => source.kind === "text" && source.contentSource === "runtime-caption" && source.visible)) {
    return scene;
  }
  return {
    ...scene,
    sources: scene.sources.map((source) =>
      source.kind === "text" && source.contentSource === "runtime-caption" ? { ...source, visible: false } : source
    )
  };
};

export const syncLiveCaptionTextSourceForSettings = (
  scene: SceneDocument,
  settings: { enabled?: boolean } & Record<string, unknown>
): SceneDocument =>
  settings.enabled === true ? ensureLiveCaptionTextSource(scene) : settings.enabled === false ? hideLiveCaptionTextSources(scene) : scene;

export const createTextOverlayRuntimeStatus = (
  scene: SceneDocument,
  runtime: RenderGraphRuntime = {}
): TextOverlayRuntimeStatus => {
  const nowMs = Math.max(0, Math.round(finiteNumber(runtime.nowMs, Date.now())));
  const textSources = scene.sources.filter((source): source is TextSource => source.kind === "text");
  const visibleSources = textSources.filter((source) => source.visible);
  const activeSources = textSources.filter((source) => isRenderableSource(source, { ...runtime, nowMs }));
  const activeManualSources = activeSources.filter((source) => source.contentSource === "manual");
  const activeCaptionSources = activeSources.filter((source) => source.contentSource === "runtime-caption");
  const timedSources = visibleSources.filter((source) => source.visibilityMode === "timed");
  const queuedSources = timedSources.filter(
    (source) => source.contentSource === "manual" && isQueuedTextOverlaySource(source) && source.activatedAtMs > nowMs
  );
  const pinnedSources = activeManualSources.filter((source) => source.visibilityMode === "always");
  const activeTimedSources = activeSources.filter((source) => source.visibilityMode === "timed");
  const nextExpirationMs = activeTimedSources.reduce<number | null>((next, source) => {
    const expiresAt = source.activatedAtMs + source.displayDurationMs;
    if (expiresAt <= nowMs) {
      return next;
    }
    return next === null ? expiresAt : Math.min(next, expiresAt);
  }, null);
  const previewSource = selectTextOverlayRuntimePreviewSource(activeManualSources, activeCaptionSources);
  const previewText = previewSource ? resolveRuntimeTextOverlayPreview(previewSource, runtime) : "";
  const nextQueuedSource = selectNextQueuedTextOverlaySource(queuedSources);
  const nextQueuedStartMs = nextQueuedSource ? nextQueuedSource.activatedAtMs : null;
  const queuedPreviewText = nextQueuedSource ? resolveRuntimeTextOverlayPreview(nextQueuedSource, runtime) : "";

  return {
    sourceCount: textSources.length,
    visibleSourceCount: visibleSources.length,
    activeSourceCount: activeSources.length,
    activeManualSourceCount: activeManualSources.length,
    activeCaptionSourceCount: activeCaptionSources.length,
    timedSourceCount: timedSources.length,
    queuedSourceCount: queuedSources.length,
    pinnedSourceCount: pinnedSources.length,
    nextExpirationMs,
    remainingMs: nextExpirationMs === null ? 0 : Math.max(0, nextExpirationMs - nowMs),
    previewText,
    nextQueuedStartMs,
    nextQueuedRemainingMs: nextQueuedStartMs === null ? 0 : Math.max(0, nextQueuedStartMs - nowMs),
    queuedPreviewText
  };
};

const selectTextOverlayRuntimePreviewSource = (
  activeManualSources: TextSource[],
  activeCaptionSources: TextSource[]
): TextSource | null =>
  [...activeManualSources].sort(compareTextOverlayPreviewPriority)[0] ?? activeCaptionSources[0] ?? null;

const compareTextOverlayPreviewPriority = (left: TextSource, right: TextSource): number => {
  const rightActivatedAtMs = Math.max(0, Math.round(finiteNumber(right.activatedAtMs, 0)));
  const leftActivatedAtMs = Math.max(0, Math.round(finiteNumber(left.activatedAtMs, 0)));
  if (rightActivatedAtMs !== leftActivatedAtMs) {
    return rightActivatedAtMs - leftActivatedAtMs;
  }
  const rightTimedPriority = right.visibilityMode === "timed" ? 1 : 0;
  const leftTimedPriority = left.visibilityMode === "timed" ? 1 : 0;
  return rightTimedPriority - leftTimedPriority;
};

const selectNextQueuedTextOverlaySource = (queuedSources: TextSource[]): TextSource | null =>
  [...queuedSources].sort((left, right) => left.activatedAtMs - right.activatedAtMs)[0] ?? null;

export const normalizeSceneDocument = (value: unknown): SceneDocument => {
  const fallback = createDefaultScene();
  if (!isRecord(value)) {
    return fallback;
  }

  const canvas = normalizeCanvas(value.canvas, fallback.canvas);
  const sources = Array.isArray(value.sources)
    ? value.sources.flatMap((source) => {
        const normalized = normalizeSceneSource(source, canvas);
        return normalized ? [normalized] : [];
      })
    : fallback.sources;
  const uniqueSources = ensureUniqueSceneSourceIds(sources);

  return {
    version: 1,
    id: stringValue(value.id, fallback.id),
    name: stringValue(value.name, fallback.name),
    quickTextOverlayDeckInput: normalizeQuickTextOverlayDeckInput(
      value.quickTextOverlayDeckInput,
      fallback.quickTextOverlayDeckInput ?? defaultQuickTextOverlayDeckInput
    ),
    canvas,
    sources: uniqueSources.length > 0 ? uniqueSources : fallback.sources
  };
};

export const normalizeSceneCollection = (value: unknown): SceneCollection => {
  if (!isRecord(value)) {
    return createDefaultSceneCollection();
  }

  if (!Array.isArray(value.scenes) && Array.isArray(value.sources)) {
    const scene = normalizeSceneDocument(value);
    return {
      version: 1,
      activeSceneId: scene.id,
      transition: defaultSceneTransitionSettings(),
      scenes: [scene]
    };
  }

  const rawScenes = Array.isArray(value.scenes) ? value.scenes : [];
  const scenes = ensureUniqueSceneIds(rawScenes.map(normalizeSceneDocument));
  if (scenes.length === 0) {
    return createDefaultSceneCollection();
  }

  const activeSceneId = scenes.some((scene) => scene.id === value.activeSceneId)
    ? String(value.activeSceneId)
    : scenes[0].id;

  return {
    version: 1,
    activeSceneId,
    transition: normalizeSceneTransitionSettings(value.transition),
    scenes
  };
};

export const stripTransientSceneRuntime = (scene: SceneDocument): SceneDocument => ({
  ...scene,
  sources: scene.sources.filter((source) => !isQueuedTextOverlaySource(source)).map((source) => {
    if (source.kind === "text") {
      return source.activatedAtMs > 0 ? { ...source, activatedAtMs: 0 } : source;
    }
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

export const stripTransientSceneCollectionRuntime = (collection: SceneCollection): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  return {
    ...normalized,
    scenes: normalized.scenes.map(stripTransientSceneRuntime)
  };
};

export const selectActiveScene = (collection: SceneCollection): SceneDocument =>
  collection.scenes.find((scene) => scene.id === collection.activeSceneId) ?? collection.scenes[0] ?? createDefaultScene();

export const setActiveScene = (collection: SceneCollection, sceneId: string): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  if (!normalized.scenes.some((scene) => scene.id === sceneId)) {
    return normalized;
  }
  return {
    ...normalized,
    activeSceneId: sceneId
  };
};

export const activatePrivacyShieldScene = (collection: SceneCollection): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  const shieldSceneId =
    normalized.scenes.find((scene) => scene.id === privacyShieldSceneId)?.id ??
    normalized.scenes.find((scene) => scene.name.trim().toLowerCase() === "privacy shield")?.id;

  if (shieldSceneId) {
    return setActiveScene(normalized, shieldSceneId);
  }

  return addSceneToCollection(normalized, createSceneFromTemplate("privacy-shield"));
};

export const updateSceneTransition = (
  collection: SceneCollection,
  settings: Partial<SceneTransitionSettings>
): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  return {
    ...normalized,
    transition: defaultSceneTransitionSettings({
      ...normalized.transition,
      ...settings
    })
  };
};

export const updateActiveScene = (collection: SceneCollection, scene: SceneDocument): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  const nextScene = normalizeSceneDocument(scene);
  const activeIndex = normalized.scenes.findIndex((current) => current.id === normalized.activeSceneId);
  const replaceIndex = activeIndex >= 0 ? activeIndex : 0;
  const scenes = normalized.scenes.map((current, index) => (index === replaceIndex ? nextScene : current));
  const uniqueScenes = ensureUniqueSceneIds(scenes);
  const activeSceneId = uniqueScenes[replaceIndex]?.id ?? uniqueScenes[0]?.id ?? createDefaultScene().id;
  return {
    ...normalized,
    activeSceneId,
    scenes: uniqueScenes.length > 0 ? uniqueScenes : [createDefaultScene()]
  };
};

export const addSceneToCollection = (collection: SceneCollection, scene: SceneDocument): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  const nextScene = createUniqueScene(normalizeSceneDocument(scene), new Set(normalized.scenes.map((candidate) => candidate.id)));
  return {
    version: 1,
    activeSceneId: nextScene.id,
    transition: normalized.transition,
    scenes: [...normalized.scenes, nextScene]
  };
};

export const duplicateActiveScene = (collection: SceneCollection): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  const activeScene = selectActiveScene(normalized);
  const strippedActiveScene = stripTransientSceneRuntime(activeScene);
  const duplicate = {
    ...strippedActiveScene,
    id: makeId("scene"),
    name: `${activeScene.name} Copy`,
    sources: strippedActiveScene.sources.map((source) => ({
      ...source,
      id: makeId(`source-${source.kind}`)
    }))
  };
  return addSceneToCollection(normalized, duplicate);
};

export const addSource = (scene: SceneDocument, source: SceneSource): SceneDocument => ({
  ...scene,
  sources: [...scene.sources, source]
});

export const updateSource = (
  scene: SceneDocument,
  sourceId: string,
  update: (source: SceneSource) => SceneSource
): SceneDocument => ({
  ...scene,
  sources: scene.sources.map((source) => (source.id === sourceId ? update(source) : source))
});

export const updateTransform = (
  scene: SceneDocument,
  sourceId: string,
  transform: Partial<Transform>
): SceneDocument =>
  updateSource(scene, sourceId, (source) => ({
    ...source,
    transform: clampTransform({ ...source.transform, ...transform })
  }));

export const applyInferredAvatarIllustrationRig = (
  scene: SceneDocument,
  sourceId: string,
  overrides: Partial<AvatarIllustrationRig> = {},
  input: Pick<AvatarIllustrationRigInferenceInput, "imageAspectRatio" | "imageAnalysis" | "landmarkAnalysis"> = {}
): SceneDocument =>
  updateSource(scene, sourceId, (source) =>
    source.kind === "pngtuber"
      ? {
          ...source,
          illustrationRig: inferAvatarIllustrationRig({ canvas: scene.canvas, transform: source.transform, ...input }, overrides)
        }
      : source
  );

export const setVisibility = (scene: SceneDocument, sourceId: string, visible: boolean): SceneDocument =>
  updateSource(scene, sourceId, (source) => ({ ...source, visible }));

export const setLocked = (scene: SceneDocument, sourceId: string, locked: boolean): SceneDocument =>
  updateSource(scene, sourceId, (source) => ({ ...source, locked }));

export const reorderSource = (scene: SceneDocument, sourceId: string, direction: -1 | 1): SceneDocument => {
  const index = scene.sources.findIndex((source) => source.id === sourceId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= scene.sources.length) {
    return scene;
  }
  const sources = [...scene.sources];
  const [source] = sources.splice(index, 1);
  sources.splice(nextIndex, 0, source);
  return { ...scene, sources };
};

export const toRenderGraph = (scene: SceneDocument, runtime: RenderGraphRuntime = {}): RenderNode[] =>
  scene.sources
    .filter((source) => isRenderableSource(source, runtime))
    .map((source, order) => ({
      id: source.id,
      kind: source.kind,
      order,
      transform: source.transform,
      payload: sourcePayload(source, runtime)
    }));

const isRenderableSource = (source: SceneSource, runtime: RenderGraphRuntime): boolean => {
  if (!source.visible) {
    return false;
  }
  if (source.kind === "text" && !isTextSourceActiveAt(source, runtime.nowMs ?? Date.now())) {
    return false;
  }
  return !(source.kind === "text" && source.contentSource === "runtime-caption" && runtime.captionsEnabled === false);
};

const sourcePayload = (source: SceneSource, runtime: RenderGraphRuntime): Record<string, string | number | boolean> => {
  switch (source.kind) {
    case "screen":
      return { captureMode: source.captureMode };
    case "pngtuber": {
      const pngMotion = source.motion ?? defaultAvatarMotion();
      const rig = source.illustrationRig ?? defaultAvatarIllustrationRig();
      return {
        avatarId: source.avatarId,
        imageUri: source.imageUri,
        rigFaceCenterX: rig.faceCenterX,
        rigFaceCenterY: rig.faceCenterY,
        rigFaceRange: rig.faceRange,
        rigHairLineY: rig.hairLineY,
        rigShoulderLineY: rig.shoulderLineY,
        rigLeftEyeX: rig.leftEyeX,
        rigRightEyeX: rig.rightEyeX,
        rigEyeLineY: rig.eyeLineY,
        rigMouthCenterX: rig.mouthCenterX,
        rigMouthLineY: rig.mouthLineY,
        rigSliceCount: rig.sliceCount,
        expression: source.expression,
        mouthOpen: source.mouthOpen,
        blink: source.blink,
        headYaw: pngMotion.headYaw,
        headPitch: pngMotion.headPitch,
        headRoll: pngMotion.headRoll,
        headX: pngMotion.headX,
        headY: pngMotion.headY,
        bodyLean: pngMotion.bodyLean,
        bodyBounce: pngMotion.bodyBounce,
        breathing: pngMotion.breathing,
        depthTilt: pngMotion.depthTilt,
        meshWarp: pngMotion.meshWarp,
        eyeSquint: pngMotion.eyeSquint,
        mouthDeform: pngMotion.mouthDeform,
        hairSway: pngMotion.hairSway,
        shoulderSway: pngMotion.shoulderSway,
        trackingConfidence: pngMotion.confidence
      };
    }
    case "live2d": {
      const live2dMotion = source.motion ?? defaultAvatarMotion();
      const live2dRuntimePose = createLive2DRuntimePose(source);
      return {
        modelId: source.modelId,
        modelJsonUri: source.modelJsonUri,
        expression: source.expression,
        mouthOpen: source.mouthOpen,
        blink: source.blink,
        headYaw: live2dMotion.headYaw,
        headPitch: live2dMotion.headPitch,
        headRoll: live2dMotion.headRoll,
        headX: live2dMotion.headX,
        headY: live2dMotion.headY,
        bodyLean: live2dMotion.bodyLean,
        bodyBounce: live2dMotion.bodyBounce,
        breathing: live2dMotion.breathing,
        depthTilt: live2dMotion.depthTilt,
        meshWarp: live2dMotion.meshWarp,
        eyeSquint: live2dMotion.eyeSquint,
        mouthDeform: live2dMotion.mouthDeform,
        hairSway: live2dMotion.hairSway,
        shoulderSway: live2dMotion.shoulderSway,
        trackingConfidence: live2dMotion.confidence,
        live2dRuntimeStatus: live2dRuntimePose.status,
        live2dRuntimePoseJson: serializeLive2DRuntimePose(live2dRuntimePose),
        live2dParamAngleX: live2dRuntimePose.parameters.ParamAngleX,
        live2dParamAngleY: live2dRuntimePose.parameters.ParamAngleY,
        live2dParamAngleZ: live2dRuntimePose.parameters.ParamAngleZ,
        live2dParamBodyAngleX: live2dRuntimePose.parameters.ParamBodyAngleX,
        live2dParamBodyAngleY: live2dRuntimePose.parameters.ParamBodyAngleY,
        live2dParamEyeLOpen: live2dRuntimePose.parameters.ParamEyeLOpen,
        live2dParamEyeROpen: live2dRuntimePose.parameters.ParamEyeROpen,
        live2dParamMouthOpenY: live2dRuntimePose.parameters.ParamMouthOpenY,
        live2dParamMouthForm: live2dRuntimePose.parameters.ParamMouthForm,
        live2dParamBreath: live2dRuntimePose.parameters.ParamBreath,
        live2dParamCheek: live2dRuntimePose.parameters.ParamCheek,
        live2dLookAtYaw: live2dRuntimePose.lookAt.yaw,
        live2dLookAtPitch: live2dRuntimePose.lookAt.pitch
      };
    }
    case "vrm": {
      const vrmMotion = source.motion ?? defaultAvatarMotion();
      const vrmRuntimePose = createVrmRuntimePose(source);
      return {
        modelId: source.modelId,
        modelUri: source.modelUri,
        expression: source.expression,
        mouthOpen: source.mouthOpen,
        blink: source.blink,
        headYaw: vrmMotion.headYaw,
        headPitch: vrmMotion.headPitch,
        headRoll: vrmMotion.headRoll,
        headX: vrmMotion.headX,
        headY: vrmMotion.headY,
        bodyLean: vrmMotion.bodyLean,
        bodyBounce: vrmMotion.bodyBounce,
        breathing: vrmMotion.breathing,
        depthTilt: vrmMotion.depthTilt,
        meshWarp: vrmMotion.meshWarp,
        eyeSquint: vrmMotion.eyeSquint,
        mouthDeform: vrmMotion.mouthDeform,
        hairSway: vrmMotion.hairSway,
        shoulderSway: vrmMotion.shoulderSway,
        trackingConfidence: vrmMotion.confidence,
        vrmRuntimeStatus: vrmRuntimePose.status,
        vrmRuntimePoseJson: serializeVrmRuntimePose(vrmRuntimePose),
        vrmLookAtYaw: vrmRuntimePose.lookAt.yaw,
        vrmLookAtPitch: vrmRuntimePose.lookAt.pitch,
        vrmRootOffsetX: vrmRuntimePose.rootOffset.x,
        vrmRootOffsetY: vrmRuntimePose.rootOffset.y,
        vrmRootOffsetZ: vrmRuntimePose.rootOffset.z
      };
    }
    case "image":
      return { uri: source.uri };
    case "solid":
      return { color: source.color };
    case "text": {
      const captionCues =
        source.contentSource === "runtime-caption" ? serializeCaptionOverlayCues(runtime.captions ?? [], source) : [];
      const nowMs = runtime.nowMs ?? Date.now();
      const remainingMs = textSourceRemainingMs(source, nowMs);
      return {
        text: resolveTextSourceText(source, captionCues, { ...runtime, nowMs }),
        mode: source.mode,
        contentSource: source.contentSource,
        align: source.align,
        showCaptionSpeaker: source.showCaptionSpeaker,
        visibilityMode: source.visibilityMode,
        timerMode: source.timerMode ?? "none",
        countdownTargetMs: source.countdownTargetMs ?? 0,
        timerCompleteText: source.timerCompleteText,
        displayDurationMs: source.displayDurationMs,
        activatedAtMs: source.activatedAtMs,
        remainingMs,
        captionCuesJson: JSON.stringify(captionCues),
        color: source.color,
        fontSize: source.fontSize,
        backgroundColor: source.backgroundColor,
        backgroundOpacity: source.backgroundOpacity,
        outlineColor: source.outlineColor,
        outlineWidth: source.outlineWidth,
        maxLines: source.maxLines
      };
    }
    case "chat": {
      const messages = serializeChatOverlayMessages(runtime.chatMessages ?? [], source);
      return {
        text: messages.map((message) => formatChatOverlayLine(message, source.showAuthor)).join("\n"),
        messagesJson: JSON.stringify(messages),
        maxMessages: source.maxMessages,
        maxMessageLength: source.maxMessageLength,
        showAuthor: source.showAuthor,
        redactUrls: source.redactUrls,
        color: source.color,
        fontSize: source.fontSize,
        backgroundColor: source.backgroundColor,
        backgroundOpacity: source.backgroundOpacity
      };
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const booleanValue = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clampedNumber = (value: unknown, fallback: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, finiteNumber(value, fallback)));

const normalizeCanvas = (value: unknown, fallback: SceneDocument["canvas"]): SceneDocument["canvas"] => {
  if (!isRecord(value)) {
    return fallback;
  }
  return {
    width: Math.round(clampedNumber(value.width, fallback.width, 1, 7680)),
    height: Math.round(clampedNumber(value.height, fallback.height, 1, 4320)),
    fps: Math.round(clampedNumber(value.fps, fallback.fps, 1, 120))
  };
};

const normalizeSceneTransitionSettings = (value: unknown): SceneTransitionSettings => {
  if (!isRecord(value)) {
    return defaultSceneTransitionSettings();
  }
  return defaultSceneTransitionSettings({
    kind: isSceneTransitionKind(value.kind) ? value.kind : undefined,
    durationMs: finiteNumber(value.durationMs, 300)
  });
};

const ensureUniqueSceneIds = (scenes: SceneDocument[]): SceneDocument[] => {
  const used = new Set<string>();
  return scenes.map((scene, index) => {
    const uniqueScene = createUniqueScene(
      { ...scene, id: scene.id.trim() || `scene-${index + 1}` },
      used
    );
    used.add(uniqueScene.id);
    return uniqueScene;
  });
};

const createUniqueScene = (scene: SceneDocument, used: Set<string>): SceneDocument => {
  const baseId = scene.id.trim() || "scene";
  let nextId = baseId;
  let suffix = 2;
  while (used.has(nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return nextId === scene.id ? scene : { ...scene, id: nextId };
};

const ensureUniqueSceneSourceIds = (sources: SceneSource[]): SceneSource[] => {
  const used = new Set<string>();
  return sources.map((source, index) => {
    const baseId = source.id.trim() || `source-${source.kind || index + 1}`;
    let nextId = baseId;
    let suffix = 2;
    while (used.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    used.add(nextId);
    return nextId === source.id ? source : { ...source, id: nextId };
  });
};

const normalizeTransformValue = (value: unknown, fallback: Transform): Transform => {
  if (!isRecord(value)) {
    return fallback;
  }
  return clampTransform({
    x: finiteNumber(value.x, fallback.x),
    y: finiteNumber(value.y, fallback.y),
    width: finiteNumber(value.width, fallback.width),
    height: finiteNumber(value.height, fallback.height),
    rotation: finiteNumber(value.rotation, fallback.rotation),
    opacity: finiteNumber(value.opacity, fallback.opacity)
  });
};

const normalizeMotionValue = (value: unknown): AvatarMotion => {
  if (!isRecord(value)) {
    return defaultAvatarMotion();
  }
  return defaultAvatarMotion({
    headYaw: clampedNumber(value.headYaw, 0, -1, 1),
    headPitch: clampedNumber(value.headPitch, 0, -1, 1),
    headRoll: clampedNumber(value.headRoll, 0, -1, 1),
    headX: clampedNumber(value.headX, 0, -1, 1),
    headY: clampedNumber(value.headY, 0, -1, 1),
    bodyLean: clampedNumber(value.bodyLean, 0, -1, 1),
    bodyBounce: clampedNumber(value.bodyBounce, 0, -1, 1),
    breathing: clampedNumber(value.breathing, 0, -1, 1),
    depthTilt: clampedNumber(value.depthTilt, 0, 0, 1),
    meshWarp: clampedNumber(value.meshWarp, 0, -1, 1),
    eyeSquint: clampedNumber(value.eyeSquint, 0, 0, 1),
    mouthDeform: clampedNumber(value.mouthDeform, 0, 0, 1),
    hairSway: clampedNumber(value.hairSway, 0, -1, 1),
    shoulderSway: clampedNumber(value.shoulderSway, 0, -1, 1),
    confidence: clampedNumber(value.confidence, 0, 0, 1)
  });
};

const normalizeIllustrationRigValue = (
  value: unknown,
  transform: Transform,
  canvas: SceneDocument["canvas"]
): AvatarIllustrationRig => {
  if (!isRecord(value)) {
    return inferAvatarIllustrationRig({ canvas, transform });
  }
  return defaultAvatarIllustrationRig({
    faceCenterX: clampedNumber(value.faceCenterX, 0.5, 0.05, 0.95),
    faceCenterY: clampedNumber(value.faceCenterY, 0.42, 0.15, 0.85),
    faceRange: clampedNumber(value.faceRange, 0.34, 0.08, 0.6),
    hairLineY: clampedNumber(value.hairLineY, 0.34, 0.05, 0.55),
    shoulderLineY: clampedNumber(value.shoulderLineY, 0.62, 0.45, 0.95),
    leftEyeX: clampedNumber(value.leftEyeX, 0.42, 0.05, 0.95),
    rightEyeX: clampedNumber(value.rightEyeX, 0.58, 0.05, 0.95),
    eyeLineY: clampedNumber(value.eyeLineY, 0.35, 0.12, 0.65),
    mouthCenterX: clampedNumber(value.mouthCenterX, 0.5, 0.05, 0.95),
    mouthLineY: clampedNumber(value.mouthLineY, 0.5, 0.25, 0.85),
    sliceCount: Math.round(clampedNumber(value.sliceCount, 24, 12, 40))
  });
};

const normalizeSceneSource = (value: unknown, canvas: SceneDocument["canvas"] = createDefaultScene().canvas): SceneSource | null => {
  if (!isRecord(value) || !isSourceKind(value.kind)) {
    return null;
  }

  const fallback = createSource(value.kind);
  const base = {
    id: stringValue(value.id, fallback.id),
    name: stringValue(value.name, fallback.name),
    visible: booleanValue(value.visible, fallback.visible),
    locked: booleanValue(value.locked, fallback.locked),
    transform: normalizeTransformValue(value.transform, fallback.transform),
    blendMode: isBlendMode(value.blendMode) ? value.blendMode : fallback.blendMode
  };

  switch (value.kind) {
    case "screen":
      return {
        ...base,
        kind: "screen",
        captureMode: value.captureMode === "ios-replaykit" ? "ios-replaykit" : "android-media-projection"
      };
    case "pngtuber": {
      const sourceFallback = createSource("pngtuber") as PNGTuberSource;
      return {
        ...base,
        kind: "pngtuber",
        avatarId: stringValue(value.avatarId, sourceFallback.avatarId),
        imageUri: typeof value.imageUri === "string" ? value.imageUri : sourceFallback.imageUri,
        illustrationRig: normalizeIllustrationRigValue(value.illustrationRig, base.transform, canvas),
        expression: stringValue(value.expression, sourceFallback.expression),
        mouthOpen: clampedNumber(value.mouthOpen, sourceFallback.mouthOpen, 0, 1),
        blink: clampedNumber(value.blink, sourceFallback.blink, 0, 1),
        motion: normalizeMotionValue(value.motion)
      };
    }
    case "live2d": {
      const sourceFallback = createSource("live2d") as Live2DSource;
      return {
        ...base,
        kind: "live2d",
        modelId: stringValue(value.modelId, sourceFallback.modelId),
        modelJsonUri: normalizeLive2DModelJsonUri(value.modelJsonUri),
        expression: stringValue(value.expression, sourceFallback.expression),
        mouthOpen: clampedNumber(value.mouthOpen, sourceFallback.mouthOpen, 0, 1),
        blink: clampedNumber(value.blink, sourceFallback.blink, 0, 1),
        motion: normalizeMotionValue(value.motion)
      };
    }
    case "vrm": {
      const sourceFallback = createSource("vrm") as VRMSource;
      return {
        ...base,
        kind: "vrm",
        modelId: stringValue(value.modelId, sourceFallback.modelId),
        modelUri: normalizeVrmModelUri(value.modelUri),
        expression: stringValue(value.expression, sourceFallback.expression),
        mouthOpen: clampedNumber(value.mouthOpen, sourceFallback.mouthOpen, 0, 1),
        blink: clampedNumber(value.blink, sourceFallback.blink, 0, 1),
        motion: normalizeMotionValue(value.motion)
      };
    }
    case "image": {
      const sourceFallback = createSource("image") as ImageSource;
      return { ...base, kind: "image", uri: typeof value.uri === "string" ? value.uri : sourceFallback.uri };
    }
    case "solid": {
      const sourceFallback = createSource("solid") as SolidSource;
      return { ...base, kind: "solid", color: stringValue(value.color, sourceFallback.color) };
    }
    case "text": {
      const sourceFallback = createSource("text") as TextSource;
      return {
        ...base,
        kind: "text",
        text: typeof value.text === "string" ? value.text : sourceFallback.text,
        mode: textSourceModes.includes(value.mode as TextSourceMode) ? (value.mode as TextSourceMode) : sourceFallback.mode,
        contentSource: textSourceContentSources.includes(value.contentSource as TextSourceContentSource)
          ? (value.contentSource as TextSourceContentSource)
          : sourceFallback.contentSource,
        align: textSourceAlignments.includes(value.align as TextSourceAlign)
          ? (value.align as TextSourceAlign)
          : sourceFallback.align,
        showCaptionSpeaker: booleanValue(value.showCaptionSpeaker, sourceFallback.showCaptionSpeaker),
        visibilityMode: textSourceVisibilityModes.includes(value.visibilityMode as TextSourceVisibilityMode)
          ? (value.visibilityMode as TextSourceVisibilityMode)
          : sourceFallback.visibilityMode,
        timerMode: textSourceTimerModes.includes(value.timerMode as TextSourceTimerMode)
          ? (value.timerMode as TextSourceTimerMode)
          : sourceFallback.timerMode,
        countdownTargetMs: Math.round(clampedNumber(value.countdownTargetMs, sourceFallback.countdownTargetMs ?? 0, 0, Number.MAX_SAFE_INTEGER)),
        timerCompleteText: typeof value.timerCompleteText === "string" && value.timerCompleteText.trim().length > 0
          ? value.timerCompleteText
          : sourceFallback.timerCompleteText,
        displayDurationMs: Math.round(
          clampedNumber(
            value.displayDurationMs,
            sourceFallback.displayDurationMs,
            textOverlayMinimumDisplayDurationMs,
            textOverlayMaximumDisplayDurationMs
          )
        ),
        activatedAtMs: Math.round(clampedNumber(value.activatedAtMs, 0, 0, Number.MAX_SAFE_INTEGER)),
        color: stringValue(value.color, sourceFallback.color),
        fontSize: clampedNumber(value.fontSize, sourceFallback.fontSize, 8, 180),
        backgroundColor: stringValue(value.backgroundColor, sourceFallback.backgroundColor),
        backgroundOpacity: clampedNumber(value.backgroundOpacity, sourceFallback.backgroundOpacity, 0, 1),
        outlineColor: stringValue(value.outlineColor, sourceFallback.outlineColor),
        outlineWidth: clampedNumber(value.outlineWidth, sourceFallback.outlineWidth, 0, 12),
        maxLines: Math.round(clampedNumber(value.maxLines, sourceFallback.maxLines, 1, 4))
      };
    }
    case "chat": {
      const sourceFallback = createSource("chat") as ChatOverlaySource;
      return {
        ...base,
        kind: "chat",
        maxMessages: Math.round(clampedNumber(value.maxMessages, sourceFallback.maxMessages, 1, 8)),
        maxMessageLength: Math.round(clampedNumber(value.maxMessageLength, sourceFallback.maxMessageLength, 40, 240)),
        showAuthor: booleanValue(value.showAuthor, sourceFallback.showAuthor),
        redactUrls: booleanValue(value.redactUrls, sourceFallback.redactUrls),
        color: stringValue(value.color, sourceFallback.color),
        fontSize: clampedNumber(value.fontSize, sourceFallback.fontSize, 10, 120),
        backgroundColor: typeof value.backgroundColor === "string" ? value.backgroundColor : sourceFallback.backgroundColor,
        backgroundOpacity: clampedNumber(value.backgroundOpacity, sourceFallback.backgroundOpacity, 0, 1)
      };
    }
  }
};

const isSourceKind = (value: unknown): value is SourceKind =>
  typeof value === "string" && sourceKinds.includes(value as SourceKind);

const isBlendMode = (value: unknown): value is BlendMode =>
  typeof value === "string" && blendModes.includes(value as BlendMode);

const isSceneTransitionKind = (value: unknown): value is SceneTransitionKind =>
  typeof value === "string" && sceneTransitionKinds.includes(value as SceneTransitionKind);

const isAvatarSource = (source: SceneSource): source is PNGTuberSource | Live2DSource | VRMSource =>
  source.kind === "pngtuber" || source.kind === "live2d" || source.kind === "vrm";

const serializeChatOverlayMessages = (messages: ChatOverlayMessage[], source: ChatOverlaySource): ChatOverlayMessage[] =>
  messages
    .map((message) => ({
      author: normalizeOverlayText(message.author).slice(0, 48) || "viewer",
      body: truncateOverlayText(source.redactUrls ? redactOverlayUrls(message.body) : message.body, source.maxMessageLength),
      source: normalizeOverlayText(message.source ?? "").slice(0, 24),
      pinned: message.pinned === true
    }))
    .filter((message) => message.body.length > 0)
    .slice(0, source.maxMessages);

const formatChatOverlayLine = (message: ChatOverlayMessage, showAuthor: boolean): string =>
  showAuthor ? `${message.author}: ${message.body}` : message.body;

const serializeCaptionOverlayCues = (captions: CaptionOverlayCue[], source: TextSource): CaptionOverlayCue[] =>
  captions
    .map((cue) => ({
      text: truncateOverlayText(redactOverlayUrls(cue.text), textOverlayLineMaxLength),
      speaker: normalizeOverlayText(cue.speaker ?? "").slice(0, 48),
      language: normalizeOverlayText(cue.language ?? "").slice(0, 16),
      confidence: clamp01(finiteNumber(cue.confidence, 1)),
      isFinal: cue.isFinal !== false,
      timestampMs: Math.max(0, Math.round(finiteNumber(cue.timestampMs, 0)))
    }))
    .filter((cue) => cue.text.length > 0)
    .slice(-source.maxLines);

const resolveTextSourceText = (source: TextSource, captionCues: CaptionOverlayCue[], runtime: RenderGraphRuntime = {}): string => {
  if (source.contentSource === "manual" && (source.timerMode ?? "none") !== "none") {
    return serializeTextOverlayLines(
      formatTimerOverlayText(runtime.nowMs ?? Date.now(), source, runtime),
      source.maxLines
    ).join("\n");
  }
  if (source.contentSource !== "runtime-caption") {
    return serializeTextOverlayLines(source.text, source.maxLines).join("\n");
  }
  const captionText = captionCues.map((cue) => formatCaptionOverlayLine(cue, source.showCaptionSpeaker)).join("\n");
  return captionText || serializeTextOverlayLines(source.text, source.maxLines).join("\n");
};

const resolveRuntimeTextOverlayPreview = (source: TextSource, runtime: RenderGraphRuntime): string => {
  const captionCues =
    source.contentSource === "runtime-caption" ? serializeCaptionOverlayCues(runtime.captions ?? [], source) : [];
  return resolveTextSourceText(source, captionCues, runtime);
};

const formatCaptionOverlayLine = (cue: CaptionOverlayCue, showSpeaker: boolean): string =>
  truncateOverlayText(showSpeaker && cue.speaker ? `${cue.speaker}: ${cue.text}` : cue.text, textOverlayLineMaxLength);

const isTextSourceActiveAt = (source: TextSource, nowMs: number): boolean =>
  source.visibilityMode !== "timed" || textSourceRemainingMs(source, nowMs) > 0;

const textSourceRemainingMs = (source: TextSource, nowMs: number): number => {
  if (source.visibilityMode !== "timed") {
    return 0;
  }
  if (source.activatedAtMs <= 0) {
    return 0;
  }
  if (nowMs < source.activatedAtMs) {
    return 0;
  }
  const endMs = source.activatedAtMs + source.displayDurationMs;
  return Math.max(0, Math.round(endMs - nowMs));
};

const selectNextQueuedTextOverlayStartMs = (scene: SceneDocument, nowMs: number): number => {
  const activeOrQueuedEndMs = scene.sources
    .filter((source): source is TextSource => source.kind === "text")
    .filter((source) => source.visible && source.contentSource === "manual" && source.visibilityMode === "timed")
    .map((source) =>
      source.activatedAtMs > 0 ? source.activatedAtMs + Math.max(0, Math.round(source.displayDurationMs)) : 0
    )
    .filter((endMs) => endMs > nowMs);

  return activeOrQueuedEndMs.length > 0 ? Math.max(...activeOrQueuedEndMs) : nowMs;
};

const isQueuedTextOverlaySource = (source: SceneSource): boolean =>
  source.kind === "text" && source.id.startsWith("source-queued-subtitle-");

const serializeTextOverlayLines = (value: string, maxLines: number): string[] => {
  const lineLimit = Math.round(clampRange(finiteNumber(maxLines, 1), 1, 4));
  return value
    .split(/\r?\n/)
    .map((line) => truncateOverlayText(line, textOverlayLineMaxLength))
    .filter((line) => line.length > 0)
    .slice(0, lineLimit);
};

const normalizeOverlayText = (value: string): string =>
  redactSensitiveText(value)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const redactOverlayUrls = (value: string): string =>
  value
    .replace(/\bhttps?:\/\/[^\s<>"']+/gi, redactOverlayUrlToken)
    .replace(/\bwww\.[^\s<>"']+/gi, redactOverlayUrlToken)
    .replace(
      /(^|[^\w@.])((?:[a-z0-9-]+\.)+(?:ai|app|co|com|dev|gg|io|jp|link|live|ly|me|net|org|site|stream|tv|xyz)(?:\/[^\s<>"']*)?)/gi,
      (_match, prefix: string, token: string) => `${prefix}${redactOverlayUrlToken(token)}`
    );

const redactOverlayUrlToken = (token: string): string => {
  const trailing = token.match(/[),.;:!?]+$/)?.[0] ?? "";
  return `[link]${trailing}`;
};

const truncateOverlayText = (value: string, maxLength: number): string => {
  const clean = breakLongOverlayTokens(normalizeOverlayText(value));
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const breakLongOverlayTokens = (value: string): string =>
  value
    .split(/(\s+)/)
    .map((part) => (part.trim().length === 0 ? part : breakLongOverlayToken(part)))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

const breakLongOverlayToken = (value: string): string => {
  const redactedMarkerPattern = /(\[redacted\])/i;
  if (redactedMarkerPattern.test(value)) {
    return value
      .split(redactedMarkerPattern)
      .map((part) => (part.toLowerCase() === "[redacted]" ? part : breakLongOverlayTokenSegment(part)))
      .join("");
  }
  return breakLongOverlayTokenSegment(value);
};

const breakLongOverlayTokenSegment = (value: string): string => {
  const characters = Array.from(value);
  if (characters.length <= textOverlayTokenMaxLength) {
    return value;
  }
  const chunks: string[] = [];
  for (let index = 0; index < characters.length; index += textOverlayTokenMaxLength) {
    chunks.push(characters.slice(index, index + textOverlayTokenMaxLength).join(""));
  }
  return chunks.join(" ");
};
