/**
 * Privacy-safe telemetry hook. No-op by default — plug in your analytics
 * with `setMascotTelemetry(fn)`. Events never contain message content or
 * personal data.
 */
export type TelemetryEvent =
  | { name: "quality_tier"; tier: string }
  | { name: "load_time"; ms: number }
  | { name: "webgl_failure"; reason: string }
  | { name: "chat_open"; source: "mascot" | "button" | "keyboard" }
  | { name: "fps_sample"; fps: number; tier: string };

type Sink = (e: TelemetryEvent) => void;

let sink: Sink = () => {};

export function setMascotTelemetry(fn: Sink | null) {
  sink = fn ?? (() => {});
}

export function track(e: TelemetryEvent) {
  try {
    sink(e);
  } catch {
    /* never let telemetry break the page */
  }
}
