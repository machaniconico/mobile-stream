import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  createSpeechText,
  markChatMessageSpeaking,
  markChatMessageSpoken,
  selectNextReadableMessage,
  type ChatMessage,
  type ChatReaderState
} from "../domain/chatReader";

export interface ChatSpeechRequest {
  messageId: string;
  text: string;
  rate: number;
  pitch: number;
  volume: number;
}

export interface ChatSpeechEngine {
  speak(request: ChatSpeechRequest): Promise<void>;
  stop(): Promise<void>;
}

export const getChatSpeechPlaybackTimeoutMs = (text: string): number => {
  const textLength = Array.from(text).length;
  return Math.round(clamp(6000 + textLength * 120, 6000, 45000));
};

export const formatChatSpeechFailureLogMessage = (error: unknown): string => {
  const message = normalizeSingleLine(error instanceof Error ? error.message : typeof error === "string" ? error : "");
  return safeChatSpeechFailureMessages.has(message) ? message : "Playback failed; details omitted.";
};

export interface ChatSpeechQueueEvent {
  phase: "started" | "spoken" | "failed";
  message: ChatMessage;
  textLength: number;
}

export const useChatSpeechQueue = (
  state: ChatReaderState,
  setState: Dispatch<SetStateAction<ChatReaderState>>,
  engine: ChatSpeechEngine,
  options: {
    onSpeechEvent?(event: ChatSpeechQueueEvent): void;
  } = {}
) => {
  const speakingRef = useRef(false);
  const onSpeechEvent = options.onSpeechEvent;

  useEffect(() => {
    if (state.settings.enabled) {
      return;
    }
    speakingRef.current = false;
    void engine.stop();
  }, [engine, state.settings.enabled]);

  useEffect(() => {
    if (!speakingRef.current || state.speakingMessageId || state.queue.length > 0) {
      return;
    }
    speakingRef.current = false;
    void engine.stop();
  }, [engine, state.queue.length, state.speakingMessageId]);

  useEffect(() => {
    if (speakingRef.current) {
      return;
    }

    const message = selectNextReadableMessage(state);
    if (!message) {
      return;
    }

    const text = createSpeechText(message, state.settings);
    if (!text) {
      setState((current) => markChatMessageSpoken(current, message.id));
      return;
    }

    speakingRef.current = true;
    setState((current) => markChatMessageSpeaking(current, message.id));
    onSpeechEvent?.({ phase: "started", message, textLength: text.length });

    let failed = false;
    void engine
      .speak({
        messageId: message.id,
        text,
        rate: state.settings.rate,
        pitch: state.settings.pitch,
        volume: state.settings.volume
      })
      .catch((error) => {
        failed = true;
        onSpeechEvent?.({ phase: "failed", message, textLength: text.length });
        console.warn("Chat speech failed", formatChatSpeechFailureLogMessage(error));
      })
      .finally(() => {
        if (!failed) {
          onSpeechEvent?.({ phase: "spoken", message, textLength: text.length });
        }
        speakingRef.current = false;
        setState((current) => markChatMessageSpoken(current, message.id));
      });
  }, [engine, onSpeechEvent, setState, state]);
};

const safeChatSpeechFailureMessages = new Set([
  "Web speech synthesis is unavailable.",
  "Web speech synthesis failed.",
  "Web speech synthesis timed out.",
  "Native chat speech module is unavailable.",
  "Native chat speech failed.",
  "Native chat speech timed out.",
  "Text-to-speech engine is not available",
  "Text-to-speech engine is not ready",
  "Text-to-speech engine rejected the utterance"
]);

const normalizeSingleLine = (value: string): string => value.replace(/\s+/g, " ").trim().slice(0, 180);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
