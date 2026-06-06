import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AvatarExpression, AvatarRuntimeState } from "../domain/avatar";
import type { StudioProfile, StreamProtocol } from "../domain/profiles";
import { defaultDestinationProfile, qualityProfiles } from "../domain/profiles";
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

interface MobileStudioScreenProps {
  scene: SceneDocument;
  profile: StudioProfile;
  selectedSourceId: string;
  snapshot: NativeEngineSnapshot;
  avatarRuntime: AvatarRuntimeState;
  onSceneChange(scene: SceneDocument): void;
  onProfileChange(profile: StudioProfile): void;
  onSelectSource(sourceId: string): void;
  onMicLevelChange(level: number): void;
  onExpressionChange(expression: AvatarExpression): void;
  onStart(): Promise<void>;
  onStop(): Promise<void>;
  onReconnect(): Promise<void>;
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

export const MobileStudioScreen = ({
  scene,
  profile,
  selectedSourceId,
  snapshot,
  avatarRuntime,
  onSceneChange,
  onProfileChange,
  onSelectSource,
  onMicLevelChange,
  onExpressionChange,
  onStart,
  onStop,
  onReconnect
}: MobileStudioScreenProps) => {
  const selectedSource = scene.sources.find((source) => source.id === selectedSourceId) ?? scene.sources[0];
  const isLive = snapshot.state.status === "live" || snapshot.state.status === "reconnecting";
  const isBusy = snapshot.state.status === "preparing" || snapshot.state.status === "stopping";

  const updateDestination = (update: Partial<StudioProfile["destination"]>) => {
    onProfileChange({
      ...profile,
      destination: {
        ...profile.destination,
        ...update
      }
    });
  };

  const addNewSource = (kind: SourceKind) => {
    const source = createSource(kind);
    onSceneChange(addSource(scene, source));
    onSelectSource(source.id);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.shell}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>ML</Text>
          </View>
          <View style={styles.brandTextBlock}>
            <Text style={styles.title}>MobileLiveCaster</Text>
            <Text style={styles.subtitle}>OBS Mode</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <StatusPill label={snapshot.state.status} tone={isLive ? "live" : snapshot.state.status === "failed" ? "bad" : "idle"} />
          <Metric label={`${snapshot.health.bitrateKbps} kbps`} />
          <Metric label={`${snapshot.health.fps} fps`} />
          <Metric label={`${snapshot.health.droppedFrames} drops`} />
        </View>

        <Panel title="Sources">
          {[...scene.sources].reverse().map((source) => (
            <Pressable
              key={source.id}
              hitSlop={8}
              style={[styles.sourceRow, source.id === selectedSource.id && styles.selectedRow]}
              onPress={() => onSelectSource(source.id)}
            >
              <Text style={styles.sourceKind}>{sourceLabels[source.kind]}</Text>
              <Text style={styles.sourceName} numberOfLines={1}>
                {source.name}
              </Text>
              <Text style={styles.sourceMeta}>{source.visible ? "show" : "hide"} / {source.locked ? "lock" : "free"}</Text>
            </Pressable>
          ))}

          <View style={styles.grid2}>
            {sourceKinds.map((kind) => (
              <ActionButton key={kind} label={`+ ${sourceLabels[kind]}`} onPress={() => addNewSource(kind)} />
            ))}
          </View>

          <View style={styles.grid4}>
            <IconButton label="Up" onPress={() => onSceneChange(reorderSource(scene, selectedSource.id, 1))} />
            <IconButton label="Down" onPress={() => onSceneChange(reorderSource(scene, selectedSource.id, -1))} />
            <IconButton
              label={selectedSource.visible ? "Hide" : "Show"}
              onPress={() => onSceneChange(setVisibility(scene, selectedSource.id, !selectedSource.visible))}
            />
            <IconButton
              label={selectedSource.locked ? "Unlock" : "Lock"}
              onPress={() => onSceneChange(setLocked(scene, selectedSource.id, !selectedSource.locked))}
            />
          </View>
        </Panel>

        <Panel title="Program">
          <ProgramPreview scene={scene} selectedSourceId={selectedSource.id} onSelectSource={onSelectSource} />
        </Panel>

        <View style={styles.transport}>
          <ActionButton label="Go Live" variant="primary" disabled={isBusy || isLive} onPress={onStart} />
          <ActionButton label="Stop" variant="danger" disabled={isBusy || !isLive} onPress={onStop} />
          <ActionButton label="Reconnect" disabled={!isLive} onPress={onReconnect} />
          <View style={styles.transportReadout}>
            <Text style={styles.mutedText}>{formatElapsed(snapshot.health.elapsedSeconds)}</Text>
            <Text style={styles.mutedText}>{snapshot.health.message}</Text>
          </View>
        </View>

        <Panel title="Transform">
          <Label text="Name" />
          <TextInput
            value={selectedSource.name}
            onChangeText={(name) => onSceneChange(updateSource(scene, selectedSource.id, (source) => ({ ...source, name })))}
            style={styles.input}
            placeholderTextColor="#71717a"
          />
          <Stepper label="X" value={selectedSource.transform.x} onChange={(x) => onSceneChange(updateTransform(scene, selectedSource.id, { x }))} />
          <Stepper label="Y" value={selectedSource.transform.y} onChange={(y) => onSceneChange(updateTransform(scene, selectedSource.id, { y }))} />
          <Stepper
            label="Width"
            value={selectedSource.transform.width}
            onChange={(width) => onSceneChange(updateTransform(scene, selectedSource.id, { width }))}
          />
          <Stepper
            label="Height"
            value={selectedSource.transform.height}
            onChange={(height) => onSceneChange(updateTransform(scene, selectedSource.id, { height }))}
          />
          <Stepper
            label="Opacity"
            value={selectedSource.transform.opacity}
            onChange={(opacity) => onSceneChange(updateTransform(scene, selectedSource.id, { opacity }))}
          />
        </Panel>

        <Panel title="Mixer">
          <Stepper label="Lip sync" value={avatarRuntime.mouthOpen} onChange={onMicLevelChange} />
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${Math.round(avatarRuntime.mouthOpen * 100)}%` }]} />
          </View>
          <View style={styles.grid2}>
            {expressions.map((expression) => (
              <ActionButton
                key={expression}
                label={expression}
                variant={avatarRuntime.expression === expression ? "active" : "default"}
                onPress={() => onExpressionChange(expression)}
              />
            ))}
          </View>
        </Panel>

        <Panel title="Live Setup">
          <View style={styles.grid2}>
            {(["rtmp", "rtmps"] as StreamProtocol[]).map((protocol) => (
              <ActionButton
                key={protocol}
                label={protocol.toUpperCase()}
                variant={profile.destination.protocol === protocol ? "active" : "default"}
                onPress={() =>
                  updateDestination({
                    protocol,
                    serverUrl:
                      protocol === "rtmps"
                        ? defaultDestinationProfile.serverUrl
                        : defaultDestinationProfile.serverUrl.replace("rtmps://", "rtmp://")
                  })
                }
              />
            ))}
          </View>

          <Label text="Server URL" />
          <TextInput
            value={profile.destination.serverUrl}
            onChangeText={(serverUrl) => updateDestination({ serverUrl })}
            style={styles.input}
            autoCapitalize="none"
            placeholderTextColor="#71717a"
          />

          <Label text="Stream key" />
          <TextInput
            value={profile.destination.streamKey}
            onChangeText={(streamKey) => updateDestination({ streamKey })}
            style={styles.input}
            autoCapitalize="none"
            secureTextEntry
            placeholderTextColor="#71717a"
          />

          <Label text="Quality" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.qualityRow}>
            {qualityProfiles.map((quality) => (
              <Pressable
                key={quality.id}
                hitSlop={8}
                style={[styles.qualityChip, quality.id === profile.quality.id && styles.qualityChipActive]}
                onPress={() => onProfileChange({ ...profile, quality })}
              >
                <Text style={styles.qualityText}>{quality.name}</Text>
                <Text style={styles.qualityMeta}>
                  {quality.width}x{quality.height} / {quality.fps}fps
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
};

const ProgramPreview = ({
  scene,
  selectedSourceId,
  onSelectSource
}: {
  scene: SceneDocument;
  selectedSourceId: string;
  onSelectSource(sourceId: string): void;
}) => (
  <View style={styles.previewStage}>
    {toRenderGraph(scene).map((node) => {
      const source = scene.sources.find((item) => item.id === node.id);
      if (!source) {
        return null;
      }

      return (
        <Pressable
          key={source.id}
          style={[
            styles.previewSource,
            {
              left: `${source.transform.x * 100}%`,
              top: `${source.transform.y * 100}%`,
              width: `${source.transform.width * 100}%`,
              height: `${source.transform.height * 100}%`,
              opacity: source.transform.opacity,
              transform: [{ rotate: `${source.transform.rotation}deg` }]
            },
            source.id === selectedSourceId && styles.previewSourceSelected
          ]}
          onPress={() => onSelectSource(source.id)}
        >
          <SourceVisual source={source} />
        </Pressable>
      );
    })}
  </View>
);

const SourceVisual = ({ source }: { source: SceneSource }) => {
  if (source.kind === "screen") {
    return (
      <View style={styles.screenVisual}>
        <Text style={styles.previewText}>Screen Capture</Text>
      </View>
    );
  }

  if (source.kind === "pngtuber" || source.kind === "live2d") {
    return (
      <View style={styles.avatarVisual}>
        <View style={[styles.avatarHead, expressionStyle(source.expression)]}>
          <View style={[styles.avatarEye, styles.avatarEyeLeft, { transform: [{ scaleY: Math.max(0.1, 1 - source.blink) }] }]} />
          <View style={[styles.avatarEye, styles.avatarEyeRight, { transform: [{ scaleY: Math.max(0.1, 1 - source.blink) }] }]} />
          <View style={[styles.avatarMouth, { height: 6 + source.mouthOpen * 22 }]} />
        </View>
        <Text style={styles.avatarLabel}>{source.kind === "live2d" ? "Live2D" : "PNGTuber"}</Text>
      </View>
    );
  }

  if (source.kind === "text") {
    return (
      <Text style={[styles.textSource, { color: source.color, fontSize: fontSizeForTextSource(source) }]} numberOfLines={1}>
        {source.text}
      </Text>
    );
  }

  if (source.kind === "solid") {
    return <View style={[styles.solidSource, { backgroundColor: source.color }]} />;
  }

  return (
    <View style={styles.imageSource}>
      <Text style={styles.previewText}>Image</Text>
    </View>
  );
};

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.panel}>
    <Text style={styles.panelTitle}>{title}</Text>
    {children}
  </View>
);

const StatusPill = ({ label, tone }: { label: string; tone: "live" | "idle" | "bad" }) => (
  <View style={[styles.statusPill, tone === "live" && styles.statusLive, tone === "bad" && styles.statusBad]}>
    <Text style={[styles.statusText, tone === "live" && styles.statusTextLive]}>{label.toUpperCase()}</Text>
  </View>
);

const Metric = ({ label }: { label: string }) => (
  <View style={styles.metric}>
    <Text style={styles.metricText}>{label}</Text>
  </View>
);

const ActionButton = ({
  label,
  variant = "default",
  disabled,
  onPress
}: {
  label: string;
  variant?: "default" | "primary" | "danger" | "active";
  disabled?: boolean;
  onPress(): void | Promise<void>;
}) => (
  <Pressable
    hitSlop={8}
    disabled={disabled}
    style={[
      styles.actionButton,
      variant === "primary" && styles.primaryButton,
      variant === "danger" && styles.dangerButton,
      variant === "active" && styles.activeButton,
      disabled && styles.disabledButton
    ]}
    onPress={onPress}
  >
    <Text style={[styles.actionText, variant === "primary" && styles.primaryText]}>{label}</Text>
  </Pressable>
);

const IconButton = ({ label, onPress }: { label: string; onPress(): void }) => (
  <Pressable hitSlop={8} style={styles.iconButton} onPress={onPress}>
    <Text style={styles.iconButtonText}>{label}</Text>
  </Pressable>
);

const Label = ({ text }: { text: string }) => <Text style={styles.label}>{text}</Text>;

const Stepper = ({ label, value, onChange }: { label: string; value: number; onChange(value: number): void }) => {
  const set = (delta: number) => onChange(Math.max(0, Math.min(1, Number((value + delta).toFixed(2)))));
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperHeader}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.stepperValue}>{Math.round(value * 100)}</Text>
      </View>
      <View style={styles.stepperControls}>
        <IconButton label="-5" onPress={() => set(-0.05)} />
        <View style={styles.stepperTrack}>
          <View style={[styles.stepperFill, { width: `${Math.round(value * 100)}%` }]} />
        </View>
        <IconButton label="+5" onPress={() => set(0.05)} />
      </View>
    </View>
  );
};

const expressionStyle = (expression: string) => {
  switch (expression) {
    case "happy":
      return styles.avatarHappy;
    case "angry":
      return styles.avatarAngry;
    case "surprised":
      return styles.avatarSurprised;
    default:
      return null;
  }
};

const fontSizeForTextSource = (source: Extract<SceneSource, { kind: "text" }>) =>
  Math.max(9, Math.min(source.fontSize / 2, source.transform.width * 42, source.transform.height * 150));

const formatElapsed = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#101015"
  },
  shell: {
    padding: 12,
    gap: 12
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  brandMark: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#505064",
    backgroundColor: "#20202a"
  },
  brandMarkText: {
    color: "#2dd4bf",
    fontWeight: "900"
  },
  brandTextBlock: {
    flex: 1
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900"
  },
  subtitle: {
    color: "#a1a1aa",
    fontSize: 13,
    marginTop: 2
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statusPill: {
    minHeight: 34,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#18181f"
  },
  statusLive: {
    borderColor: "#22c55e",
    backgroundColor: "#22c55e"
  },
  statusBad: {
    borderColor: "#fb7185",
    backgroundColor: "#fb7185"
  },
  statusText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "900"
  },
  statusTextLive: {
    color: "#062d18"
  },
  metric: {
    minHeight: 34,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#18181f"
  },
  metricText: {
    color: "#f8fafc",
    fontSize: 13
  },
  panel: {
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#18181f",
    gap: 10
  },
  panelTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "900"
  },
  sourceRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#20202a",
    gap: 3
  },
  selectedRow: {
    borderColor: "#2dd4bf"
  },
  sourceKind: {
    color: "#2dd4bf",
    fontSize: 12,
    fontWeight: "900"
  },
  sourceName: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700"
  },
  sourceMeta: {
    color: "#a1a1aa",
    fontSize: 12
  },
  grid2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  grid4: {
    flexDirection: "row",
    gap: 8
  },
  actionButton: {
    minHeight: 46,
    minWidth: 118,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    backgroundColor: "#20202a",
    paddingHorizontal: 12
  },
  primaryButton: {
    borderColor: "#22c55e",
    backgroundColor: "#22c55e"
  },
  dangerButton: {
    borderColor: "rgba(251, 113, 133, 0.54)",
    backgroundColor: "rgba(251, 113, 133, 0.16)"
  },
  activeButton: {
    borderColor: "#2dd4bf",
    backgroundColor: "rgba(45, 212, 191, 0.16)"
  },
  disabledButton: {
    opacity: 0.48
  },
  actionText: {
    color: "#f8fafc",
    fontWeight: "800",
    textTransform: "capitalize"
  },
  primaryText: {
    color: "#062d18"
  },
  iconButton: {
    minHeight: 44,
    minWidth: 66,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    backgroundColor: "#20202a",
    paddingHorizontal: 8
  },
  iconButtonText: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 12
  },
  previewStage: {
    position: "relative",
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#0d0d13"
  },
  previewSource: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent"
  },
  previewSourceSelected: {
    borderColor: "#2dd4bf"
  },
  screenVisual: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56, 189, 248, 0.12)"
  },
  previewText: {
    color: "#a1a1aa",
    fontWeight: "700"
  },
  avatarVisual: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarHead: {
    position: "relative",
    width: "72%",
    aspectRatio: 1,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: "#f8fafc",
    backgroundColor: "#8b5cf6"
  },
  avatarHappy: {
    backgroundColor: "#22c55e"
  },
  avatarAngry: {
    backgroundColor: "#fb7185"
  },
  avatarSurprised: {
    backgroundColor: "#38bdf8"
  },
  avatarEye: {
    position: "absolute",
    top: "34%",
    width: "13%",
    height: "18%",
    borderRadius: 99,
    backgroundColor: "#101015"
  },
  avatarEyeLeft: {
    left: "27%"
  },
  avatarEyeRight: {
    right: "27%"
  },
  avatarMouth: {
    position: "absolute",
    left: "38%",
    bottom: "25%",
    width: "24%",
    minHeight: 5,
    borderRadius: 99,
    backgroundColor: "#101015"
  },
  avatarLabel: {
    position: "absolute",
    bottom: 8,
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    color: "#f8fafc",
    backgroundColor: "rgba(16, 16, 21, 0.78)",
    fontSize: 11,
    fontWeight: "900"
  },
  textSource: {
    width: "100%",
    color: "#f8fafc",
    fontWeight: "900",
    textAlign: "center"
  },
  solidSource: {
    width: "100%",
    height: "100%"
  },
  imageSource: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#f59e0b",
    backgroundColor: "rgba(245, 158, 11, 0.2)"
  },
  transport: {
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#18181f",
    gap: 10
  },
  transportReadout: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  mutedText: {
    color: "#a1a1aa"
  },
  label: {
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "700"
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#101015",
    color: "#f8fafc"
  },
  stepper: {
    gap: 8
  },
  stepperHeader: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  stepperValue: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900"
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  stepperTrack: {
    flex: 1,
    height: 10,
    overflow: "hidden",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#505064",
    backgroundColor: "#101015"
  },
  stepperFill: {
    height: "100%",
    backgroundColor: "#2dd4bf"
  },
  levelTrack: {
    height: 12,
    overflow: "hidden",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#505064",
    backgroundColor: "#101015"
  },
  levelFill: {
    height: "100%",
    backgroundColor: "#22c55e"
  },
  qualityRow: {
    gap: 8,
    paddingRight: 4
  },
  qualityChip: {
    minWidth: 156,
    minHeight: 64,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#20202a"
  },
  qualityChipActive: {
    borderColor: "#2dd4bf"
  },
  qualityText: {
    color: "#f8fafc",
    fontWeight: "900"
  },
  qualityMeta: {
    marginTop: 4,
    color: "#a1a1aa",
    fontSize: 12
  }
});
