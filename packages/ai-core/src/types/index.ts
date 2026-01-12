/**
 * Types Module
 *
 * Branded types, validation, and type utilities for the AI module.
 */

// Branded Types
export {
  // ID Types
  type UserId,
  type DocId,
  type ChunkId,
  type TraceId,
  type SpanId,
  type ProviderId,
  type RequestId,
  // Value Types
  type NonEmptyString,
  type PositiveInt,
  type UnitInterval,
  type TokenCount,
  type SimilarityScore,
  type UTF16Offset,
  type Timestamp,
  // Constructors
  userId,
  docId,
  chunkId,
  traceId,
  spanId,
  providerId,
  requestId,
  nonEmptyString,
  positiveInt,
  unitInterval,
  tokenCount,
  similarityScore,
  utf16Offset,
  timestamp,
  // Safe Constructors
  safeUserId,
  safeDocId,
  safeChunkId,
  safePositiveInt,
  safeUnitInterval,
  safeSimilarityScore,
  // Type Guards
  isValidUserId,
  isValidPositiveInt,
  isValidUnitInterval,
  // Generators
  generateId,
  generateDocId,
  generateChunkId,
  generateTraceId,
  generateRequestId,
  // Utilities
  unwrap,
  // Errors
  BrandValidationError,
  type ValidationResult,
} from "./branded";

// Validation
export {
  // Types
  type FieldError,
  type ValidateResult,
  type Validator,
  // Error
  ValidationError,
  // Core Validators
  string,
  nonEmptyString as nonEmptyStringValidator,
  number,
  integer,
  positive,
  range,
  boolean,
  array,
  arrayLength,
  // Object Validators
  object,
  optional,
  withDefault,
  // Combinators
  and,
  or,
  oneOf,
  // String Validators
  stringLength,
  pattern,
  url,
  email,
  // Utilities
  validate,
  createParser,
  tryValidate,
} from "./validation";

// Result Type (Functional Error Handling)
export {
  // Core Types
  type Result,
  type Ok,
  type Err,
  type AsyncResult,
  // Constructors
  ok,
  err,
  // Type Guards
  isOk,
  isErr,
  // Transformations
  map,
  mapErr,
  flatMap,
  chain,
  ap,
  // Extraction
  unwrapResult,
  unwrapOr,
  unwrapOrElse,
  toOption,
  toError,
  // Combinators
  match,
  all,
  any,
  partition,
  // Async Support
  fromPromise,
  fromThrowable,
  fromAsyncThrowable,
  mapAsync,
  flatMapAsync,
  // Do Notation
  resultDo,
  asyncResultDo,
} from "./result";
