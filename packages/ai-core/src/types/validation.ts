// ============================================================================
// Validation Types
// ============================================================================

/** Validation error with field path */
export interface FieldError {
  path: string;
  message: string;
  value?: unknown;
}

/** Validation result */
export type ValidateResult<T> = { valid: true; data: T } | { valid: false; errors: FieldError[] };

/** Validator function type */
export type Validator<T> = (value: unknown, path?: string) => ValidateResult<T>;

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends Error {
  constructor(public readonly errors: FieldError[]) {
    const messages = errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    super(`Validation failed: ${messages}`);
    this.name = "ValidationError";
  }

  /**
   * Get first error message.
   */
  get firstError(): string {
    return this.errors[0]?.message || "Unknown validation error";
  }
}

// ============================================================================
// Core Validators
// ============================================================================

/**
 * Validate that value is a string.
 */
export function string(): Validator<string> {
  return (value, path = "value") => {
    if (typeof value !== "string") {
      return { valid: false, errors: [{ path, message: "must be a string", value }] };
    }
    return { valid: true, data: value };
  };
}

/**
 * Validate that value is a non-empty string.
 */
export function nonEmptyString(): Validator<string> {
  return (value, path = "value") => {
    if (typeof value !== "string") {
      return { valid: false, errors: [{ path, message: "must be a string", value }] };
    }
    if (value.trim().length === 0) {
      return { valid: false, errors: [{ path, message: "must not be empty", value }] };
    }
    return { valid: true, data: value };
  };
}

/**
 * Validate that value is a number.
 */
export function number(): Validator<number> {
  return (value, path = "value") => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return { valid: false, errors: [{ path, message: "must be a number", value }] };
    }
    return { valid: true, data: value };
  };
}

/**
 * Validate that value is an integer.
 */
export function integer(): Validator<number> {
  return (value, path = "value") => {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return { valid: false, errors: [{ path, message: "must be an integer", value }] };
    }
    return { valid: true, data: value };
  };
}

/**
 * Validate that value is a positive number.
 */
export function positive(): Validator<number> {
  return (value, path = "value") => {
    if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
      return { valid: false, errors: [{ path, message: "must be a positive number", value }] };
    }
    return { valid: true, data: value };
  };
}

/**
 * Validate that value is in range [min, max].
 */
export function range(min: number, max: number): Validator<number> {
  return (value, path = "value") => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return { valid: false, errors: [{ path, message: "must be a number", value }] };
    }
    if (value < min || value > max) {
      return {
        valid: false,
        errors: [{ path, message: `must be between ${min} and ${max}`, value }],
      };
    }
    return { valid: true, data: value };
  };
}

/**
 * Validate that value is a boolean.
 */
export function boolean(): Validator<boolean> {
  return (value, path = "value") => {
    if (typeof value !== "boolean") {
      return { valid: false, errors: [{ path, message: "must be a boolean", value }] };
    }
    return { valid: true, data: value };
  };
}

/**
 * Validate that value is an array.
 */
export function array<T>(itemValidator: Validator<T>): Validator<T[]> {
  return (value, path = "value") => {
    if (!Array.isArray(value)) {
      return { valid: false, errors: [{ path, message: "must be an array", value }] };
    }

    const results: T[] = [];
    const errors: FieldError[] = [];

    for (let i = 0; i < value.length; i++) {
      const itemResult = itemValidator(value[i], `${path}[${i}]`);
      if (itemResult.valid) {
        results.push(itemResult.data);
      } else {
        errors.push(...itemResult.errors);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }
    return { valid: true, data: results };
  };
}

/**
 * Validate array length.
 */
export function arrayLength<T>(
  min: number,
  max?: number
): (validator: Validator<T[]>) => Validator<T[]> {
  return (validator) =>
    (value, path = "value") => {
      const result = validator(value, path);
      if (!result.valid) {
        return result;
      }

      if (result.data.length < min) {
        return {
          valid: false,
          errors: [{ path, message: `must have at least ${min} items`, value }],
        };
      }
      if (max !== undefined && result.data.length > max) {
        return {
          valid: false,
          errors: [{ path, message: `must have at most ${max} items`, value }],
        };
      }
      return result;
    };
}

// ============================================================================
// Object Validators
// ============================================================================

type SchemaValidator<T> = {
  [K in keyof T]: Validator<T[K]>;
};

/**
 * Validate an object against a schema.
 */
export function object<T extends Record<string, unknown>>(
  schema: SchemaValidator<T>
): Validator<T> {
  return (value, path = "value") => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { valid: false, errors: [{ path, message: "must be an object", value }] };
    }

    const result: Record<string, unknown> = {};
    const errors: FieldError[] = [];

    for (const key of Object.keys(schema) as Array<keyof T>) {
      const fieldPath = path ? `${path}.${String(key)}` : String(key);
      const fieldValue = (value as Record<string, unknown>)[key as string];
      const fieldValidator = schema[key];

      const fieldResult = fieldValidator(fieldValue, fieldPath);
      if (fieldResult.valid) {
        result[key as string] = fieldResult.data;
      } else {
        errors.push(...fieldResult.errors);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }
    return { valid: true, data: result as T };
  };
}

