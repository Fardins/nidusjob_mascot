import type { ExpressionName } from "./expressions";
import type { ReactionName } from "./store";

export interface ClickReaction {
  expression: ExpressionName;
  reaction: ReactionName;
  say?: string;
}

export const DEFAULT_CLICK_REACTIONS: ClickReaction[] = [
  { expression: "excited", reaction: "jump", say: "Hi there! I'm Nidus." },
  { expression: "surprised", reaction: "squash", say: "Whoa! That tickles." },
  { expression: "happy", reaction: "wave", say: "Need a hand? Just ask me." },
  { expression: "excited", reaction: "spin", say: "Wheee!" },
  { expression: "thinking", reaction: "nod", say: "Hmm… let me think about that." },
  { expression: "curious", reaction: "shake", say: "What are we building today?" },
];
