/**
 * Protocol module exports
 */

export {
  SUPPORTED_PROTOCOL_VERSIONS,
  DEPRECATED_VERSIONS,
  MIN_SUPPORTED_VERSION,
  isVersionSupported,
  isVersionDeprecated,
  validateProtocolVersion,
  createVersionMismatchError,
} from "./versionGuard";
