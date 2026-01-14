# @ku0/app

The UI application layer for the Reader project. This package consumes `@ku0/core` and provides the React-based user interface.

## Architecture

This package is structured around functional domains:

- **`src/annotations`**: The LFCC (Low-Friction Commenting & Correction) UI module.
- **`src/AppRoot.tsx`**: The main application entry point.

## Key Modules

### Annotations (`src/annotations`)

Implements the UI for the commenting and correction system.

- **`panelState.ts`**: Pure state management (Reducer/Actions) for the annotation side panel.
- **`visualSpec.ts`**: strict design tokens and CSS generation for annotation highlights and badges.
- **`dragHandle.ts`**: Platform-agnostic drag interactions for annotation resizing strings.
- **`mockAdapter.ts`**: Development mock for the AnnotationUI adapter interface.

## Development

### Scripts

- `npm run build`: Type-check the project.
- `npm test`: Run unit tests with Vitest.
- `npm run lint`: Lint code with Biome.
- `npm run clean`: Clean build artifacts.

### Testing

Tests are located in `src/**/__tests__` and use `vitest` with `jsdom` environment.
