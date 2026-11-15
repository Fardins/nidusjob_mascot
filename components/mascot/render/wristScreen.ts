import type { MascotMaterials } from "../materials";
import type { AssistantState } from "../brain/types";

/**
 * Draws the smart wrist device's tiny screen: time, a pulse icon and a
 * notification count / progress ring. Redrawn a few times per second only.
 */
export function drawWristScreen(m: MascotMaterials, t: number, state: AssistantState, notifications: number) {
  const c = m.wristCanvas;
  const tex = m.wristTexture;
  if (!c || !tex) return;
  const g = c.getContext("2d");
  if (!g) return;
  const W = c.width;
  g.fillStyle = "#06121f";
  g.fillRect(0, 0, W, W);

  const accent = state === "error" ? "#ffb020" : state === "thinking" ? "#86d6ff" : state === "success" ? "#5bff8a" : "#d9ff5a";

  if (state === "thinking") {
    // progress ring
    g.strokeStyle = "rgba(134,214,255,0.25)";
    g.lineWidth = 10;
    g.beginPath();
    g.arc(W / 2, W / 2, 38, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = accent;
    g.beginPath();
    const a = (t * 4) % (Math.PI * 2);
    g.arc(W / 2, W / 2, 38, a, a + 1.8);
    g.stroke();
  } else {
    const d = new Date();
    g.fillStyle = "#e8f4ff";
    g.font = "bold 40px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`, W / 2, W / 2 - 14);
    // pulse line
    g.strokeStyle = accent;
    g.lineWidth = 4;
    g.beginPath();
    const y = W / 2 + 28;
    for (let x = 10; x < W - 10; x += 4) {
      const ph = (x / W) * 6 - t * 3;
      const spike = Math.exp(-Math.pow(((ph % 3) + 3) % 3 - 1.5, 2) * 18) * 16;
      if (x === 10) g.moveTo(x, y - spike);
      else g.lineTo(x, y - spike);
    }
    g.stroke();
  }
  if (notifications > 0) {
    g.fillStyle = "#ff4d6d";
    g.beginPath();
    g.arc(W - 20, 20, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "bold 18px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(Math.min(9, notifications)), W - 20, 21);
  }
  tex.needsUpdate = true;
}
