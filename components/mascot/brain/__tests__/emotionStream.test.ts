import { describe, expect, it } from "vitest";
import { stripTags, TagStreamParser, type StreamEvent } from "../emotionStream";

function run(chunks: string[]) {
  const p = new TagStreamParser();
  const out: StreamEvent[] = [];
  for (const c of chunks) out.push(...p.push(c));
  out.push(...p.flush());
  return out;
}

const textOf = (ev: StreamEvent[]) =>
  ev
    .filter((e): e is Extract<StreamEvent, { type: "text" }> => e.type === "text")
    .map((e) => e.text)
    .join("");

describe("TagStreamParser", () => {
  it("parses emotion and state tags", () => {
    const ev = run(["⟦emotion:happy:0.6⟧Hello! ⟦state:success⟧"]);
    expect(ev).toEqual([
      { type: "emotion", name: "happy", intensity: 0.6 },
      { type: "text", text: "Hello! " },
      { type: "state", state: "success" },
    ]);
  });

  it("handles tags split across chunks", () => {
    const ev = run(["Hi ⟦emo", "tion:curi", "ous:0.4⟧there"]);
    expect(textOf(ev)).toBe("Hi there");
    expect(ev).toContainEqual({ type: "emotion", name: "curious", intensity: 0.4 });
  });

  it("treats an unterminated opener as text at the end", () => {
    const ev = run(["math: a ⟦ b"]);
    expect(ev.every((e) => e.type === "text")).toBe(true);
    expect(textOf(ev)).toBe("math: a ⟦ b");
  });

  it("drops unknown tags and clamps intensity", () => {
    expect(run(["⟦foo:bar⟧x⟦emotion:sad:7⟧"])).toEqual([
      { type: "text", text: "x" },
      { type: "emotion", name: "sad", intensity: 1 },
    ]);
  });

  it("strips tags from finished strings", () => {
    expect(stripTags("⟦emotion:happy:1⟧Yes ⟦state:success⟧done")).toBe("Yes done");
  });
});
