# @keepup/tts

Text-to-Speech engine with multi-provider support for the Reader application.

## Overview

This package provides:
- **Plugin-based architecture** - Register multiple TTS providers
- **Word-level timing** - Highlight words as they're spoken
- **Automatic fallback** - Falls back to browser TTS if Edge fails
- **Playback control** - Pause, resume, stop, rate adjustment

## Installation

```bash
pnpm add @keepup/tts
```

## Quick Start

```typescript
import { createTTSEngine } from '@keepup/tts';

// Create engine with default providers (Edge + Browser fallback)
const engine = createTTSEngine();
await engine.init();

// Set up callbacks
engine.setCallbacks({
  onWordChange: (index, data) => {
    if (data) highlightWord(data.charStart, data.charEnd);
  },
  onEnd: () => console.log('Finished speaking'),
});

// Speak text
await engine.speak('Hello, world!');

// Control playback
engine.pause();
engine.resume();
engine.stop();
```

## API Reference

### createTTSEngine

Factory function that creates a pre-configured engine:

```typescript
const engine = createTTSEngine({
  defaultVoice: 'en-US-AriaNeural',
  rate: 1.0,
});
```

### TTSEngine

```typescript
class TTSEngine {
  registerProvider(provider: ITTSProvider): void;
  init(): Promise<void>;
  speak(text: string, options?: TTSSynthesizeOptions): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  setRate(rate: number): void;
  setCallbacks(callbacks: TTSCallbacks): void;
}
```

### TTSCallbacks

```typescript
interface TTSCallbacks {
  onWordChange?: (index: number, data: WordTimingData | null) => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: TTSPlaybackState) => void;
}
```

### WordTimingData

```typescript
interface WordTimingData {
  word: string;
  charStart: number;
  charEnd: number;
  audioStart: number;
  audioEnd: number;
}
```

## Providers

### EdgeTTSProvider (Default)

Uses Microsoft Edge's TTS API via server-side proxy:
- High-quality neural voices
- Word-level timing data
- Requires `/api/reader/tts/edge` endpoint

### BrowserTTSProvider (Fallback)

Uses Web Speech API:
- Works offline
- No server required
- Limited timing accuracy

### Custom Provider

```typescript
import { ITTSProvider, TTSEngine } from '@keepup/tts';

class MyTTSProvider implements ITTSProvider {
  readonly id = 'my-provider';
  readonly displayName = 'My Provider';
  
  async synthesize(text: string, options: TTSSynthesizeOptions): Promise<TTSSynthesizeResult> {
    // Implementation
  }
  
  // ... other methods
}

const engine = new TTSEngine();
engine.registerProvider(new MyTTSProvider());
```

## Testing

```bash
pnpm --filter @keepup/tts test
```

## License

MIT
