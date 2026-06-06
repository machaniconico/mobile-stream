import { Settings } from "lucide-react";
import { defaultDestinationProfile, qualityProfiles, type StudioProfile, type StreamProtocol } from "../domain/profiles";
import { PanelTitle, ProtocolBadge } from "./ui";

interface LiveSetupScreenProps {
  profile: StudioProfile;
  onProfileChange(profile: StudioProfile): void;
}

export const LiveSetupScreen = ({ profile, onProfileChange }: LiveSetupScreenProps) => {
  const updateDestination = (update: Partial<StudioProfile["destination"]>) => {
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
        <input value={profile.destination.serverUrl} onChange={(event) => updateDestination({ serverUrl: event.target.value })} />
      </label>

      <label className="field">
        <span>Stream key</span>
        <input
          value={profile.destination.streamKey}
          type="password"
          autoComplete="off"
          onChange={(event) => updateDestination({ streamKey: event.target.value })}
        />
      </label>

      <label className="field">
        <span>Quality</span>
        <select
          value={profile.quality.id}
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
    </section>
  );
};
