import {
  getPlatformHttpFailureMetadata,
  normalizePlatformChatAuthSession,
  type PlatformChatAuthSession,
  type PlatformChatFetch
} from "./platformChatConnection";
import type { PlatformChatPlatform } from "./platformChat";

export interface PlatformChatOAuthSettings {
  youtubeClientId: string;
  youtubeRedirectUri: string;
  twitchClientId: string;
  twitchRedirectUri: string;
  callbackUrl: string;
}

export interface PlatformChatOAuthFlow {
  platform: PlatformChatPlatform;
  authorizationUrl: string;
  state: string;
  codeVerifier: string | null;
  createdAt: number;
}

export interface TwitchDeviceCodeOAuthFlow {
  platform: "twitch";
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalMs: number;
  createdAt: number;
  lastPollAt: number | null;
}

export interface PlatformChatOAuthCredential {
  platform: PlatformChatPlatform;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scopes: string[];
  twitchLogin: string | null;
  twitchUserId: string | null;
  validatedAt: number | null;
  clientId: string | null;
  redirectUri: string | null;
}

export interface PlatformChatOAuthCredentialStore {
  youtube: PlatformChatOAuthCredential | null;
  twitch: PlatformChatOAuthCredential | null;
}

export type PlatformChatOAuthCredentialHealthStatus =
  | "ready"
  | "missing-credential"
  | "wrong-platform"
  | "expired"
  | "expires-soon"
  | "unknown-scopes"
  | "missing-scopes";

export interface PlatformChatOAuthCredentialHealth {
  status: PlatformChatOAuthCredentialHealthStatus;
  severity: "pass" | "warn" | "fail";
  platform: PlatformChatPlatform;
  purposeLabel: string;
  requiredScopes: string[];
  missingScopes: string[];
  message: string;
  recommendation: string;
}

export interface PlatformChatOAuthResult {
  credential: PlatformChatOAuthCredential;
  auth: PlatformChatAuthSession;
  message: string;
}

export interface TwitchDeviceCodeOAuthStartResult {
  flow: TwitchDeviceCodeOAuthFlow;
  message: string;
}

export type TwitchDeviceCodeOAuthPollResult =
  | {
      status: "pending";
      flow: TwitchDeviceCodeOAuthFlow;
      message: string;
    }
  | {
      status: "authorized";
      credential: PlatformChatOAuthCredential;
      auth: PlatformChatAuthSession;
      message: string;
    };