/**
 * Make a field optional.
 */
export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
  return (value, path = "value") => {
    if (value === undefined || value === null) {
      return { valid: true, data: undefined };
    }
    return validator(value, path);
  };
}

/**
 * Provide a default value.
 */
export function withDefault<T>(validator: Validator<T>, defaultValue: T): Validator<T> {
  return (value, path = "value") => {
    if (value === undefined || value === null) {
      return { valid: true, data: defaultValue };
    }
    return validator(value, path);
  };
}

// ============================================================================
// Combinators
// ============================================================================

/**
 * Validate against multiple validators (all must pass).
 */
export function and<T>(validators: Validator<unknown>[]): Validator<T> {
  return (value, path = "value") => {
    for (const validator of validators) {
      const result = validator(value, path);
      if (!result.valid) {
        return result as ValidateResult<T>;
      }
    }
    return { valid: true, data: value as T };
  };
}

/**
 * Validate against one of multiple validators (first match wins).
 */
export function or<T>(validators: Validator<T>[]): Validator<T> {
  return (value, path = "value") => {
    const allErrors: FieldError[] = [];

    for (const validator of validators) {
      const result = validator(value, path);
      if (result.valid) {
        return result;
      }
      allErrors.push(...result.errors);
    }

    return { valid: false, errors: [{ path, message: "no validator matched", value }] };
  };
}

/**
 * Validate that value is one of allowed values.
 */
export function oneOf<T extends string | number>(allowed: readonly T[]): Validator<T> {
  return (value, path = "value") => {
    if (!allowed.includes(value as T)) {
      return {
        valid: false,
        errors: [{ path, message: `must be one of: ${allowed.join(", ")}`, value }],
      };
    }
    return { valid: true, data: value as T };
  };
}

// ============================================================================
// String Validators
// ============================================================================

/**
 * Validate string length.
 */
export function stringLength(min: number, max?: number): Validator<string> {
  return (value, path = "value") => {
    if (typeof value !== "string") {
      return { valid: false, errors: [{ path, message: "must be a string", value }] };
    }
    if (value.length < min) {
      return {
        valid: false,
        errors: [{ path, message: `must be at least ${min} characters`, value }],
      };
    }
    if (max !== undefined && value.length > max) {
      return {
        valid: false,
        errors: [{ path, message: `must be at most ${max} characters`, value }],
      };
    }
    return { valid: true, data: value };
  };
}

/**
 * Validate string matches pattern.
 */
export function pattern(regex: RegExp, description?: string): Validator<string> {
  return (value, path = "value") => {
    if (typeof value !== "string") {
      return { valid: false, errors: [{ path, message: "must be a string", value }] };
    }
    if (!regex.test(value)) {
      return {
        valid: false,
        errors: [{ path, message: description || `must match pattern ${regex}`, value }],
      };
    }
    return { valid: true, data: value };
  };
}

/**
 * Validate URL format.
 */
export function url(): Validator<string> {
  return (value, path = "value") => {
    if (typeof value !== "string") {
      return { valid: false, errors: [{ path, message: "must be a string", value }] };
    }
    try {
      new URL(value);
      return { valid: true, data: value };
    } catch {
      return { valid: false, errors: [{ path, message: "must be a valid URL", value }] };
    }
  };
}

/**
 * Validate email format.
 */
export function email(): Validator<string> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern(emailRegex, "must be a valid email address");
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate and throw if invalid.
 */
export function validate<T>(validator: Validator<T>, value: unknown, path?: string): T {
  const result = validator(value, path);
  if (!result.valid) {
    throw new ValidationError(result.errors);
  }
  return result.data;
}

/**
 * Create a validated parse function.
 */
export function createParser<T>(validator: Validator<T>): (value: unknown) => T {
  return (value) => validate(validator, value);
}

/**
 * Try to validate, returning undefined on failure.
 */
export function tryValidate<T>(validator: Validator<T>, value: unknown): T | undefined {
  const result = validator(value);
  return result.valid ? result.data : undefined;
}
