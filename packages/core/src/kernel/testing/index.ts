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
  DEFAULT_FUZZ_CONFIG,
  createRng,
  generateOp,
  nextRandom,
  randomElement,
  randomInt,
  randomString,
  selectOpType,
  type RngState,
} from "./generators.js";
export {
  GOLDEN_FIXTURES,
  compareAgainstGolden,
  createGoldenFixture,
  deserializeFixture,
  runGoldenFixtureTests,
  serializeFixture,
} from "./goldenFixtures.js";
export {
  NETWORK_SCENARIOS,
  advanceNetwork,
  createNetworkSim,
  enqueueNetworkMessage,
  formatPartitionSchedule,
  mergeNetworkStats,
  resolveNetworkScenario,
  summarizeNetworkLog,
} from "./networkSim.js";
export * from "./types.js";
