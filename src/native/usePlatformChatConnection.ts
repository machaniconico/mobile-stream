import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../domain/chatReader";
import { errorToSafeMessage } from "../domain/sensitiveText";
import {
  createPlatformChatAutoConnectPlan,
  createInitialPlatformChatReconnectState,
  createPlatformChatConnectionState,
  createPlatformChatReconnectDecision,
  createTwitchIrcAuthenticationCommands,
  fetchYouTubeLiveChatPage,
  getPlatformChatNetworkReadiness,
  normalizePlatformChatAuthSession,
  parseTwitchIrcPayload,
  TWITCH_IRC_WEBSOCKET_URL,
  type PlatformChatAuthSession,
  type PlatformChatAutoConnectPlan,
  type PlatformChatConnectionState,
  type PlatformChatReconnectDecision,
  type PlatformChatReconnectPolicy
} from "../domain/platformChatConnection";
import type { PlatformChatSettings } from "../domain/platformChat";

interface PlatformChatConnectionOptions {
  settings: PlatformChatSettings;
  auth: PlatformChatAuthSession;
  onMessages(messages: ChatMessage[]): void;
  autoReconnect?: {
    enabled: boolean;
    streamActive: boolean;
    chatReaderEnabled: boolean;
    policy?: Partial<PlatformChatReconnectPolicy>;
    onDecision?(decision: PlatformChatReconnectDecision): void;
  };
}

interface PlatformChatSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

type PlatformChatSocketConstructor = new (url: string) => PlatformChatSocket;

