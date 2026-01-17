import type { PipelineRunner } from "../pipelineRunner";

export async function triggerWebhookPipeline(
  runner: PipelineRunner,
  pipelineId: string,
  payload?: Record<string, unknown>
) {
  return runner.startRun(pipelineId, payload);
}
