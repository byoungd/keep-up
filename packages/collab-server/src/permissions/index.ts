/**
 * Permissions Module
 *
 * Exports role types and permission enforcement.
 */

export {
  type ClientSession,
  type EnforcementResult,
  PermissionEnforcer,
} from "./permissionEnforcer";
export type { ErrorCode, Role } from "./types";
