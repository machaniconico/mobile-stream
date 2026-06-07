import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  createSpeechText,
  markChatMessageSpeaking,
  markChatMessageSpoken,
  selectNextReadableMessage,
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

export const useChatSpeechQueue = (
  state: ChatReaderState,
  setState: Dispatch<SetStateAction<ChatReaderState>>,
  engine: ChatSpeechEngine
) => {
  const speakingRef = useRef(false);

  useEffect(() => {
    if (state.settings.enabled) {
      return;
    }
    speakingRef.current = false;
    void engine.stop();
  }, [engine, state.settings.enabled]);

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

    void engine
      .speak({
        messageId: message.id,
        text,
        rate: state.settings.rate,
        pitch: state.settings.pitch,
        volume: state.settings.volume
      })
      .catch((error) => {
        console.warn("Chat speech failed", error);
      })
      .finally(() => {
        speakingRef.current = false;
        setState((current) => markChatMessageSpoken(current, message.id));
      });
  }, [engine, setState, state]);
};