export class PlatformChatOAuthError extends Error {
  readonly statusCode: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    {
      statusCode = null,
      retryable = false,
      retryAfterMs = null
    }: {
      statusCode?: number | null;
      retryable?: boolean;
      retryAfterMs?: number | null;
    } = {}
  ) {
    super(message);
    this.name = "PlatformChatOAuthError";
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

const YOUTUBE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_DEVICE_URL = "https://id.twitch.tv/oauth2/device";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
export const YOUTUBE_LIVE_CHAT_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const YOUTUBE_LIVE_MANAGE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
export const TWITCH_CHAT_SCOPE = "chat:read";
export const TWITCH_STREAM_KEY_SCOPE = "channel:read:stream_key";
export const TWITCH_CHANNEL_MANAGE_SCOPE = "channel:manage:broadcast";
const TWITCH_REQUIRED_SCOPES = `${TWITCH_CHAT_SCOPE} ${TWITCH_STREAM_KEY_SCOPE} ${TWITCH_CHANNEL_MANAGE_SCOPE}`;

export const createDefaultPlatformChatOAuthSettings = (): PlatformChatOAuthSettings => ({
  youtubeClientId: "",
  youtubeRedirectUri: "com.mobilelivecaster.app:/oauth/youtube",
  twitchClientId: "",
  twitchRedirectUri: "mobilelivecaster://oauth/twitch",
  callbackUrl: ""
});

export const normalizePlatformChatOAuthSettings = (
  settings: Partial<PlatformChatOAuthSettings> | null | undefined
): PlatformChatOAuthSettings => ({
  youtubeClientId: normalizeSingleLine(settings?.youtubeClientId).slice(0, 180),
  youtubeRedirectUri: normalizeSingleLine(settings?.youtubeRedirectUri || createDefaultPlatformChatOAuthSettings().youtubeRedirectUri).slice(0, 300),
  twitchClientId: normalizeSingleLine(settings?.twitchClientId).slice(0, 180),
  twitchRedirectUri: normalizeSingleLine(settings?.twitchRedirectUri || createDefaultPlatformChatOAuthSettings().twitchRedirectUri).slice(0, 300),
  callbackUrl: normalizeSingleLine(settings?.callbackUrl).slice(0, 2000)
});

export const createPlatformChatOAuthFlow = (
  platform: PlatformChatPlatform,
  settings: PlatformChatOAuthSettings,
  createdAt: number = Date.now()
): PlatformChatOAuthFlow => {
  const normalized = normalizePlatformChatOAuthSettings(settings);
  const state = createOAuthNonce(18);

  if (platform === "youtube") {
    if (!normalized.youtubeClientId || !normalized.youtubeRedirectUri) {
      throw new PlatformChatOAuthError("YouTube OAuth client ID and redirect URI are required.");
    }
    const codeVerifier = createPkceCodeVerifier();
    const params = createQueryParams({
      client_id: normalized.youtubeClientId,
      redirect_uri: normalized.youtubeRedirectUri,
      response_type: "code",
      scope: `${YOUTUBE_LIVE_CHAT_SCOPE} ${YOUTUBE_LIVE_MANAGE_SCOPE}`,
      state,
      code_challenge: createPkceS256Challenge(codeVerifier),
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent"
    });

    return {
      platform,
      authorizationUrl: `${YOUTUBE_AUTH_URL}?${params}`,
      state,
      codeVerifier,
      createdAt
    };
  }

  if (!normalized.twitchClientId || !normalized.twitchRedirectUri) {
    throw new PlatformChatOAuthError("Twitch OAuth client ID and redirect URI are required.");
  }

  const params = createQueryParams({
    client_id: normalized.twitchClientId,
    redirect_uri: normalized.twitchRedirectUri,
    response_type: "token",
    scope: TWITCH_REQUIRED_SCOPES,
    state
  });

  return {
    platform,
    authorizationUrl: `${TWITCH_AUTH_URL}?${params}`,
    state,
    codeVerifier: null,
    createdAt
  };
};

export const startTwitchDeviceCodeOAuthFlow = async (
  settings: PlatformChatOAuthSettings,
  fetcher: PlatformChatFetch,
  receivedAt: number = Date.now()
): Promise<TwitchDeviceCodeOAuthStartResult> => {
  const normalized = normalizePlatformChatOAuthSettings(settings);
  if (!normalized.twitchClientId) {
    throw new PlatformChatOAuthError("Twitch OAuth client ID is required.");
  }

  const response = await fetcher(TWITCH_DEVICE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: createQueryParams({
      client_id: normalized.twitchClientId,
      scopes: TWITCH_REQUIRED_SCOPES
    })
  });
  assertPlatformChatOAuthResponseOk(response, "Twitch device OAuth start");
  const payload = await readPlatformChatOAuthJson(response, "Twitch device OAuth start");

  const deviceCode = readStringField(payload, "device_code");
  const userCode = readStringField(payload, "user_code");
  const verificationUri =
    readStringField(payload, "verification_uri_complete") || readStringField(payload, "verification_uri");
  const expiresIn = readNumberField(payload, "expires_in");
  const interval = readNumberField(payload, "interval") ?? 5;

  if (!deviceCode || !userCode || !verificationUri || !expiresIn) {
    throw new PlatformChatOAuthError("Twitch device OAuth response was incomplete.");
  }

  const flow: TwitchDeviceCodeOAuthFlow = {
    platform: "twitch",
    deviceCode,
    userCode,
    verificationUri,
    expiresAt: receivedAt + expiresIn * 1000,
    intervalMs: Math.max(1000, interval * 1000),
    createdAt: receivedAt,
    lastPollAt: null
  };

  return {
    flow,
    message: `Twitch device OAuth started. User code: ${userCode}`
  };
};

