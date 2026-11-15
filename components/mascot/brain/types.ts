/** Shared vocabulary of the mascot (three.js-free). */

export type AssistantState =
  | "offscreen"
  | "welcome"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "success"
  | "confused"
  | "error"
  | "drowsy"
  | "sleeping"
  | "waking"
  | "goodbye";

export type StatePhase = "enter" | "loop" | "exit";

/** One-shot body actions (anticipation → action → follow-through → settle). */
export type ReactionName =
  // original set (kept for compatibility)
  | "jump"
  | "spin"
  | "wave"
  | "nod"
  | "shake"
  | "squash"
  // jump variants (`jump` picks one at random)
  | "hop"
  | "doubleHop"
  | "spinJump"
  // reactions
  | "startle"
  | "flinch"
  | "shrug"
  | "laugh"
  | "bow"
  | "dizzy"
  | "curiousTilt"
  | "celebrate"
  | "giggle"
  // idle variations
  | "lookAround"
  | "stretch"
  | "yawn"
  | "scratchHead"
  | "adjustGlasses"
  | "straightenCap"
  | "tapWrist"
  | "humSway"
  | "lookAndSmile"
  | "headNod";

export const REACTION_NAMES: ReactionName[] = [
  "jump", "spin", "wave", "nod", "shake", "squash", "hop", "doubleHop", "spinJump", "startle", "flinch", "shrug",
  "laugh", "bow", "dizzy", "curiousTilt", "celebrate", "giggle", "lookAround", "stretch", "yawn", "scratchHead",
  "adjustGlasses", "straightenCap", "tapWrist", "humSway", "lookAndSmile", "headNod",
];

/** Talking gestures (arm poses blended over the base layer). */
export type GestureName =
  | "openPalm"
  | "pointSide"
  | "count"
  | "shrug"
  | "pinch"
  | "bigIdea"
  | "chinTouch"
  | "beat"
  | "tapWrist"
  | "presentWrist"
  | "handsTogether";

export const GESTURE_NAMES: GestureName[] = [
  "openPalm", "pointSide", "count", "shrug", "pinch", "bigIdea", "chinTouch", "beat", "tapWrist", "presentWrist", "handsTogether",
];

/** Transient visual effects. */
export type FxName = "sparkles" | "confetti" | "question" | "warning" | "glint" | "ripple" | "browFlash" | "hearts" | "twitch" | "tasselFlip";

/** Where the character is shown. */
export type Placement = "hero" | "docked" | "minimized" | "hidden";

/** Camera framing presets. */
export type Framing = "hero" | "chat" | "widget" | "face";
