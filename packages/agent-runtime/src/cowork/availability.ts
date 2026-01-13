/**
 * Cowork Availability Gate
 *
 * Enforces platform gating for Cowork mode.
 */

export interface CoworkAvailabilityConfig {
  platform: string;
  allowedPlatforms?: string[];
}

export interface CoworkAvailabilityResult {
  available: boolean;
  reason?: string;
}

export function checkCoworkAvailability(
  config: CoworkAvailabilityConfig
): CoworkAvailabilityResult {
  const allowedPlatforms = config.allowedPlatforms ?? ["darwin"];

  if (!allowedPlatforms.includes(config.platform)) {
    return {
      available: false,
      reason: `Cowork is not available on ${config.platform}`,
    };
  }

  return { available: true };
}
