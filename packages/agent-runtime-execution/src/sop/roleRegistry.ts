/**
 * Role Registry
 *
 * Registry for storing and retrieving role definitions.
 * Provides a central location for managing available SOPs.
 */

import { ARCHITECT_SOP, CODER_SOP, RESEARCHER_SOP, REVIEWER_SOP } from "./presets";
import type { RoleDefinition } from "./types";

// ============================================================================
// Interface
// ============================================================================

/**
 * Interface for role registry operations.
 */
export interface IRoleRegistry {
  /** Register a role definition */
  register(role: RoleDefinition): void;
  /** Get a role definition by name */
  get(name: string): RoleDefinition | undefined;
  /** List all registered role names */
  list(): string[];
  /** Check if a role is registered */
  has(name: string): boolean;
  /** Remove a role from the registry */
  remove(name: string): boolean;
  /** Get all registered role definitions */
  getAll(): RoleDefinition[];
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Registry for role definitions.
 * Stores role definitions and provides lookup by name.
 */
export class RoleRegistry implements IRoleRegistry {
  private readonly roles = new Map<string, RoleDefinition>();

  /**
   * Register a role definition.
   * Overwrites any existing role with the same name.
   */
  register(role: RoleDefinition): void {
    this.roles.set(role.name, role);
  }

  /**
   * Get a role definition by name.
   * @returns The role definition or undefined if not found
   */
  get(name: string): RoleDefinition | undefined {
    return this.roles.get(name);
  }

  /**
   * List all registered role names.
   */
  list(): string[] {
    return Array.from(this.roles.keys());
  }

  /**
   * Check if a role is registered.
   */
  has(name: string): boolean {
    return this.roles.has(name);
  }

  /**
   * Remove a role from the registry.
   * @returns true if the role was removed, false if it didn't exist
   */
  remove(name: string): boolean {
    return this.roles.delete(name);
  }

  /**
   * Get all registered role definitions.
   */
  getAll(): RoleDefinition[] {
    return Array.from(this.roles.values());
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new RoleRegistry with the default preset roles.
 */
export function createDefaultRoleRegistry(): RoleRegistry {
  const registry = new RoleRegistry();
  registry.register(CODER_SOP);
  registry.register(RESEARCHER_SOP);
  registry.register(REVIEWER_SOP);
  registry.register(ARCHITECT_SOP);
  return registry;
}

/**
 * Create an empty RoleRegistry.
 */
export function createRoleRegistry(): RoleRegistry {
  return new RoleRegistry();
}