export const pollTwitchDeviceCodeOAuthFlow = async (
  flow: TwitchDeviceCodeOAuthFlow | null,
  settings: PlatformChatOAuthSettings,
  fetcher: PlatformChatFetch,
  receivedAt: number = Date.now()
): Promise<TwitchDeviceCodeOAuthPollResult> => {
  const normalized = normalizePlatformChatOAuthSettings(settings);
  if (!flow) {
    throw new PlatformChatOAuthError("Start Twitch device OAuth before checking authorization.");
  }
  if (!normalized.twitchClientId) {
    throw new PlatformChatOAuthError("Twitch OAuth client ID is required.");
  }
  if (receivedAt >= flow.expiresAt) {
    throw new PlatformChatOAuthError("Twitch device OAuth code expired. Start a new device authorization.");
  }
  if (flow.lastPollAt && receivedAt - flow.lastPollAt < flow.intervalMs) {
    const waitSeconds = Math.ceil((flow.intervalMs - (receivedAt - flow.lastPollAt)) / 1000);
    return {
      status: "pending",
      flow,
      message: `Twitch device OAuth is waiting. Try again in ${waitSeconds}s.`
    };
  }

  const response = await fetcher(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: createQueryParams({
      client_id: normalized.twitchClientId,
      scopes: TWITCH_REQUIRED_SCOPES,
      device_code: flow.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    })
  });
  const nextFlow: TwitchDeviceCodeOAuthFlow = {
    ...flow,
    lastPollAt: receivedAt
  };

  if (!response.ok) {
    const payload = await readOptionalPlatformChatOAuthJson(response);
    const errorCode = readStringField(payload, "message") || readStringField(payload, "error");
    if (errorCode === "authorization_pending") {
      return {
        status: "pending",
        flow: nextFlow,
        message: "Twitch device OAuth is still pending."
      };
    }
    if (errorCode === "slow_down") {
      return {
        status: "pending",
        flow: {
          ...nextFlow,
          intervalMs: nextFlow.intervalMs + 5000
        },
        message: "Twitch requested slower device OAuth polling."
      };
    }
    throw new PlatformChatOAuthError(
      `Twitch device OAuth token request failed with HTTP ${response.status}.`,
      getPlatformHttpFailureMetadata(response)
    );
  }

  const payload = await readPlatformChatOAuthJson(response, "Twitch device OAuth token request");
  const token = normalizeTokenPayload("twitch", payload, receivedAt);
  const credential = await hydrateTwitchCredential(token, normalized.twitchClientId, null, fetcher, receivedAt);
  const auth = createPlatformChatAuthFromCredential(credential);

  return {
    status: "authorized",
    credential,
    auth,
    message: credential.refreshToken
      ? "Twitch device OAuth connected with refresh token storage support."
      : "Twitch device OAuth connected."
  };
};

export const completePlatformChatOAuthCallback = async (
  callbackUrl: string,
  flow: PlatformChatOAuthFlow | null,
  settings: PlatformChatOAuthSettings,
  fetcher: PlatformChatFetch,
  receivedAt: number = Date.now()
): Promise<PlatformChatOAuthResult> => {
  if (!flow) {
    throw new PlatformChatOAuthError("Start OAuth before applying the callback URL.");
  }

  const callback = parseOAuthCallback(callbackUrl);
  if (callback.error) {
    throw new PlatformChatOAuthError(callback.errorDescription || callback.error);
  }
  if (callback.state !== flow.state) {
    throw new PlatformChatOAuthError("OAuth state mismatch. Start a new authorization request.");
  }

  if (flow.platform === "youtube") {
    if (!callback.code || !flow.codeVerifier) {
      throw new PlatformChatOAuthError("YouTube callback does not contain an authorization code.");
    }

    const token = await exchangeYouTubeOAuthCode(callback.code, flow.codeVerifier, settings, fetcher, receivedAt);
    const auth = normalizePlatformChatAuthSession({
      youtubeAccessToken: token.accessToken
    });

    return {
      credential: token,
      auth,
      message: token.refreshToken
        ? "YouTube OAuth connected. Refresh token was returned for secure native storage."
        : "YouTube OAuth connected for this session."
    };
  }

  if (!callback.accessToken) {
    throw new PlatformChatOAuthError("Twitch callback does not contain an access token.");
  }

  const normalizedSettings = normalizePlatformChatOAuthSettings(settings);
  const token = {
    ...(await validateTwitchOAuthToken(callback.accessToken, fetcher, receivedAt)),
    clientId: normalizedSettings.twitchClientId || null,
    redirectUri: normalizedSettings.twitchRedirectUri || null
  };
  const auth = normalizePlatformChatAuthSession({
    twitchOauthToken: token.accessToken,
    twitchLogin: token.twitchLogin ?? ""
  });

  return {
    credential: token,
    auth,
    message: "Twitch OAuth connected for this session."
  };
};

export const parseOAuthCallback = (callbackUrl: string) => {
  const trimmed = normalizeSingleLine(callbackUrl);
  if (!trimmed) {
    throw new PlatformChatOAuthError("Paste the OAuth callback URL first.");
  }

  const queryAndHash = [trimmed.split("?")[1]?.split("#")[0] ?? "", trimmed.split("#")[1] ?? ""]
    .filter(Boolean)
    .join("&");
  const params = new URLSearchParams(queryAndHash);

  return {
    code: params.get("code"),
    accessToken: params.get("access_token"),
    state: params.get("state"),
    error: params.get("error"),
    errorDescription: params.get("error_description"),
    scopes: normalizeScopes(params.get("scope") ?? "")
  };
};

