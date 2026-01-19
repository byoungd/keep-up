export interface ReplayStep {
  checkpointId: string;
  timestamp: number;
  state: unknown;
  label?: string;
}

export interface ReplayFrame {
  checkpointId: string;
  timestamp: number;
  label?: string;
  summary: string;
}

export interface ReplayVisualization {
  frames: ReplayFrame[];
  durationMs: number;
  checkpointCount: number;
}

export interface ReplayVisualizerOptions {
  summarizer?: (state: unknown) => string;
}

export class ReplayVisualizer {
  private readonly summarizer: (state: unknown) => string;

  constructor(options: ReplayVisualizerOptions = {}) {
    this.summarizer = options.summarizer ?? defaultSummarizer;
  }

  buildTimeline(steps: ReplayStep[]): ReplayVisualization {
    const frames = steps.map((step) => ({
      checkpointId: step.checkpointId,
      timestamp: step.timestamp,
      label: step.label,
      summary: this.summarizer(step.state),
    }));

    const durationMs =
      frames.length > 1 ? frames[frames.length - 1].timestamp - frames[0].timestamp : 0;

    return {
      frames,
      durationMs,
      checkpointCount: frames.length,
    };
  }
}

function defaultSummarizer(state: unknown): string {
  if (state === null || state === undefined) {
    return "<empty>";
  }

  if (typeof state === "string") {
    return state.length > 120 ? `${state.slice(0, 117)}...` : state;
  }

  if (typeof state === "object") {
    const keys = Object.keys(state as Record<string, unknown>);
    return `Object(${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "..." : ""})`;
  }

  return String(state);
}
