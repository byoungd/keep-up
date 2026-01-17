/**
 * Types Module
 *
 * Branded types, validation, and type utilities for the AI module.
 */

// Branded Types
export {
  // Errors
  BrandValidationError,
  type ChunkId,
  chunkId,
  type DocId,
  docId,
  generateChunkId,
  generateDocId,
  // Generators
  generateId,
  generateRequestId,
  generateTraceId,
  isValidPositiveInt,
  isValidUnitInterval,
  // Type Guards
  isValidUserId,
  // Value Types
  type NonEmptyString,
  nonEmptyString,
  type PositiveInt,
  type ProviderId,
  positiveInt,
  providerId,
  type RequestId,
  requestId,
  type SimilarityScore,
  type SpanId,
  safeChunkId,
  safeDocId,
  safePositiveInt,
  safeSimilarityScore,
  safeUnitInterval,
  // Safe Constructors
  safeUserId,
  similarityScore,
  spanId,
  type Timestamp,
  type TokenCount,
  type TraceId,
  timestamp,
  tokenCount,
  traceId,
  type UnitInterval,
  // ID Types
  type UserId,
  type UTF16Offset,
  unitInterval,
  // Utilities
  unwrap,
  // Constructors
  userId,
  utf16Offset,
  type ValidationResult,
} from "./branded";
// Result Type (Functional Error Handling)
export {
  type AsyncResult,
  all,
  any,
  ap,
  asyncResultDo,
  chain,
  type Err,
  err,
  flatMap,
  flatMapAsync,
  fromAsyncThrowable,
  // Async Support
  fromPromise,
  fromThrowable,
  isErr,
  // Type Guards
  isOk,
  // Transformations
  map,
  mapAsync,
  mapErr,
  // Combinators
  match,
  type Ok,
  // Constructors
  ok,
  partition,
  // Core Types
  type Result,
  // Do Notation
  resultDo,
  toError,
  toOption,
  unwrapOr,
  unwrapOrElse,
  // Extraction
  unwrapResult,
} from "./result";
// Validation
export {
  // Combinators
  and,
  array,
  arrayLength,
  boolean,
  createParser,
  email,
  // Types
  type FieldError,
  integer,
  nonEmptyString as nonEmptyStringValidator,
  number,
  // Object Validators
  object,
  oneOf,
  optional,
  or,
  pattern,
  positive,
  range,
  // Core Validators
  string,
  // String Validators
  stringLength,
  tryValidate,
  url,
  type ValidateResult,
  // Error
  ValidationError,
  type Validator,
  // Utilities
  validate,
  withDefault,
} from "./validation";