export const exchangeYouTubeOAuthCode = async (
  code: string,
  codeVerifier: string,
  settings: PlatformChatOAuthSettings,
  fetcher: PlatformChatFetch,
  receivedAt: number = Date.now()
): Promise<PlatformChatOAuthCredential> => {
  const normalized = normalizePlatformChatOAuthSettings(settings);
  if (!normalized.youtubeClientId || !normalized.youtubeRedirectUri) {
    throw new PlatformChatOAuthError("YouTube OAuth client ID and redirect URI are required.");
  }

  const response = await fetcher(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: createQueryParams({
      client_id: normalized.youtubeClientId,
      redirect_uri: normalized.youtubeRedirectUri,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code"
    })
  });

  assertPlatformChatOAuthResponseOk(response, "YouTube token exchange");
  const payload = await readPlatformChatOAuthJson(response, "YouTube token exchange");

  return {
    ...normalizeTokenPayload("youtube", payload, receivedAt),
    clientId: normalized.youtubeClientId,
    redirectUri: normalized.youtubeRedirectUri
  };
};

export const refreshYouTubeOAuthCredential = async (
  credential: PlatformChatOAuthCredential,
  settings: PlatformChatOAuthSettings,
  fetcher: PlatformChatFetch,
  receivedAt: number = Date.now()
): Promise<PlatformChatOAuthCredential> => {
  const normalizedCredential = normalizePlatformChatOAuthCredential(credential);
  const normalizedSettings = normalizePlatformChatOAuthSettings(settings);
  const clientId = normalizedSettings.youtubeClientId || normalizedCredential?.clientId || "";
  const redirectUri = normalizedCredential?.redirectUri || normalizedSettings.youtubeRedirectUri || null;

  if (!normalizedCredential || normalizedCredential.platform !== "youtube" || !normalizedCredential.refreshToken) {
    throw new PlatformChatOAuthError("A YouTube refresh token is required.");
  }
  if (!clientId) {
    throw new PlatformChatOAuthError("YouTube OAuth client ID is required.");
  }

  const response = await fetcher(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: createQueryParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: normalizedCredential.refreshToken
    })
  });
  assertPlatformChatOAuthResponseOk(response, "YouTube token refresh");
  const payload = await readPlatformChatOAuthJson(response, "YouTube token refresh");

  const refreshed = normalizeTokenPayload("youtube", payload, receivedAt);
  return {
    ...refreshed,
    refreshToken: refreshed.refreshToken ?? normalizedCredential.refreshToken,
    scopes: refreshed.scopes.length > 0 ? refreshed.scopes : normalizedCredential.scopes,
    clientId,
    redirectUri
  };
};

export const refreshTwitchOAuthCredential = async (
  credential: PlatformChatOAuthCredential,
  settings: PlatformChatOAuthSettings,
  fetcher: PlatformChatFetch,
  receivedAt: number = Date.now()
): Promise<PlatformChatOAuthCredential> => {
  const normalizedCredential = normalizePlatformChatOAuthCredential(credential);
  const normalizedSettings = normalizePlatformChatOAuthSettings(settings);
  const clientId = normalizedSettings.twitchClientId || normalizedCredential?.clientId || "";

  if (!normalizedCredential || normalizedCredential.platform !== "twitch" || !normalizedCredential.refreshToken) {
    throw new PlatformChatOAuthError("A Twitch refresh token is required.");
  }
  if (!clientId) {
    throw new PlatformChatOAuthError("Twitch OAuth client ID is required.");
  }

  const response = await fetcher(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: createQueryParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: normalizedCredential.refreshToken
    })
  });
  assertPlatformChatOAuthResponseOk(response, "Twitch token refresh");
  const payload = await readPlatformChatOAuthJson(response, "Twitch token refresh");

  const refreshed = normalizeTokenPayload("twitch", payload, receivedAt);
  return hydrateTwitchCredential(
    {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? normalizedCredential.refreshToken,
      scopes: refreshed.scopes.length > 0 ? refreshed.scopes : normalizedCredential.scopes
    },
    clientId,
    normalizedCredential.redirectUri,
    fetcher,
    receivedAt
  );
};

