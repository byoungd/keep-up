# @ku0/overlay

DevTools Debug Overlay for the LFCC v0.9 RC system. Provides developer tooling for debugging LFCC integration, block visibility, annotation state machines, and integrity scanning.

## Features

- **Block Boundary Visualizer**: Renders block overlays with IDs and container paths
- **Annotation State Machine Visualizer**: Displays annotation states including grace tokens
- **Integrity Panel**: Force full scan integration and report rendering
- **Dev Assertions Mode**: Background comparison of dirty scan vs full scan

## Architecture

The overlay is platform-agnostic and provides rendering data structures rather than actual DOM elements. The UI layer (React/Vue/vanilla) is responsible for actual rendering.

### Key Modules

- **`overlayController.ts`**: Main entry point coordinating all overlay components
- **`state.ts`**: Pure state management for the overlay
- **`blockVisualizer.ts`**: Block boundary overlay rendering
- **`annotationVisualizer.ts`**: Annotation state visualization
- **`integrityPanel.ts`**: Force scan and report display
- **`devAssertions.ts`**: Development assertion checking
- **`types.ts`**: Type definitions and default constants

## Development

### Scripts

- `npm run build`: Type-check the project
- `npm test`: Run unit tests with Vitest
- `npm run lint`: Lint code with Biome
- `npm run lint:fix`: Auto-fix lint issues
- `npm run clean`: Clean build artifacts

### Usage

```typescript
import { createOverlayController } from "@ku0/overlay";

const controller = createOverlayController({
  enabled: true,
  toggleShortcut: "Ctrl+Shift+D",
});

// Toggle visibility
controller.toggle();

// Update block data
controller.updateBlocks(blockRects, blockMetas);

// Render block overlays
const { overlays, cssStyles } = controller.renderBlocks();
```

### Keyboard Shortcut

Default: `Ctrl+Shift+D` to toggle overlay visibility.

## Testing

Tests are located in `src/__tests__` and cover all major modules:
- State management
- Block/Annotation visualizers
- Integrity panel
- Dev assertions
- Overlay controller

```bash
npm test
# 87 tests passing
```
