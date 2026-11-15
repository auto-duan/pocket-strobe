export type Mode = "screen" | "torch";
export const clampFrequency = (value: number, mode: Mode) =>
  Math.min(
    mode === "torch" ? 5 : 30,
    Math.max(0.5, Number.isFinite(value) ? Math.round(value * 10) / 10 : 1),
  );
type TorchConstraint = MediaTrackConstraintSet & { torch: boolean };
export class StrobeController {
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private track?: MediaStreamTrack;
  private stream?: MediaStream;
  private queue: Promise<void> = Promise.resolve();
  private frequency = 15;
  private frame?: number;
  private mode: Mode = "screen";
  private active = false;
  constructor(
    private light: (on: boolean) => void,
    private error: (message: string) => void,
  ) {}
  setFrequency(value: number, mode: Mode) {
    this.frequency = clampFrequency(value, mode);
  }
  private write(track: MediaStreamTrack, on: boolean) {
    const operation = this.queue.then(() =>
      track.applyConstraints({ advanced: [{ torch: on } as TorchConstraint] }),
    );
    this.queue = operation.catch(() => {});
    return operation;
  }
  private async dispose(stream: MediaStream) {
    const track = stream.getVideoTracks()[0];
    try {
      if (track?.readyState === "live") await this.write(track, false);
    } catch {
      /* Stopping tracks is the final hardware release fallback. */
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  }
  async stop() {
    ++this.generation;
    this.active = false;
    clearTimeout(this.timer);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.light(false);
    const stream = this.stream;
    this.stream = undefined;
    this.track = undefined;
    if (stream) await this.dispose(stream);
  }
  async start(mode: Mode, frequency: number) {
    const stopping = this.stop();
    const token = this.generation;
    await stopping;
    if (token !== this.generation) return false;
    this.mode = mode;
    this.setFrequency(frequency, mode);
    try {
      if (mode === "torch") {
        if (!window.isSecureContext)
          throw new Error("手电筒需要 HTTPS 安全连接（或本机 localhost）。");
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("此浏览器无法访问相机，请改用屏幕模式。");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: "environment" } },
          audio: false,
        });
        if (token !== this.generation) {
          await this.dispose(stream);
          return false;
        }
        this.stream = stream;
        const track = stream.getVideoTracks()[0];
        if (
          !track ||
          !(
            track.getCapabilities?.() as MediaTrackCapabilities & {
              torch?: boolean;
            }
          )?.torch
        )
          throw new Error(
            "此后置相机或浏览器不支持手电筒控制。iOS 浏览器通常不支持，请改用屏幕模式。",
          );
        this.track = track;
      }
      if (token !== this.generation) return false;
      this.active = true;
      if (mode === "screen") this.screenFrames(token);
      else void this.tick(token, true);
      return true;
    } catch (e) {
      if (token === this.generation) {
        await this.stop();
        const name = (e as DOMException).name;
        this.error(
          name === "NotAllowedError"
            ? "相机权限被拒绝。请在浏览器设置中允许访问，或改用屏幕模式。"
            : name === "OverconstrainedError" || name === "NotFoundError"
              ? "没有找到可用的后置相机，请改用屏幕模式。"
              : name === "NotReadableError"
                ? "相机可能被其他应用占用，请关闭后重试。"
                : (e as Error).message,
        );
      }
      return false;
    }
  }
  // One phase sample per display frame; never catch up missed edges.
  // Bright/dark durations are quantized to display frames, not subframe pulses.
  private screenFrames(token: number) {
    let origin: number | undefined;
    let previous = false;
    const frame = (now: number) => {
      if (!this.active || token !== this.generation) return;
      origin ??= now;
      const period = 1000 / this.frequency;
      // Tiny tolerance stabilizes exact frame/period boundaries against FP error.
      const phase = ((now - origin + 0.001) % period + period) % period;
      const on = phase < period / 2;
      if (on !== previous) {
        previous = on;
        this.light(on);
      }
      this.frame = requestAnimationFrame(frame);
    };
    this.frame = requestAnimationFrame(frame);
  }
  private async tick(token: number, on: boolean) {
    if (!this.active || token !== this.generation) return;
    const began = performance.now();
    try {
      if (this.mode === "torch" && this.track) await this.write(this.track, on);
      else this.light(on);
      if (!this.active || token !== this.generation) return;
      // Never catch up missed pulses; hardware writes are strictly serialized.
      const delay = Math.max(
        0,
        500 / this.frequency - (performance.now() - began),
      );
      this.timer = setTimeout(() => void this.tick(token, !on), delay);
    } catch {
      if (token === this.generation) {
        await this.stop();
        this.error("手电筒控制失败，已停止。请降低频率或改用屏幕模式。");
      }
    }
  }
}
