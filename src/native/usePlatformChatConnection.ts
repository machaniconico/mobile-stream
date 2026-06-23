import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../domain/chatReader";
import {
  createPlatformChatAutoConnectPlan,
  createPlatformChatConnectionState,
  createTwitchIrcAuthenticationCommands,
  fetchYouTubeLiveChatPage,
  getPlatformChatNetworkReadiness,
  normalizePlatformChatAuthSession,
  parseTwitchIrcPayload,
  TWITCH_IRC_WEBSOCKET_URL,
  type PlatformChatAuthSession,
  type PlatformChatAutoConnectPlan,
  type PlatformChatConnectionState
} from "../domain/platformChatConnection";
import type { PlatformChatSettings } from "../domain/platformChat";

interface PlatformChatConnectionOptions {
  settings: PlatformChatSettings;
  auth: PlatformChatAuthSession;
  onMessages(messages: ChatMessage[]): void;
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

export const usePlatformChatConnection = ({ settings, auth, onMessages }: PlatformChatConnectionOptions) => {
  const [connection, setConnection] = useState<PlatformChatConnectionState>(() => createPlatformChatConnectionState());
  const connectionRef = useRef(connection);
  const settingsRef = useRef(settings);
  const authRef = useRef(auth);
  const onMessagesRef = useRef(onMessages);
  const activeRef = useRef(false);
  const connectionIdRef = useRef(0);
  const connectionKeyRef = useRef(platformConnectionKey(settings, auth));
  const youtubeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearYoutubeTimer = useCallback(() => {
    if (youtubeTimerRef.current) {
      clearTimeout(youtubeTimerRef.current);
      youtubeTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    activeRef.current = false;
    connectionIdRef.current += 1;
    clearYoutubeTimer();
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnection(createPlatformChatConnectionState("idle", "Not connected."));
  }, [clearYoutubeTimer]);

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
    disconnect();
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
  }, [connectTwitch, disconnect, pollYouTube]);

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
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Platform chat connection failed.";
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
