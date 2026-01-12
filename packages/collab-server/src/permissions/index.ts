/**
 * Permissions Module
 *
 * Exports role types and permission enforcement.
 */

export type { Role, ErrorCode } from "./types";
export {
  PermissionEnforcer,
  type ClientSession,
  type EnforcementResult,
} from "./permissionEnforcer";
