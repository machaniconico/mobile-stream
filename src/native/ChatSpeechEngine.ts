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
        console.warn("Chat speech failed", error);
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