export const validateTwitchOAuthToken = async (
  accessToken: string,
  fetcher: PlatformChatFetch,
  receivedAt: number = Date.now()
): Promise<PlatformChatOAuthCredential> => {
  const token = normalizeSingleLine(accessToken).replace(/^Bearer\s+/i, "").replace(/^OAuth\s+/i, "");
  if (!token) {
    throw new PlatformChatOAuthError("Twitch access token is required.");
  }

  const response = await fetcher(TWITCH_VALIDATE_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `OAuth ${token}`
    }
  });
  assertPlatformChatOAuthResponseOk(response, "Twitch token validation");
  const payload = await readPlatformChatOAuthJson(response, "Twitch token validation");

  return {
    platform: "twitch",
    accessToken: token,
    refreshToken: null,
    expiresAt: secondsToExpiresAt(readNumberField(payload, "expires_in"), receivedAt),
    scopes: readStringArrayField(payload, "scopes"),
    twitchLogin: readStringField(payload, "login"),
    twitchUserId: readStringField(payload, "user_id"),
    validatedAt: receivedAt,
    clientId: null,
    redirectUri: null
  };
};

export const normalizePlatformChatOAuthCredential = (
  credential: Partial<PlatformChatOAuthCredential> | null | undefined
): PlatformChatOAuthCredential | null => {
  const platform = credential?.platform === "twitch" ? "twitch" : credential?.platform === "youtube" ? "youtube" : null;
  const accessToken = normalizeSingleLine(credential?.accessToken);
  if (!platform || !accessToken) {
    return null;
  }

  return {
    platform,
    accessToken,
    refreshToken: normalizeSingleLine(credential?.refreshToken) || null,
    expiresAt: normalizeTimestamp(credential?.expiresAt),
    scopes: Array.isArray(credential?.scopes) ? credential.scopes.map(normalizeSingleLine).filter(Boolean).slice(0, 24) : [],
    twitchLogin: normalizeSingleLine(credential?.twitchLogin) || null,
    twitchUserId: normalizeSingleLine(credential?.twitchUserId) || null,
    validatedAt: normalizeTimestamp(credential?.validatedAt),
    clientId: normalizeSingleLine(credential?.clientId) || null,
    redirectUri: normalizeSingleLine(credential?.redirectUri) || null
  };
};

export const createEmptyPlatformChatOAuthCredentialStore = (): PlatformChatOAuthCredentialStore => ({
  youtube: null,
  twitch: null
});

export const normalizePlatformChatOAuthCredentialStore = (
  value: Partial<PlatformChatOAuthCredentialStore> | Partial<PlatformChatOAuthCredential> | null | undefined
): PlatformChatOAuthCredentialStore => {
  const singleCredential = normalizePlatformChatOAuthCredential(value as Partial<PlatformChatOAuthCredential>);
  if (singleCredential) {
    return {
      ...createEmptyPlatformChatOAuthCredentialStore(),
      [singleCredential.platform]: singleCredential
    };
  }

  const maybeStore = value as Partial<PlatformChatOAuthCredentialStore> | null | undefined;
  return {
    youtube: normalizePlatformChatOAuthCredential(maybeStore?.youtube),
    twitch: normalizePlatformChatOAuthCredential(maybeStore?.twitch)
  };
};

export const upsertPlatformChatOAuthCredential = (
  store: Partial<PlatformChatOAuthCredentialStore> | null | undefined,
  credential: PlatformChatOAuthCredential | null | undefined
): PlatformChatOAuthCredentialStore => {
  const normalizedStore = normalizePlatformChatOAuthCredentialStore(store);
  const normalizedCredential = normalizePlatformChatOAuthCredential(credential);
  if (!normalizedCredential) {
    return normalizedStore;
  }
  return {
    ...normalizedStore,
    [normalizedCredential.platform]: normalizedCredential
  };
};

export const removePlatformChatOAuthCredential = (
  store: Partial<PlatformChatOAuthCredentialStore> | null | undefined,
  platform: PlatformChatPlatform
): PlatformChatOAuthCredentialStore => ({
  ...normalizePlatformChatOAuthCredentialStore(store),
  [platform]: null
});

export const getPlatformChatOAuthCredential = (
  store: Partial<PlatformChatOAuthCredentialStore> | null | undefined,
  platform: PlatformChatPlatform
): PlatformChatOAuthCredential | null => normalizePlatformChatOAuthCredentialStore(store)[platform];

export const createPlatformChatAuthFromCredentialStore = (
  store: Partial<PlatformChatOAuthCredentialStore> | null | undefined
): PlatformChatAuthSession => {
  const normalized = normalizePlatformChatOAuthCredentialStore(store);
  return normalizePlatformChatAuthSession({
    youtubeAccessToken: normalized.youtube?.accessToken ?? "",
    twitchOauthToken: normalized.twitch?.accessToken ?? "",
    twitchLogin: normalized.twitch?.twitchLogin ?? ""
  });
};

