import { Settings, ShieldCheck, Trash2 } from "lucide-react";
import {
  applyDestinationPreset,
  destinationPresets,
  getDestinationPreset,
  markDestinationCustom,
  qualityProfiles,
  redactStreamKey,
  serverUrlWithProtocol,
  type DestinationPresetId,
  type StudioProfile,
  type StreamProtocol
} from "../domain/profiles";
import type { YouTubeBroadcastTransitionStatus } from "../domain/platformPublishing";
import type { ReadinessReport } from "../domain/readiness";
import { PanelTitle, ProtocolBadge } from "./ui";

interface LiveSetupScreenProps {
  profile: StudioProfile;
  readiness: ReadinessReport;
  locked: boolean;
  platformPublishingStatus: string;
  onProfileChange(profile: StudioProfile): void;
  onPlatformPublishingApply(): void | Promise<void>;
  onYouTubePublishingStatusRefresh(): void | Promise<void>;
  onYouTubeBroadcastTransition(status: YouTubeBroadcastTransitionStatus): void | Promise<void>;
  onClearStreamKey(): void;
}

export const LiveSetupScreen = ({
  profile,
  readiness,
  locked,
  platformPublishingStatus,
  onProfileChange,
  onPlatformPublishingApply,
  onYouTubePublishingStatusRefresh,
  onYouTubeBroadcastTransition,
  onClearStreamKey
}: LiveSetupScreenProps) => {
  const activePreset = getDestinationPreset(profile.destination.presetId) ?? getDestinationPreset("custom-rtmps");
  const canApplyPlatformPublishing = profile.destination.platform === "youtube-live" || profile.destination.platform === "twitch";

  const updateDestination = (update: Partial<StudioProfile["destination"]>) => {
    if (locked) {
      return;
    }
    onProfileChange({
      ...profile,
      destination: {
        ...profile.destination,
        ...update
      }
    });
  };
  const updatePreset = (presetId: DestinationPresetId) => {
    if (locked) {
      return;
    }
    onProfileChange(applyDestinationPreset(profile, presetId));
  };
  const updateProtocol = (protocol: StreamProtocol) => {
    updateDestination(
      markDestinationCustom(profile.destination, {
        protocol,
        serverUrl: serverUrlWithProtocol(profile.destination.serverUrl, protocol)
      })
    );
  };
  const updateServerUrl = (serverUrl: string) => {
    updateDestination(markDestinationCustom(profile.destination, { serverUrl }));
  };
  const updatePublishing = (update: Partial<StudioProfile["platformPublishing"]>) => {
    if (locked) {
      return;
    }
    onProfileChange({
      ...profile,
      platformPublishing: {
        ...profile.platformPublishing,
        ...update
      }
    });
  };

  return (
    <section className="control-panel">
      <PanelTitle icon={<Settings size={18} />} title="Live Setup" />
      <label className="field">
        <span>Destination</span>
        <select
          value={profile.destination.presetId}
          disabled={locked}
          onChange={(event) => updatePreset(event.target.value as DestinationPresetId)}
        >
          {destinationPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>

      <div className="protocol-row" role="group" aria-label="protocol">
        {(["rtmp", "rtmps"] as StreamProtocol[]).map((protocol) => (
          <button
            key={protocol}
            className={`segmented-button ${profile.destination.protocol === protocol ? "active" : ""}`}
            type="button"
            disabled={locked}
            onClick={() => updateProtocol(protocol)}
          >
            <ProtocolBadge protocol={protocol} />
          </button>
        ))}
      </div>

      <label className="field">
        <span>Server URL</span>
        <input
          value={profile.destination.serverUrl}
          disabled={locked}
          onChange={(event) => updateServerUrl(event.target.value)}
        />
      </label>

      <label className="field">
        <span>{activePreset?.streamKeyLabel ?? "Stream key"}</span>
        <input
          value={profile.destination.streamKey}
          type="password"
          autoComplete="off"
          disabled={locked}
          onChange={(event) => updateDestination({ streamKey: event.target.value })}
        />
      </label>
      <div className="secret-tools">
        <span>{profile.destination.streamKey ? `Saved as ${redactStreamKey(profile.destination.streamKey)}` : "No stream key saved"}</span>
        <button
          className="danger-action compact-action"
          type="button"
          disabled={locked || !profile.destination.streamKey}
          onClick={onClearStreamKey}
        >
          <Trash2 size={15} />
          Clear key
        </button>
      </div>

      <label className="field">
        <span>Stream title</span>
        <input
          value={profile.platformPublishing.title}
          maxLength={100}
          disabled={locked}
          onChange={(event) => updatePublishing({ title: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea
          value={profile.platformPublishing.description}
          maxLength={5000}
          disabled={locked}
          rows={3}
          onChange={(event) => updatePublishing({ description: event.target.value })}
        />
      </label>

      {profile.destination.platform === "youtube-live" ? (
        <>
          <label className="field">
            <span>YouTube privacy</span>
            <select
              value={profile.platformPublishing.privacyStatus}
              disabled={locked}
              onChange={(event) =>
                updatePublishing({ privacyStatus: event.target.value as StudioProfile["platformPublishing"]["privacyStatus"] })
              }
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label className="field">
            <span>Start offset minutes</span>
            <input
              type="number"
              min={1}
              max={10080}
              value={profile.platformPublishing.scheduledStartMinutesFromNow}
              disabled={locked}
              onChange={(event) => updatePublishing({ scheduledStartMinutesFromNow: Number(event.target.value) })}
            />
          </label>
          <div className="monitor-row">
            <button
              className={`segmented-button ${profile.platformPublishing.enableAutoStart ? "active" : ""}`}
              type="button"
              disabled={locked}
              onClick={() => updatePublishing({ enableAutoStart: !profile.platformPublishing.enableAutoStart })}
            >
              Auto Start
            </button>
            <button
              className={`segmented-button ${profile.platformPublishing.enableAutoStop ? "active" : ""}`}
              type="button"
              disabled={locked}
              onClick={() => updatePublishing({ enableAutoStop: !profile.platformPublishing.enableAutoStop })}
            >
              Auto Stop
            </button>
          </div>
          <div className="monitor-row">
            <button
              className={`segmented-button ${profile.platformPublishing.madeForKids ? "active" : ""}`}
              type="button"
              disabled={locked}
              onClick={() => updatePublishing({ madeForKids: !profile.platformPublishing.madeForKids })}
            >
              Made for Kids
            </button>
            <span className="platform-resource-id">
              {profile.platformPublishing.youtubeBroadcastStatus ||
                profile.platformPublishing.youtubeBroadcastId ||
                profile.platformPublishing.youtubeStreamId ||
                "No YouTube resource ID"}
            </span>
          </div>
          <div className="youtube-status-grid">
            <span>Broadcast {profile.platformPublishing.youtubeBroadcastStatus || "unknown"}</span>
            <span>Stream {profile.platformPublishing.youtubeStreamStatus || "unknown"}</span>
            <span>Health {profile.platformPublishing.youtubeStreamHealthStatus || "unknown"}</span>
          </div>
          {profile.platformPublishing.youtubeStreamHealthIssues.length > 0 ? (
            <div className="youtube-health-list">
              {profile.platformPublishing.youtubeStreamHealthIssues.map((issue) => (
                <span key={issue}>{issue}</span>
              ))}
            </div>
          ) : null}
          <button
            className="secondary-action compact-action platform-wide-action"
            type="button"
            disabled={locked || !profile.platformPublishing.youtubeBroadcastId}
            onClick={onYouTubePublishingStatusRefresh}
          >
            Refresh Status
          </button>
          <div className="broadcast-transition-row">
            {(["testing", "live", "complete"] as YouTubeBroadcastTransitionStatus[]).map((broadcastStatus) => (
              <button
                key={broadcastStatus}
                className="segmented-button"
                type="button"
                disabled={locked || !profile.platformPublishing.youtubeBroadcastId}
                onClick={() => onYouTubeBroadcastTransition(broadcastStatus)}
              >
                {broadcastStatus === "testing" ? "Test" : broadcastStatus === "live" ? "Live" : "Complete"}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {profile.destination.platform === "twitch" ? (
        <>
          <label className="field">
            <span>Twitch category</span>
            <input
              value={profile.platformPublishing.twitchCategory}
              disabled={locked}
              onChange={(event) => updatePublishing({ twitchCategory: event.target.value, twitchCategoryId: "" })}
            />
          </label>
          <label className="field">
            <span>Twitch category ID</span>
            <input
              value={profile.platformPublishing.twitchCategoryId}
              disabled={locked}
              onChange={(event) => updatePublishing({ twitchCategoryId: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Twitch language</span>
            <input
              value={profile.platformPublishing.twitchLanguage}
              maxLength={12}
              disabled={locked}
              onChange={(event) => updatePublishing({ twitchLanguage: event.target.value })}
            />
          </label>
        </>
      ) : null}

      <div className="secret-tools">
        <span>{platformPublishingStatus}</span>
        <button
          className="secondary-action compact-action"
          type="button"
          disabled={locked || !canApplyPlatformPublishing}
          onClick={onPlatformPublishingApply}
        >
          {profile.destination.platform === "youtube-live" ? "Create Broadcast" : "Update Metadata"}
        </button>
      </div>

      <label className="field">
        <span>Quality</span>
        <select
          value={profile.quality.id}
          disabled={locked}
          onChange={(event) => {
            const quality = qualityProfiles.find((item) => item.id === event.target.value) ?? qualityProfiles[0];
            onProfileChange({ ...profile, quality });
          }}
        >
          {qualityProfiles.map((quality) => (
            <option key={quality.id} value={quality.id}>
              {quality.name}
            </option>
          ))}
        </select>
      </label>

      <div className="quality-readout">
        <span>{profile.quality.width}x{profile.quality.height}</span>
        <span>{profile.quality.fps}fps</span>
        <span>{profile.quality.videoBitrateKbps} kbps</span>
      </div>

      <div className={`readiness-card ${readiness.canStart ? "ready" : "blocked"}`}>
        <div className="readiness-card-header">
          <ShieldCheck size={16} />
          <span>{readiness.canStart ? "Start checks passed" : "Start checks need attention"}</span>
        </div>
        <div className="readiness-list">
          {readiness.issues.length === 0 ? (
            <span className="readiness-empty">No blocking issues found.</span>
          ) : (
            readiness.issues.map((issue) => (
              <span key={issue.code} className={`readiness-issue ${issue.severity}`}>
                {issue.message}
              </span>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