export const usePlatformChatConnection = ({ settings, auth, onMessages, autoReconnect }: PlatformChatConnectionOptions) => {
  const [connection, setConnection] = useState<PlatformChatConnectionState>(() => createPlatformChatConnectionState());
  const connectionRef = useRef(connection);
  const settingsRef = useRef(settings);
  const authRef = useRef(auth);
  const onMessagesRef = useRef(onMessages);
  const autoReconnectRef = useRef(autoReconnect);
  const reconnectDecisionRef = useRef(autoReconnect?.onDecision);
  const reconnectStateRef = useRef(createInitialPlatformChatReconnectState());
  const activeRef = useRef(false);
  const connectionIdRef = useRef(0);
  const connectionKeyRef = useRef(platformConnectionKey(settings, auth));
  const youtubeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerKeyRef = useRef<string | null>(null);
  const socketRef = useRef<PlatformChatSocket | null>(null);

  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  useEffect(() => {
    onMessagesRef.current = onMessages;
  }, [onMessages]);

  useEffect(() => {
    autoReconnectRef.current = autoReconnect;
    reconnectDecisionRef.current = autoReconnect?.onDecision;
  }, [autoReconnect]);

  const clearYoutubeTimer = useCallback(() => {
    if (youtubeTimerRef.current) {
      clearTimeout(youtubeTimerRef.current);
      youtubeTimerRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectTimerKeyRef.current = null;
  }, []);

  const closeConnection = useCallback(() => {
    activeRef.current = false;
    connectionIdRef.current += 1;
    clearYoutubeTimer();
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, [clearYoutubeTimer]);

  const disconnect = useCallback(() => {
    closeConnection();
    clearReconnectTimer();
    setConnection(createPlatformChatConnectionState("idle", "Not connected."));
  }, [clearReconnectTimer, closeConnection]);

  const pollYouTube = useCallback(
    async (connectionId: number, cursor: string | null) => {
      if (!isCurrentConnection(activeRef, connectionIdRef, connectionId)) {
        return;
      }

      setConnection((current) => ({
        ...current,
        phase: current.phase === "connected" ? "connected" : "connecting",
        label: current.phase === "connected" ? "Connected" : "Connecting",
        message: cursor ? "Polling YouTube chat." : "Connecting to YouTube chat.",
        nextPollAt: null
      }));

      try {
        const page = await fetchYouTubeLiveChatPage(settingsRef.current, authRef.current, cursor, fetch);
        if (!isCurrentConnection(activeRef, connectionIdRef, connectionId)) {
          return;
        }

        if (page.ingest.messages.length > 0) {
          onMessagesRef.current(page.ingest.messages);
        }

        const now = Date.now();
        const nextPollAt = now + page.nextPollIntervalMs;
        setConnection({
          phase: "connected",
          label: "Connected",
          message: `YouTube chat polling every ${Math.round(page.nextPollIntervalMs / 1000)}s.`,
          lastReceivedAt: page.ingest.messages.at(-1)?.receivedAt ?? null,
          nextPollAt
        });
        youtubeTimerRef.current = setTimeout(() => void pollYouTube(connectionId, page.nextCursor), page.nextPollIntervalMs);
      } catch (error) {
        if (!isCurrentConnection(activeRef, connectionIdRef, connectionId)) {
          return;
        }
        activeRef.current = false;
        setConnection(createPlatformChatConnectionState("failed", toSafeErrorMessage(error)));
      }
    },
    []
  );

  const connectTwitch = useCallback((connectionId: number) => {
    const SocketCtor = (globalThis as unknown as { WebSocket?: PlatformChatSocketConstructor }).WebSocket;
    if (!SocketCtor) {
      setConnection(createPlatformChatConnectionState("failed", "WebSocket is not available in this runtime."));
      return;
    }

    const socket = new SocketCtor(TWITCH_IRC_WEBSOCKET_URL);
    socketRef.current = socket;
    setConnection(createPlatformChatConnectionState("connecting", "Connecting to Twitch chat."));
    const isCurrentSocket = () =>
      isCurrentConnection(activeRef, connectionIdRef, connectionId) && socketRef.current === socket;

    socket.onopen = () => {
      if (!isCurrentSocket()) {
        return;
      }
      try {
        for (const command of createTwitchIrcAuthenticationCommands(settingsRef.current, authRef.current)) {
          socket.send(command);
        }
      } catch (error) {
        if (isCurrentSocket()) {
          setConnection(createPlatformChatConnectionState("failed", toSafeErrorMessage(error)));
        }
        socket.close();
      }
    };

    socket.onmessage = (event) => {
      if (!isCurrentSocket()) {
        return;
      }
      if (typeof event.data !== "string") {
        return;
      }

      const result = parseTwitchIrcPayload(event.data);
      for (const pong of result.pongResponses) {
        socket.send(pong);
      }

      if (result.notices.some((notice) => /authentication failed|improperly formatted auth/i.test(notice))) {
        if (!isCurrentSocket()) {
          return;
        }
        activeRef.current = false;
        setConnection(createPlatformChatConnectionState("failed", "Twitch authentication failed."));
        socket.close();
        return;
      }

      if (result.messages.length > 0) {
        onMessagesRef.current(result.messages);
      }

      setConnection({
        phase: "connected",
        label: "Connected",
        message: "Twitch IRC chat is connected.",
        lastReceivedAt: result.messages.at(-1)?.receivedAt ?? null,
        nextPollAt: null
      });
    };

    socket.onerror = () => {
      if (isCurrentSocket()) {
        setConnection(createPlatformChatConnectionState("failed", "Twitch chat socket error."));
      }
    };

    socket.onclose = () => {
      if (isCurrentSocket()) {
        activeRef.current = false;
        setConnection(createPlatformChatConnectionState("failed", "Twitch chat socket closed."));
      }
    };
  }, []);

  const connect = useCallback(() => {
    closeConnection();
    clearReconnectTimer();
    reconnectStateRef.current = {
      ...reconnectStateRef.current,
      scheduledKey: null
    };
    const normalizedAuth = normalizePlatformChatAuthSession(authRef.current);
    const readiness = getPlatformChatNetworkReadiness(settingsRef.current, normalizedAuth);

    if (readiness.status !== "ready") {
      setConnection(createPlatformChatConnectionState(readiness.status, readiness.message));
      return;
    }

    connectionIdRef.current += 1;
    const connectionId = connectionIdRef.current;
    activeRef.current = true;
    if (settingsRef.current.platform === "youtube") {
      void pollYouTube(connectionId, null);
      return;
    }

    connectTwitch(connectionId);
  }, [clearReconnectTimer, closeConnection, connectTwitch, pollYouTube]);

  const ensureConnected = useCallback(
    (chatReaderEnabled = true): PlatformChatAutoConnectPlan => {
      const plan = createPlatformChatAutoConnectPlan(
        settingsRef.current,
        normalizePlatformChatAuthSession(authRef.current),
        chatReaderEnabled,
        connectionRef.current
      );

      if (plan.action === "connect") {
        connect();
      }

      return plan;
    },
    [connect]
  );

  useEffect(() => {
    const decision = createPlatformChatReconnectDecision({
      settings,
      auth,
      chatReaderEnabled: autoReconnect?.chatReaderEnabled === true,
      streamActive: autoReconnect?.enabled === true && autoReconnect.streamActive === true,
      connection,
      state: reconnectStateRef.current,
      policy: autoReconnect?.policy
    });
    reconnectStateRef.current = decision.state;

    if (decision.command === "cancel") {
      clearReconnectTimer();
      return;
    }

    if (decision.command === "give-up") {
      clearReconnectTimer();
      reconnectDecisionRef.current?.(decision);
      return;
    }

    if (decision.command !== "schedule-reconnect" || !decision.key) {
      return;
    }

    if (reconnectTimerKeyRef.current === decision.key) {
      return;
    }

    clearReconnectTimer();
    reconnectDecisionRef.current?.(decision);
    reconnectTimerKeyRef.current = decision.key;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectTimerKeyRef.current = null;
      reconnectStateRef.current = {
        ...reconnectStateRef.current,
        scheduledKey: null
      };
      const reconnectOptions = autoReconnectRef.current;
      const reconnectPlan = createPlatformChatAutoConnectPlan(
        settingsRef.current,
        normalizePlatformChatAuthSession(authRef.current),
        reconnectOptions?.chatReaderEnabled === true,
        connectionRef.current
      );

      if (reconnectOptions?.enabled === true && reconnectOptions.streamActive === true && reconnectPlan.action === "connect") {
        connect();
      }
    }, Math.max(0, decision.delayMs ?? 0));
  }, [
    auth,
    autoReconnect?.chatReaderEnabled,
    autoReconnect?.enabled,
    autoReconnect?.policy?.baseDelayMs,
    autoReconnect?.policy?.enabled,
    autoReconnect?.policy?.maxAttempts,
    autoReconnect?.policy?.maxDelayMs,
    autoReconnect?.streamActive,
    clearReconnectTimer,
    connect,
    connection,
    settings
  ]);

  useEffect(() => {
    const nextKey = platformConnectionKey(settings, auth);
    if (connectionKeyRef.current === nextKey) {
      return;
    }
    connectionKeyRef.current = nextKey;
    if (connection.phase === "connecting" || connection.phase === "connected") {
      disconnect();
    }
  }, [auth, connection.phase, disconnect, settings]);

  useEffect(() => {
    if (!settings.enabled) {
      disconnect();
    }
  }, [disconnect, settings.enabled]);

  useEffect(() => disconnect, [disconnect]);

  return {
    connection,
    connect,
    disconnect,
    ensureConnected
  };
};

const toSafeErrorMessage = (error: unknown): string => {
  return errorToSafeMessage(error, "Platform chat connection failed.");
};

const isCurrentConnection = (
  activeRef: { current: boolean },
  connectionIdRef: { current: number },
  connectionId: number
): boolean => activeRef.current && connectionIdRef.current === connectionId;

const platformConnectionKey = (settings: PlatformChatSettings, auth: PlatformChatAuthSession): string => {
  const normalizedAuth = normalizePlatformChatAuthSession(auth);
  return [
    settings.enabled ? "1" : "0",
    settings.platform,
    settings.youtubeLiveChatId,
    settings.twitchChannel,
    normalizedAuth.youtubeAccessToken,
    normalizedAuth.twitchOauthToken,
    normalizedAuth.twitchLogin
  ].join("\u001f");
};