export const assessPlatformChatOAuthCredentialHealth = (
  credential: PlatformChatOAuthCredential | null | undefined,
  {
    platform,
    requiredScopes,
    purposeLabel,
    now = Date.now(),
    leewayMs = 120000,
    missingCredentialSeverity = "fail",
    unknownScopesSeverity = "warn"
  }: {
    platform: PlatformChatPlatform;
    requiredScopes: string[];
    purposeLabel: string;
    now?: number;
    leewayMs?: number;
    missingCredentialSeverity?: "warn" | "fail";
    unknownScopesSeverity?: "warn" | "fail";
  }
): PlatformChatOAuthCredentialHealth => {
  const normalized = normalizePlatformChatOAuthCredential(credential);
  const normalizedScopes = uniqueScopes(requiredScopes);
  const label = normalizeSingleLine(purposeLabel) || `${platformLabel(platform)} OAuth`;

  if (!normalized) {
    return {
      status: "missing-credential",
      severity: missingCredentialSeverity,
      platform,
      purposeLabel: label,
      requiredScopes: normalizedScopes,
      missingScopes: normalizedScopes,
      message: `${label} OAuth credential is not stored.`,
      recommendation: `Reconnect ${platformLabel(platform)} OAuth before using ${label}.`
    };
  }

  if (normalized.platform !== platform) {
    return {
      status: "wrong-platform",
      severity: "fail",
      platform,
      purposeLabel: label,
      requiredScopes: normalizedScopes,
      missingScopes: normalizedScopes,
      message: `${label} requires ${platformLabel(platform)} OAuth, but the stored credential is for ${platformLabel(normalized.platform)}.`,
      recommendation: `Reconnect ${platformLabel(platform)} OAuth before using ${label}.`
    };
  }

  if (normalizedScopes.length > 0 && normalized.scopes.length === 0) {
    return {
      status: "unknown-scopes",
      severity: unknownScopesSeverity,
      platform,
      purposeLabel: label,
      requiredScopes: normalizedScopes,
      missingScopes: normalizedScopes,
      message: `${label} OAuth scope evidence is not retained.`,
      recommendation: `Reconnect ${platformLabel(platform)} OAuth so required scopes are retained: ${normalizedScopes.join(", ")}.`
    };
  }

  const missingScopes = normalizedScopes.filter((scope) => !normalized.scopes.includes(scope));
  if (missingScopes.length > 0) {
    return {
      status: "missing-scopes",
      severity: "fail",
      platform,
      purposeLabel: label,
      requiredScopes: normalizedScopes,
      missingScopes,
      message: `${label} OAuth credential is missing required scope${missingScopes.length === 1 ? "" : "s"}: ${missingScopes.join(", ")}.`,
      recommendation: `Reconnect ${platformLabel(platform)} OAuth with the required scope${missingScopes.length === 1 ? "" : "s"} before using ${label}.`
    };
  }

  if (normalized.expiresAt !== null && normalized.expiresAt <= now) {
    const refreshable = Boolean(normalized.refreshToken);
    return {
      status: "expired",
      severity: refreshable ? "warn" : "fail",
      platform,
      purposeLabel: label,
      requiredScopes: normalizedScopes,
      missingScopes: [],
      message: `${label} OAuth credential has expired${refreshable ? " and needs refresh" : ""}.`,
      recommendation: refreshable
        ? `Refresh ${platformLabel(platform)} OAuth before using ${label}.`
        : `Reconnect ${platformLabel(platform)} OAuth before using ${label}.`
    };
  }

  if (normalized.expiresAt !== null && normalized.expiresAt - now <= leewayMs) {
    const refreshable = Boolean(normalized.refreshToken);
    return {
      status: "expires-soon",
      severity: refreshable ? "warn" : "fail",
      platform,
      purposeLabel: label,
      requiredScopes: normalizedScopes,
      missingScopes: [],
      message: `${label} OAuth credential expires soon${refreshable ? " and should be refreshed" : ""}.`,
      recommendation: refreshable
        ? `Refresh ${platformLabel(platform)} OAuth before using ${label}.`
        : `Reconnect ${platformLabel(platform)} OAuth before using ${label}.`
    };
  }

  return {
    status: "ready",
    severity: "pass",
    platform,
    purposeLabel: label,
    requiredScopes: normalizedScopes,
    missingScopes: [],
    message: `${label} OAuth credential has the required scope evidence.`,
    recommendation: `Keep the stored ${platformLabel(platform)} OAuth credential available for ${label}.`
  };
};

