/**
 * Pipeline Module
 *
 * Provides tool composition and pipeline execution.
 */

export {
  PipelineExecutor,
  PipelineBuilder,
  createPipeline,
  createPipelineExecutor,
  createSequentialPipeline,
  createRetryPipeline,
  type PipelineStepType,
  type PipelineStep,
  type ToolStep,
  type TransformStep,
  type ConditionStep,
  type ParallelStep,
  type LoopStep,
  type PipelineContext,
  type Pipeline,
  type PipelineResult,
  type StepResult,
} from "./pipelineBuilder";

export {
  createDigestSynthesisPipeline,
  runDigestSynthesis,
  type DigestSynthesisInput,
  type DigestSynthesisOutput,
  type DigestSynthesisDependencies,
  type DigestSynthesisConfig,
  type DigestSourceItem,
  type DigestSummary,
  type DigestCard,
  type DigestCardDraft,
  type DigestCitation,
  type DigestMapFailure,
  type DigestReduceFailure,
} from "./digestSynthesis";
