export type PlatformPublishingFreshnessStatus = "fresh" | "missing" | "invalid" | "stale" | "not-applicable";

export type PlatformPublishingFreshnessPlatform = "youtube-live" | "twitch" | "custom";

export interface PlatformPublishingFreshnessInput {
  platform?: PlatformPublishingFreshnessPlatform | string;
  youtube?: {
    statusCheckedAt: string;
  } | null;
  twitch?: {
    statusCheckedAt: string;
  } | null;
}

export interface PlatformPublishingFreshness {
  status: PlatformPublishingFreshnessStatus;
  platformLabel: string;
  checkedAt: string;
  ageMinutes: number | null;
  summary: string;
  recommendation: string;
}

export const platformPublishingDashboardMaxAgeMinutes = 10;
const platformPublishingDashboardFutureSkewToleranceMs = 2 * 60 * 1000;

export const resolvePlatformPublishingFreshnessPlatform = (
  platform: string | null | undefined
): PlatformPublishingFreshnessPlatform => {
  const normalized = (platform ?? "").trim().toLowerCase();
  if (normalized === "youtube-live" || normalized.includes("youtube")) {
    return "youtube-live";
  }
  if (normalized === "twitch" || normalized.includes("twitch")) {
    return "twitch";
  }
  return "custom";
};

export const assessPlatformPublishingFreshness = (
  publishing: PlatformPublishingFreshnessInput | null | undefined,
  now = new Date()
): PlatformPublishingFreshness => {
  const platform = resolvePlatformPublishingFreshnessPlatform(publishing?.platform);
  const platformLabel = platform === "youtube-live" ? "YouTube" : platform === "twitch" ? "Twitch" : "Custom";

  if (!publishing || platform === "custom") {
    return {
      status: "not-applicable",
      platformLabel,
      checkedAt: "",
      ageMinutes: null,
      summary: `${platformLabel} dashboard freshness is tracked outside first-party app APIs.`,
      recommendation: "Keep the external destination dashboard snapshot with the validation evidence."
    };
  }

  const checkedAt =
    platform === "youtube-live"
      ? publishing.youtube?.statusCheckedAt ?? ""
      : platform === "twitch"
        ? publishing.twitch?.statusCheckedAt ?? ""
        : "";

  if (!checkedAt.trim()) {
    return {
      status: "missing",
      platformLabel,
      checkedAt: "",
      ageMinutes: null,
      summary: `${platformLabel} dashboard status has no checked-at timestamp.`,
      recommendation: `Refresh ${platformLabel} status during the private validation run and retain the checked-at timestamp.`
    };
  }

  const checkedTimestamp = Date.parse(checkedAt);
  const nowTimestamp = now.getTime();
  if (!Number.isFinite(checkedTimestamp) || !Number.isFinite(nowTimestamp)) {
    return {
      status: "invalid",
      platformLabel,
      checkedAt,
      ageMinutes: null,
      summary: `${platformLabel} dashboard status timestamp is invalid.`,
      recommendation: `Refresh ${platformLabel} status before recording release-candidate evidence.`
    };
  }
  if (checkedTimestamp - nowTimestamp > platformPublishingDashboardFutureSkewToleranceMs) {
    return {
      status: "invalid",
      platformLabel,
      checkedAt,
      ageMinutes: null,
      summary: `${platformLabel} dashboard status timestamp is invalid.`,
      recommendation: `Refresh ${platformLabel} status before recording release-candidate evidence.`
    };
  }

  const ageMinutes = Math.floor(Math.max(0, nowTimestamp - checkedTimestamp) / 60000);
  if (ageMinutes <= platformPublishingDashboardMaxAgeMinutes) {
    return {
      status: "fresh",
      platformLabel,
      checkedAt,
      ageMinutes,
      summary: `${platformLabel} dashboard status was checked ${ageMinutes} minutes ago.`,
      recommendation: "Keep this fresh dashboard snapshot with the release-candidate validation run."
    };
  }

  return {
    status: "stale",
    platformLabel,
    checkedAt,
    ageMinutes,
    summary: `${platformLabel} dashboard status is ${ageMinutes} minutes old.`,
    recommendation: `Refresh ${platformLabel} status within ${platformPublishingDashboardMaxAgeMinutes} minutes of recording release-candidate evidence.`
  };
};

export const isPlatformPublishingFreshEnoughForRelease = (freshness: PlatformPublishingFreshness): boolean =>
  freshness.status === "fresh" || freshness.status === "not-applicable";