export const createPlatformChatAuthFromCredential = (
  credential: PlatformChatOAuthCredential | null
): PlatformChatAuthSession => {
  const normalized = normalizePlatformChatOAuthCredential(credential);
  if (!normalized) {
    return normalizePlatformChatAuthSession({});
  }

  if (normalized.platform === "youtube") {
    return normalizePlatformChatAuthSession({
      youtubeAccessToken: normalized.accessToken
    });
  }

  return normalizePlatformChatAuthSession({
    twitchOauthToken: normalized.accessToken,
    twitchLogin: normalized.twitchLogin ?? ""
  });
};

export const shouldRefreshPlatformChatOAuthCredential = (
  credential: PlatformChatOAuthCredential | null,
  now: number = Date.now(),
  leewayMs = 120000
): boolean => {
  const normalized = normalizePlatformChatOAuthCredential(credential);
  return Boolean(normalized?.refreshToken && normalized.expiresAt !== null && normalized.expiresAt - now <= leewayMs);
};

export const shouldValidateTwitchOAuthCredential = (
  credential: PlatformChatOAuthCredential | null,
  now: number = Date.now(),
  intervalMs = 3600000
): boolean => {
  const normalized = normalizePlatformChatOAuthCredential(credential);
  return Boolean(normalized?.platform === "twitch" && (!normalized.validatedAt || now - normalized.validatedAt >= intervalMs));
};

export interface PlatformChatOAuthCredentialFreshnessResult {
  credential: PlatformChatOAuthCredential | null;
  refreshed: boolean;
  validated: boolean;
  message: string | null;
}

export const ensureFreshPlatformChatOAuthCredential = async (
  credential: PlatformChatOAuthCredential | null,
  settings: PlatformChatOAuthSettings,
  fetcher: PlatformChatFetch,
  now: number = Date.now(),
  leewayMs = 120000
): Promise<PlatformChatOAuthCredentialFreshnessResult> => {
  const normalized = normalizePlatformChatOAuthCredential(credential);
  if (!normalized) {
    return { credential: null, refreshed: false, validated: false, message: null };
  }

  const platformName = normalized.platform === "youtube" ? "YouTube" : "Twitch";
  const expiresSoon = normalized.expiresAt !== null && normalized.expiresAt - now <= leewayMs;
  if (expiresSoon) {
    if (!normalized.refreshToken) {
      throw new PlatformChatOAuthError(`${platformName} OAuth token expires soon and cannot be refreshed. Reconnect OAuth before using platform controls.`);
    }

    const refreshed =
      normalized.platform === "youtube"
        ? await refreshYouTubeOAuthCredential(normalized, settings, fetcher, now)
        : await refreshTwitchOAuthCredential(normalized, settings, fetcher, now);
    return {
      credential: refreshed,
      refreshed: true,
      validated: normalized.platform === "twitch",
      message: `${platformName} OAuth token refreshed before platform API call.`
    };
  }

  if (normalized.platform === "twitch" && shouldValidateTwitchOAuthCredential(normalized, now)) {
    const validatedToken = await validateTwitchOAuthToken(normalized.accessToken, fetcher, now);
    const validated = {
      ...normalized,
      ...validatedToken,
      refreshToken: normalized.refreshToken,
      scopes: validatedToken.scopes.length > 0 ? validatedToken.scopes : normalized.scopes,
      clientId: normalized.clientId,
      redirectUri: normalized.redirectUri
    };
    return {
      credential: validated,
      refreshed: false,
      validated: true,
      message: "Twitch OAuth token validated before platform API call."
    };
  }

  return { credential: normalized, refreshed: false, validated: false, message: null };
};

export const createPkceCodeVerifier = (): string => createOAuthNonce(64);

export const createPkceS256Challenge = (codeVerifier: string): string => base64UrlEncode(sha256Ascii(codeVerifier));

export const createOAuthNonce = (length: number): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  const cryptoLike = (globalThis as unknown as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoLike?.getRandomValues) {
    cryptoLike.getRandomValues(bytes);
  } else {
    throw new PlatformChatOAuthError("Secure random generation is unavailable; OAuth cannot start safely.");
  }
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

const normalizeTokenPayload = (
  platform: PlatformChatPlatform,
  payload: unknown,
  receivedAt: number
): PlatformChatOAuthCredential => {
  const accessToken = readStringField(payload, "access_token");
  if (!accessToken) {
    throw new PlatformChatOAuthError("OAuth token response did not include an access token.");
  }

  return {
    platform,
    accessToken,
    refreshToken: readStringField(payload, "refresh_token") || null,
    expiresAt: secondsToExpiresAt(readNumberField(payload, "expires_in"), receivedAt),
    scopes: readScopesField(payload),
    twitchLogin: null,
    twitchUserId: null,
    validatedAt: receivedAt,
    clientId: null,
    redirectUri: null
  };
};

