/**
 * Teams Module
 *
 * Team registry and group chat routing.
 */

export { GroupChatSession } from "./groupChat";
export type {
  TeamManager,
  TeamManagerDecision,
  TeamManagerInput,
  TeamProcessControllerOptions,
  TeamProcessDecision,
  TeamProcessState,
  TeamProcessStatus,
  TeamProcessStep,
} from "./processModes";
export { createTeamProcessController, TeamProcessController } from "./processModes";
export { createTeamRegistry, TeamRegistry } from "./teamRegistry";
export type {
  TeamChatPayload,
  TeamChatScope,
  TeamCheckpointInfo,
  TeamDefinition,
  TeamMessage,
  TeamMessageRole,
  TeamParticipant,
  TeamParticipantMatch,
  TeamProcessMode,
  TeamRegistration,
} from "./types";
