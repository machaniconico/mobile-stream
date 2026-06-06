import { Settings, ShieldCheck } from "lucide-react";
import { defaultDestinationProfile, qualityProfiles, type StudioProfile, type StreamProtocol } from "../domain/profiles";
import type { ReadinessReport } from "../domain/readiness";
import { PanelTitle, ProtocolBadge } from "./ui";

interface LiveSetupScreenProps {
  profile: StudioProfile;
  readiness: ReadinessReport;
  locked: boolean;
  onProfileChange(profile: StudioProfile): void;
}

export const LiveSetupScreen = ({ profile, readiness, locked, onProfileChange }: LiveSetupScreenProps) => {
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

  return (
    <section className="control-panel">
      <PanelTitle icon={<Settings size={18} />} title="Live Setup" />
      <div className="protocol-row" role="group" aria-label="protocol">
        {(["rtmp", "rtmps"] as StreamProtocol[]).map((protocol) => (
          <button
            key={protocol}
            className={`segmented-button ${profile.destination.protocol === protocol ? "active" : ""}`}
            type="button"
            disabled={locked}
            onClick={() =>
              updateDestination({
                protocol,
                serverUrl:
                  protocol === "rtmps"
                    ? defaultDestinationProfile.serverUrl
                    : defaultDestinationProfile.serverUrl.replace("rtmps://", "rtmp://")
              })
            }
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
          onChange={(event) => updateDestination({ serverUrl: event.target.value })}
        />
      </label>

      <label className="field">
        <span>Stream key</span>
        <input
          value={profile.destination.streamKey}
          type="password"
          autoComplete="off"
          disabled={locked}
          onChange={(event) => updateDestination({ streamKey: event.target.value })}
        />
      </label>

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