const hydrateTwitchCredential = async (
  token: PlatformChatOAuthCredential,
  clientId: string,
  redirectUri: string | null,
  fetcher: PlatformChatFetch,
  receivedAt: number
): Promise<PlatformChatOAuthCredential> => {
  const validated = await validateTwitchOAuthToken(token.accessToken, fetcher, receivedAt);
  return {
    ...token,
    scopes: token.scopes.length > 0 ? token.scopes : validated.scopes,
    twitchLogin: validated.twitchLogin,
    twitchUserId: validated.twitchUserId,
    validatedAt: validated.validatedAt,
    clientId,
    redirectUri
  };
};

const createQueryParams = (params: Record<string, string>): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, value);
  }
  return query.toString();
};

const assertPlatformChatOAuthResponseOk = (
  response: Awaited<ReturnType<PlatformChatFetch>>,
  operation: string
) => {
  if (!response.ok) {
    throw new PlatformChatOAuthError(
      `${operation} failed with HTTP ${response.status}.`,
      getPlatformHttpFailureMetadata(response)
    );
  }
};

const readPlatformChatOAuthJson = async (
  response: Awaited<ReturnType<PlatformChatFetch>>,
  operation: string
): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new PlatformChatOAuthError(`${operation} returned unreadable JSON with HTTP ${response.status}.`, {
      statusCode: response.status
    });
  }
};

const readOptionalPlatformChatOAuthJson = async (response: Awaited<ReturnType<PlatformChatFetch>>): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const normalizeSingleLine = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

const normalizeScopes = (value: string): string[] => value.split(/[ +]/).map(normalizeSingleLine).filter(Boolean).slice(0, 24);

const uniqueScopes = (scopes: string[]): string[] => [...new Set(scopes.map(normalizeSingleLine).filter(Boolean))].slice(0, 24);

const platformLabel = (platform: PlatformChatPlatform): string => (platform === "youtube" ? "YouTube" : "Twitch");

const secondsToExpiresAt = (seconds: number | null, receivedAt: number): number | null =>
  seconds && Number.isFinite(seconds) && seconds > 0 ? receivedAt + seconds * 1000 : null;

const normalizeTimestamp = (value: unknown): number | null =>
  normalizeTimestampNumber(value) ?? normalizeTimestampString(value);

const normalizeTimestampNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;

const normalizeTimestampString = (value: unknown): number | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const numericTimestamp = Number(trimmed);
  if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) {
    return Math.round(numericTimestamp);
  }
  const parsedTimestamp = Date.parse(trimmed);
  return Number.isFinite(parsedTimestamp) && parsedTimestamp > 0 ? parsedTimestamp : null;
};

const readStringField = (payload: unknown, key: string): string => {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
};

const readNumberField = (payload: unknown, key: string): number | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const readStringArrayField = (payload: unknown, key: string): string[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.map(normalizeSingleLine).filter(Boolean).slice(0, 24) : [];
};

const readScopesField = (payload: unknown): string[] => {
  const scope = readStringField(payload, "scope");
  if (scope) {
    return normalizeScopes(scope);
  }
  const scopeArray = readStringArrayField(payload, "scope");
  if (scopeArray.length > 0) {
    return scopeArray.slice(0, 24);
  }
  return readStringArrayField(payload, "scopes");
};

const base64UrlEncode = (bytes: number[]): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += alphabet[(value >> 18) & 63];
    output += alphabet[(value >> 12) & 63];
    output += second === undefined ? "=" : alphabet[(value >> 6) & 63];
    output += third === undefined ? "=" : alphabet[value & 63];
  }

  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const sha256Ascii = (value: string): number[] => {
  const bytes = Array.from(value, (char) => char.charCodeAt(0) & 0xff);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }
  for (let shift = 56; shift >= 0; shift -= 8) {
    bytes.push((bitLength / 2 ** shift) & 0xff);
  }

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array<number>(64).fill(0);
    for (let index = 0; index < 16; index += 1) {
      const cursor = offset + index * 4;
      w[index] = ((bytes[cursor] << 24) | (bytes[cursor + 1] << 16) | (bytes[cursor + 2] << 8) | bytes[cursor + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(w[index - 15], 7) ^ rotateRight(w[index - 15], 18) ^ (w[index - 15] >>> 3);
      const s1 = rotateRight(w[index - 2], 17) ^ rotateRight(w[index - 2], 19) ^ (w[index - 2] >>> 10);
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[index] + w[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].flatMap((word) => [
    (word >>> 24) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 8) & 0xff,
    word & 0xff
  ]);
};

const rotateRight = (value: number, amount: number): number => (value >>> amount) | (value << (32 - amount));
