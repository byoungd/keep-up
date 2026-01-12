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
} from "./fuzz";
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
} from "./generators";
export {
  GOLDEN_FIXTURES,
  compareAgainstGolden,
  createGoldenFixture,
  deserializeFixture,
  runGoldenFixtureTests,
  serializeFixture,
} from "./goldenFixtures";
export {
  NETWORK_SCENARIOS,
  advanceNetwork,
  createNetworkSim,
  enqueueNetworkMessage,
  formatPartitionSchedule,
  mergeNetworkStats,
  resolveNetworkScenario,
  summarizeNetworkLog,
} from "./networkSim";
export * from "./types";
