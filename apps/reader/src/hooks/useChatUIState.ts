"use client";

import * as React from "react";

/**
 * Chat UI state managed by useReducer
 * This consolidates multiple useState calls into a single reducer
 */
export interface ChatUIState {
  input: string;
  autoScroll: boolean;
  contextPreviewOpen: boolean;
}

export type ChatUIAction =
  | { type: "SET_INPUT"; payload: string }
  | { type: "SET_AUTO_SCROLL"; payload: boolean }
  | { type: "TOGGLE_CONTEXT_PREVIEW" }
  | { type: "RESET" };

const initialState: ChatUIState = {
  input: "",
  autoScroll: true,
  contextPreviewOpen: false,
};

function chatUIReducer(state: ChatUIState, action: ChatUIAction): ChatUIState {
  switch (action.type) {
    case "SET_INPUT":
      return { ...state, input: action.payload };
    case "SET_AUTO_SCROLL":
      return { ...state, autoScroll: action.payload };
    case "TOGGLE_CONTEXT_PREVIEW":
      return { ...state, contextPreviewOpen: !state.contextPreviewOpen };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export interface UseChatUIStateReturn {
  state: ChatUIState;
  setInput: (value: string) => void;
  setAutoScroll: (value: boolean) => void;
  toggleContextPreview: () => void;
  reset: () => void;
}

export function useChatUIState(): UseChatUIStateReturn {
  const [state, dispatch] = React.useReducer(chatUIReducer, initialState);

  const setInput = React.useCallback((value: string) => {
    dispatch({ type: "SET_INPUT", payload: value });
  }, []);

  const setAutoScroll = React.useCallback((value: boolean) => {
    dispatch({ type: "SET_AUTO_SCROLL", payload: value });
  }, []);

  const toggleContextPreview = React.useCallback(() => {
    dispatch({ type: "TOGGLE_CONTEXT_PREVIEW" });
  }, []);

  const reset = React.useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return {
    state,
    setInput,
    setAutoScroll,
    toggleContextPreview,
    reset,
  };
}
