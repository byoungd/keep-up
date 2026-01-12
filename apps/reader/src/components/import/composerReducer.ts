/**
 * State reducer for Content Composer v2
 */

import { createFileItem, createItemFromInput, createUrlItem } from "./composerItemFactory";
import type { ComposerAction, ComposerState } from "./types";
import { FILE_LIMITS } from "./types";

/** Initial composer state */
export const initialComposerState: ComposerState = {
  items: [],
  destination: "unread",
  showAdvanced: false,
};

/** Composer state reducer */
export function composerReducer(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case "ADD_TEXT": {
      const content = action.content.trim();
      if (!content) {
        return state;
      }

      const newItem = createItemFromInput(content, action.localId);

      return {
        ...state,
        items: [...state.items, newItem],
        showAdvanced: true, // Show advanced options when items exist
      };
    }

    case "ADD_FILES": {
      const { files } = action;

      // Check total count limit
      const totalCount = state.items.length + files.length;
      if (totalCount > FILE_LIMITS.MAX_COUNT) {
        // For now, just ignore excess files
        // In a real implementation, you might want to show a warning
        const allowedCount = FILE_LIMITS.MAX_COUNT - state.items.length;
        const allowedFiles = Array.from(files).slice(0, allowedCount);

        const newItems = allowedFiles.map((file) => createFileItem(file));

        return {
          ...state,
          items: [...state.items, ...newItems],
          showAdvanced: true,
        };
      }

      const newItems = Array.from(files).map((file) => createFileItem(file));

      return {
        ...state,
        items: [...state.items, ...newItems],
        showAdvanced: true,
      };
    }

    case "ADD_URL": {
      const url = action.url.trim();
      if (!url) {
        return state;
      }

      const newItem = createUrlItem(url, action.localId);

      return {
        ...state,
        items: [...state.items, newItem],
        showAdvanced: true,
      };
    }

    case "REMOVE_ITEM": {
      return {
        ...state,
        items: state.items.filter((item) => item.localId !== action.localId),
        showAdvanced: state.items.length > 1, // Hide advanced if no items left
      };
    }

    case "UPDATE_ITEM_STATUS": {
      return {
        ...state,
        items: state.items.map((item) =>
          item.localId === action.localId
            ? {
                ...item,
                status: action.status,
                jobId: action.jobId || item.jobId,
                errorCode: action.errorCode || item.errorCode,
                errorMessage: action.errorMessage || item.errorMessage,
              }
            : item
        ),
      };
    }

    case "SET_ITEM_RESULT": {
      return {
        ...state,
        items: state.items.map((item) =>
          item.localId === action.localId
            ? {
                ...item,
                status: "ready",
                resultDocumentId: action.resultDocumentId,
              }
            : item
        ),
      };
    }

    case "SET_TITLE": {
      return {
        ...state,
        title: action.title,
      };
    }

    case "SET_DESTINATION": {
      return {
        ...state,
        destination: action.destination,
      };
    }

    case "TOGGLE_ADVANCED": {
      return {
        ...state,
        showAdvanced: !state.showAdvanced,
      };
    }

    case "RESET": {
      return initialComposerState;
    }

    default:
      return state;
  }
}
