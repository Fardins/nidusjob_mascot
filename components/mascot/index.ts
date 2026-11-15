/**
 * Public surface of the mascot package. Everything exported here is
 * three.js-free except the lazily-loaded stage components, so importing the
 * API never pulls the 3D bundle into the main chunk.
 */
export { MascotStage, type MascotStageProps } from "./MascotStage";
export { MascotHost, MascotSlot } from "./MascotHost";
export { ChatPanel } from "./chat/ChatPanel";
export { useMascotAssistant } from "./chat/useMascotAssistant";
export { streamChat, type ChatMessage } from "./chat/transport";

export { mascot, type MascotAPI, type MascotEventName, type MascotReaction, type SpeakOptions } from "./brain/api";
export { mascotStore, useMascot, type ReactionName, type MascotState } from "./store";
export {
  EXPRESSIONS,
  EXPRESSION_META,
  EXPRESSION_NAMES,
  type ExpressionName,
  type ExpressionParams,
} from "./brain/expressions";
export { tagToEmotion, emotionToExpression, type Emotion, type EmotionState } from "./brain/emotion";
export { profileForPath, PROFILES, type BehaviorProfile } from "./brain/profiles";
export { REACTION_NAMES, GESTURE_NAMES, type AssistantState, type GestureName, type Placement } from "./brain/types";
export { setMascotTelemetry, type TelemetryEvent } from "./brain/telemetry";
export { DEFAULT_CLICK_REACTIONS, type ClickReaction } from "./reactions";
export { PALETTE } from "./palette";
// Optional: lip-sync to a playing <audio>/<video> element.
export { setMascotLipSyncAudio } from "./plush/lipSync";
