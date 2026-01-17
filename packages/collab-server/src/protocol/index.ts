/**
 * Protocol module exports
 */

export {
  createVersionMismatchError,
  DEPRECATED_VERSIONS,
  isVersionDeprecated,
  isVersionSupported,
  MIN_SUPPORTED_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  validateProtocolVersion,
} from "./versionGuard";
