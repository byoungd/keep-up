/**
 * LFCC v0.9 RC - Testing Module
 */

export {
  checkConvergence,
  createTestHarness,
  formatSECResult,
  runFuzz,
  runFuzzIteration,
  runSECAssertion,
} from "./fuzz.js";
export {
  createRng,
  DEFAULT_FUZZ_CONFIG,
  generateOp,
  nextRandom,
  type RngState,
  randomElement,
  randomInt,
  randomString,
  selectOpType,
} from "./generators.js";
export {
  compareAgainstGolden,
  createGoldenFixture,
  deserializeFixture,
  GOLDEN_FIXTURES,
  runGoldenFixtureTests,
  serializeFixture,
} from "./goldenFixtures.js";
export {
  advanceNetwork,
  createNetworkSim,
  enqueueNetworkMessage,
  formatPartitionSchedule,
  mergeNetworkStats,
  NETWORK_SCENARIOS,
  resolveNetworkScenario,
  summarizeNetworkLog,
} from "./networkSim.js";
export * from "./types.js";
