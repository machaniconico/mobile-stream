import { Megaphone, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { createDiagnosticRedactionSecrets } from "../domain/diagnosticSecrets";
import {
  applyCustomQualitySettings,
  applyDestinationPreset,
  destinationPresets,
  getDestinationPreset,
  markDestinationCustom,
  qualityProfiles,
  qualityResolutionOptions,
  qualitySettingsLimits,
  redactStreamKey,
  serverUrlWithProtocol,
  type AndroidPublisherMode,
  type DestinationPresetId,
  type StudioProfile,
  type StreamProtocol
} from "../domain/profiles";
import type { YouTubeBroadcastTransitionStatus } from "../domain/platformPublishing";
import type { PlatformChatOAuthCredentialStore } from "../domain/platformChatOAuth";
import {
  createYouTubeBroadcastTransitionPreflightReport,
  type PlatformPublishingPreflightReport
} from "../domain/platformPublishingPreflight";
import type { PublicLaunchChecklist } from "../domain/publicLaunchChecklist";
import type { ReadinessReport } from "../domain/readiness";
import { createStreamAnnouncementPreview } from "../domain/streamAnnouncement";
import { isValidDiscordWebhookUrl } from "../domain/streamAnnouncementAutoPost";
import type { StreamStatus } from "../domain/streamState";
import type { StreamValidationChecklist } from "../domain/streamValidationChecklist";
import { PanelTitle, ProtocolBadge } from "./ui";

interface LiveSetupScreenProps {
  profile: StudioProfile;
  readiness: ReadinessReport;
  streamStatus: StreamStatus;
  validation: Pick<StreamValidationChecklist, "status" | "recommendedNextStep">;
  publicLaunchChecklist?: PublicLaunchChecklist | null;
  platformChatOAuthCredentials?: PlatformChatOAuthCredentialStore | null;
  locked: boolean;
  platformPublishingStatus: string;
  platformApiOperationLabel: string | null;
  streamAnnouncementAutoPostStatus: string;
  streamAnnouncementWebhookStorageNotice: string;
  onProfileChange(profile: StudioProfile): void;
  onPlatformPublishingApply(): void | Promise<void>;
  onPlatformPublishingStatusRefresh(): void | Promise<void>;
  onYouTubeBroadcastTransition(status: YouTubeBroadcastTransitionStatus): void | Promise<void>;
  onStreamAnnouncementWebhookTest(): void | Promise<void>;
  onClearStreamKey(): void;
}

export const LiveSetupScreen = ({
  profile,
  readiness,
  streamStatus,
  validation,
  publicLaunchChecklist = null,
  platformChatOAuthCredentials = null,
  locked,
  platformPublishingStatus,
  platformApiOperationLabel,
  streamAnnouncementAutoPostStatus,
  streamAnnouncementWebhookStorageNotice,
  onProfileChange,
  onPlatformPublishingApply,
  onPlatformPublishingStatusRefresh,
  onYouTubeBroadcastTransition,
  onStreamAnnouncementWebhookTest,
  onClearStreamKey
}: LiveSetupScreenProps) => {
  const activePreset = getDestinationPreset(profile.destination.presetId) ?? getDestinationPreset("custom-rtmps");
  const canApplyPlatformPublishing = profile.destination.platform === "youtube-live" || profile.destination.platform === "twitch";
  const streamAnnouncementPreview = createStreamAnnouncementPreview({
    profile,
    twitchLogin: platformChatOAuthCredentials?.twitch?.twitchLogin,
    secrets: createDiagnosticRedactionSecrets({
      streamKey: profile.destination.streamKey,
      discordWebhookUrl: profile.streamAnnouncement.discordWebhookUrl,
      platformChatOAuthCredentials
    })
  });
  const webhookUrlPresent = Boolean(profile.streamAnnouncement.discordWebhookUrl.trim());
  const webhookUrlValid = isValidDiscordWebhookUrl(profile.streamAnnouncement.discordWebhookUrl);
  const activeQualityPreset = qualityProfiles.find((quality) => quality.id === profile.quality.id);
  const activeQualityResolution = qualityResolutionOptions.find(
    (resolution) => resolution.width === profile.quality.width && resolution.height === profile.quality.height
  );
  const estimatedUploadKbps = Math.round(
    (profile.quality.videoBitrateKbps + profile.quality.audioBitrateKbps) * 1.25
  );
  const youtubeTransitionReport = (transitionStatus: YouTubeBroadcastTransitionStatus) =>
    createYouTubeBroadcastTransitionPreflightReport({
      profile,
      transitionStatus,
      streamStatus,
      validation,
      publicLaunchChecklist,
      platformChatOAuthCredentials
    });

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
  const updateStreamAnnouncement = (update: Partial<StudioProfile["streamAnnouncement"]>) => {
    if (locked) {
      return;
    }
    onProfileChange({
      ...profile,
      streamAnnouncement: {
        ...profile.streamAnnouncement,
        ...update
      }
    });
  };
  const updateQuality = (
    update: Partial<
      Pick<StudioProfile["quality"], "width" | "height" | "fps" | "videoBitrateKbps" | "audioBitrateKbps">
    >
  ) => {
    if (locked) {
      return;
    }
    onProfileChange(applyCustomQualitySettings(profile, update));
  };
  const updateAndroidPublisherMode = (androidPublisherMode: AndroidPublisherMode) => {
    if (locked) {
      return;
    }
    onProfileChange({
      ...profile,
      androidPublisherMode
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
      <label className="field">
        <span>Announcement template</span>
        <textarea
          value={profile.streamAnnouncement.template}
          maxLength={500}
          disabled={locked}
          rows={3}
          onChange={(event) => updateStreamAnnouncement({ template: event.target.value })}
        />
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={profile.streamAnnouncement.promptAfterGoLive}
          disabled={locked}
          onChange={(event) => updateStreamAnnouncement({ promptAfterGoLive: event.target.checked })}
        />
        <span>Prompt after Go Live</span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={profile.streamAnnouncement.autoPostEnabled}
          disabled={locked}
          onChange={(event) => updateStreamAnnouncement({ autoPostEnabled: event.target.checked })}
        />
        <span>Auto-post to Discord after platform Live</span>
      </label>
      <label className="field">
        <span>Discord webhook URL</span>
        <div className="secret-input-row">
          <input
            type="password"
            value={profile.streamAnnouncement.discordWebhookUrl}
            disabled={locked}
            autoComplete="off"
            placeholder="https://discord.com/api/webhooks/{id}/{token}"
            onChange={(event) => updateStreamAnnouncement({ discordWebhookUrl: event.target.value })}
          />
          <button
            className="icon-button"
            type="button"
            disabled={locked || !webhookUrlPresent}
            title="Clear Discord webhook URL"
            aria-label="Clear Discord webhook URL"
            onClick={() => updateStreamAnnouncement({ discordWebhookUrl: "" })}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </label>
      <div className="stream-announcement-webhook-row">
        <span>{webhookUrlPresent ? (webhookUrlValid ? "Discord webhook configured." : "Discord webhook URL format is invalid.") : "Discord webhook not set."}</span>
        <button
          className="secondary-action compact-action"
          type="button"
          disabled={locked || !webhookUrlPresent || !streamAnnouncementPreview.text}
          onClick={() => void onStreamAnnouncementWebhookTest()}
        >
          <Megaphone size={16} />
          <span>Test post</span>
        </button>
      </div>
      <p className="field-note">{streamAnnouncementWebhookStorageNotice}</p>
      {streamAnnouncementAutoPostStatus ? (
        <div className="stream-announcement-status" role="status">
          {streamAnnouncementAutoPostStatus}
        </div>
      ) : null}
      <div className="stream-announcement-preview">
        <span>Announcement preview</span>
        <p>{streamAnnouncementPreview.text}</p>
        {streamAnnouncementPreview.sensitiveValueRemoved ? (
          <strong>sensitive value removed</strong>
        ) : null}
        {streamAnnouncementPreview.truncated ? (
          <strong>announcement shortened to Discord limit</strong>
        ) : null}
      </div>

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
          <div className="platform-status-grid">
            <span>Broadcast {profile.platformPublishing.youtubeBroadcastStatus || "unknown"}</span>
            <span>
              Bound {profile.platformPublishing.youtubeBroadcastBoundStreamId || "unknown"} / app{" "}
              {profile.platformPublishing.youtubeStreamId || "unknown"}
            </span>
            <span>
              Privacy {profile.platformPublishing.youtubeBroadcastPrivacyStatus || "unknown"} / app{" "}
              {profile.platformPublishing.privacyStatus}
            </span>
            <span>Stream {profile.platformPublishing.youtubeStreamStatus || "unknown"}</span>
            <span>Health {profile.platformPublishing.youtubeStreamHealthStatus || "unknown"}</span>
            <span>Checked {formatStatusCheckedAt(profile.platformPublishing.youtubeStatusCheckedAt)}</span>
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
            onClick={onPlatformPublishingStatusRefresh}
          >
            Refresh Status
          </button>
          <div className="broadcast-transition-row">
            {(["testing", "live", "complete"] as YouTubeBroadcastTransitionStatus[]).map((broadcastStatus) => {
              const report = youtubeTransitionReport(broadcastStatus);
              return (
                <button
                  key={broadcastStatus}
                  className={`segmented-button ${report.status}`}
                  type="button"
                  title={report.primaryAction}
                  disabled={locked || !report.canProceed}
                  onClick={() => onYouTubeBroadcastTransition(broadcastStatus)}
                >
                  {broadcastStatus === "testing" ? "Test" : broadcastStatus === "live" ? "Live" : "Complete"}
                </button>
              );
            })}
          </div>
          <YouTubeTransitionPreflightList
            reports={(["testing", "live", "complete"] as YouTubeBroadcastTransitionStatus[]).map((transitionStatus) => ({
              transitionStatus,
              report: youtubeTransitionReport(transitionStatus)
            }))}
          />
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
          <div className="platform-status-grid">
            <span>Status {profile.platformPublishing.twitchLiveStatus || "unknown"}</span>
            <span>
              Title {profile.platformPublishing.twitchChannelTitle || "unknown"} / app{" "}
              {profile.platformPublishing.title || "unknown"}
            </span>
            <span>
              Category {profile.platformPublishing.twitchChannelCategory || "unknown"}{" "}
              {profile.platformPublishing.twitchChannelCategoryId
                ? `(${profile.platformPublishing.twitchChannelCategoryId})`
                : "(no id)"}{" "}
              / app {profile.platformPublishing.twitchCategory || "unknown"}{" "}
              {profile.platformPublishing.twitchCategoryId ? `(${profile.platformPublishing.twitchCategoryId})` : "(no id)"}
            </span>
            <span>
              Language {profile.platformPublishing.twitchChannelLanguage || "unknown"} / app{" "}
              {profile.platformPublishing.twitchLanguage || "unknown"}
            </span>
            <span>Viewers {profile.platformPublishing.twitchViewerCount.toLocaleString()}</span>
            <span>Started {profile.platformPublishing.twitchStartedAt || "offline"}</span>
            <span>Checked {formatStatusCheckedAt(profile.platformPublishing.twitchStatusCheckedAt)}</span>
          </div>
          <button
            className="secondary-action compact-action platform-wide-action"
            type="button"
            disabled={locked}
            onClick={onPlatformPublishingStatusRefresh}
          >
            Refresh Status
          </button>
        </>
      ) : null}

      <div className="secret-tools">
        <span>{platformApiOperationLabel ? `Running ${platformApiOperationLabel}. ${platformPublishingStatus}` : platformPublishingStatus}</span>
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
        <span>Quality preset</span>
        <select
          value={activeQualityPreset?.id ?? "quality-custom"}
          disabled={locked}
          onChange={(event) => {
            const quality = qualityProfiles.find((item) => item.id === event.target.value);
            if (quality) {
              onProfileChange({ ...profile, quality });
            }
          }}
        >
          {!activeQualityPreset ? <option value="quality-custom">Custom</option> : null}
          {qualityProfiles.map((quality) => (
            <option key={quality.id} value={quality.id}>
              {quality.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="quality-custom-settings" disabled={locked}>
        <legend>Custom quality</legend>
        <div className="quality-custom-grid">
          <label className="field">
            <span>Resolution</span>
            <select
              value={activeQualityResolution?.id ?? "current"}
              onChange={(event) => {
                const resolution = qualityResolutionOptions.find((item) => item.id === event.target.value);
                if (resolution) {
                  updateQuality({ width: resolution.width, height: resolution.height });
                }
              }}
            >
              {!activeQualityResolution ? (
                <option value="current">
                  {profile.quality.width}x{profile.quality.height}
                </option>
              ) : null}
              {qualityResolutionOptions.map((resolution) => (
                <option key={resolution.id} value={resolution.id}>
                  {resolution.label} ({resolution.width}x{resolution.height})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Frame rate</span>
            <select value={profile.quality.fps} onChange={(event) => updateQuality({ fps: Number(event.target.value) as 30 | 60 })}>
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </label>

          <label className="field quality-range-field">
            <span>
              Video bitrate
              <output>{profile.quality.videoBitrateKbps} kbps</output>
            </span>
            <input
              type="range"
              min={qualitySettingsLimits.videoBitrateKbps.min}
              max={qualitySettingsLimits.videoBitrateKbps.max}
              step={qualitySettingsLimits.videoBitrateKbps.step}
              value={profile.quality.videoBitrateKbps}
              onChange={(event) => updateQuality({ videoBitrateKbps: Number(event.target.value) })}
            />
          </label>

          <label className="field quality-range-field">
            <span>
              Audio bitrate
              <output>{profile.quality.audioBitrateKbps} kbps</output>
            </span>
            <input
              type="range"
              min={qualitySettingsLimits.audioBitrateKbps.min}
              max={qualitySettingsLimits.audioBitrateKbps.max}
              step={qualitySettingsLimits.audioBitrateKbps.step}
              value={profile.quality.audioBitrateKbps}
              onChange={(event) => updateQuality({ audioBitrateKbps: Number(event.target.value) })}
            />
          </label>
        </div>
      </fieldset>

      <div className="quality-readout" aria-live="polite">
        <span>
          <small>Output</small>
          <strong>{profile.quality.width}x{profile.quality.height}</strong>
        </span>
        <span>
          <small>Frame rate</small>
          <strong>{profile.quality.fps} fps</strong>
        </span>
        <span>
          <small>Video</small>
          <strong>{profile.quality.videoBitrateKbps} kbps</strong>
        </span>
        <span>
          <small>Audio</small>
          <strong>{profile.quality.audioBitrateKbps} kbps</strong>
        </span>
        <span>
          <small>Upload target</small>
          <strong>{estimatedUploadKbps} kbps</strong>
        </span>
      </div>

      <div className="segmented-control">
        <button
          className={`segmented-button ${profile.androidPublisherMode !== "mediacodec" ? "active" : ""}`}
          type="button"
          disabled={locked}
          onClick={() => updateAndroidPublisherMode("rootencoder")}
        >
          RootEncoder
        </button>
        <button
          className={`segmented-button ${profile.androidPublisherMode === "mediacodec" ? "active" : ""}`}
          type="button"
          disabled={locked}
          onClick={() => updateAndroidPublisherMode("mediacodec")}
        >
          MediaCodec
        </button>
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

const YouTubeTransitionPreflightList = ({
  reports
}: {
  reports: Array<{
    transitionStatus: YouTubeBroadcastTransitionStatus;
    report: PlatformPublishingPreflightReport;
  }>;
}) => (
  <div className="youtube-transition-preflights">
    {reports.map(({ transitionStatus, report }) => (
      <span key={transitionStatus} className={`youtube-transition-preflight ${report.status}`}>
        {transitionStatus === "testing" ? "Test" : transitionStatus === "live" ? "Live" : "Complete"}:{" "}
        {report.issues[0]?.message ?? report.summary}
      </span>
    ))}
  </div>
);

const formatStatusCheckedAt = (value: string): string => {
  if (!value) {
    return "never";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "invalid";
  }
  return new Date(timestamp).toLocaleString();
};
