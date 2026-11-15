"use client";

import { useEffect } from "react";
import { button, folder, monitor, useControls } from "leva";
import { mascot } from "./brain/api";
import { EXPRESSION_NAMES, type ExpressionName } from "./brain/expressions";
import { GESTURE_NAMES, REACTION_NAMES, type AssistantState, type GestureName, type ReactionName } from "./brain/types";
import { STATE_DEFS } from "./brain/machine";
import { mascotStore } from "./store";
import { debugStats } from "./render/DebugStats";

const STATES = Object.keys(STATE_DEFS) as AssistantState[];

/** Dev-only panel (`?debug`): trigger anything, scrub emotion, switch tier, watch perf. */
export default function DebugPanel() {
  const { state, expression, reaction, gesture, valence, arousal, intensity, emotionOn, tier } = useControls({
    behaviour: folder({
      state: { options: STATES, value: "idle" as AssistantState },
      expression: { options: ["(state)", ...EXPRESSION_NAMES], value: "(state)" },
      reaction: { options: REACTION_NAMES, value: "hop" as ReactionName },
      play: button((get) => mascot.react(get("behaviour.reaction") as ReactionName)),
      gesture: { options: GESTURE_NAMES, value: "openPalm" as GestureName },
      gesturePlay: button((get) => mascot.gesture(get("behaviour.gesture") as GestureName, 1.6)),
      celebrate: button(() => mascot.react("celebrate")),
      speak: button(() => void mascot.speak({ text: "Hello! I can explain anything. First, we look at the problem. Then, we solve it together!" })),
    }),
    emotion: folder({
      emotionOn: false,
      valence: { value: 0.5, min: -1, max: 1, step: 0.01 },
      arousal: { value: 0.5, min: 0, max: 1, step: 0.01 },
      intensity: { value: 0.8, min: 0, max: 1, step: 0.01 },
    }),
    render: folder({
      tier: { options: ["auto", "high", "medium", "mobile", "low"], value: "auto" },
      fps: monitor(() => debugStats.fps, { graph: true, interval: 250 }),
      drawCalls: monitor(() => debugStats.calls, { interval: 500 }),
      triangles: monitor(() => debugStats.triangles, { interval: 500 }),
    }),
  });

  useEffect(() => mascot.setState(state), [state]);
  useEffect(() => {
    if (expression === "(state)") mascotStore.clearExpression();
    else mascotStore.setExpression(expression as ExpressionName);
  }, [expression]);
  useEffect(() => {
    mascot.setEmotion(emotionOn ? { valence, arousal, intensity } : null);
  }, [emotionOn, valence, arousal, intensity]);
  useEffect(() => {
    mascotStore.set({ qualityOverride: tier === "auto" ? null : (tier as "high" | "medium" | "mobile" | "low") });
  }, [tier]);
  void reaction;
  void gesture;
  return null;
}
