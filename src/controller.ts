export type Mode = "screen" | "torch";
export function parseFrequency(draft: string): number | null {
  if (!/^\d+(?:\.\d?)?$/.test(draft)) return null;
  const value = Number(draft);
  return Number.isFinite(value) && value >= 0.1 && value <= 999 ? value : null;
}
export const validFrequency = (value: number) => Number.isFinite(value) && value >= 0.1 && value <= 999 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
type TorchConstraint = MediaTrackConstraintSet & { torch: boolean };
export interface TorchDiagnostics {
 schemaVersion: number; schedulerVersion: string; runDurationMs: number; trace: CommandTrace[]; skippedByReason: Record<SkipReason, number>;
 targetHz: number; sampleCount: number; retainedSamples: number;
 commandMeanMs: number; commandP95Ms: number; commandMaxMs: number;
 latenessMeanMs: number; latenessMaxMs: number; skippedEdges: number;
 observedTooSlow: boolean; active: boolean;
}
type SkipReason = "scheduler" | "rateLimit" | "commandBudget";
interface CommandTrace { plannedMs: number; startMs: number; endMs: number; durationMs: number; state: boolean; edge: number; skips: number; reasons: Record<SkipReason, number>; }
export class StrobeController {
 private trace: CommandTrace[] = [];
 private reasons = {scheduler:0, rateLimit:0, commandBudget:0};
 private pendingReasons = {scheduler:0, rateLimit:0, commandBudget:0};
 private lastStart = -Infinity; private endedAt: number | undefined;
 private samples: number[] = [];
 private sampleCount = 0; private commandTotal = 0; private commandMax = 0;
 private lateTotal = 0; private lateMax = 0; private skipped = 0; private observations = 0;
 private origin = 0; private nextEdge = 0; private lastState = false;
 getDiagnostics(): TorchDiagnostics {
   const sorted = [...this.samples].sort((a,b)=>a-b);
   return { schemaVersion: 2, schedulerVersion: "start-grid-v2", runDurationMs: this.sampleCount || this.active ? (this.endedAt ?? performance.now())-this.origin : 0, trace: this.trace.map(t=>({...t,reasons:{...t.reasons}})), skippedByReason: {...this.reasons}, targetHz: this.frequency, sampleCount: this.sampleCount, retainedSamples: sorted.length,
     commandMeanMs: this.sampleCount ? this.commandTotal/this.sampleCount : 0,
     commandP95Ms: sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)] ?? 0, commandMaxMs: this.commandMax,
     latenessMeanMs: this.observations ? this.lateTotal/this.observations : 0,
     latenessMaxMs: this.lateMax, skippedEdges: this.skipped,
     observedTooSlow: this.observations >= 3 && (this.skipped > 0 || this.lateMax > 500/this.frequency),
     active: this.active && this.mode === "torch" };
 }

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
  setFrequency(value: number) {
    if (!validFrequency(value)) throw new RangeError("频率须为 0.1–999 Hz，最多一位小数。");
    this.frequency = value;
  }
  private write(track: MediaStreamTrack, on: boolean, started?: () => void) {
    const operation = this.queue.then(() => {
      started?.();
      return track.applyConstraints({ advanced: [{ torch: on } as TorchConstraint] });
    });
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
    if (this.active && this.mode === "torch") this.endedAt = performance.now();
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
    try {
      this.setFrequency(frequency);
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
      else {
 this.samples=[]; this.sampleCount=this.commandTotal=this.commandMax=0;
 this.lateTotal=this.lateMax=this.skipped=this.observations=0;
 this.trace=[]; this.reasons={scheduler:0,rateLimit:0,commandBudget:0};
 this.pendingReasons={scheduler:0,rateLimit:0,commandBudget:0}; this.lastStart=-Infinity; this.endedAt=undefined;
 this.origin=performance.now(); this.nextEdge=0; this.lastState=false;
 void this.tick(token);
 }
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
  // Absolute grid; minimum spacing is measured from actual command START.
  private async tick(token: number) {
    if (!this.active || token !== this.generation || !this.track) return;
    const half = 500 / this.frequency;
    const deadline = () => this.origin + this.nextEdge * half;
    const omit = (reason: SkipReason) => {
      this.skipped++; this.reasons[reason]++; this.pendingReasons[reason]++; this.nextEdge++;
    };
    const schedule = () => {
      this.timer=setTimeout(()=>void this.tick(token),Math.max(0,deadline()-performance.now()));
    };
    const now=performance.now();
    // Early timers rearm; small lateness retains the current grid interval.
    if(now<deadline() || now<this.lastStart+16) {
      this.timer=setTimeout(()=>void this.tick(token),Math.max(1,Math.max(deadline(),this.lastStart+16)-now)); return;
    }
    let latest=Math.floor((now-this.origin+1e-7)/half);
    // Under sub-timer-resolution grids, use the latest opposite phase rather
    // than starving forever on repeated same-parity timer samples.
    if (half < 1 && (latest%2===0)===this.lastState && latest>this.nextEdge) latest--;
    while(this.nextEdge<latest) omit("scheduler");
    if((this.nextEdge%2===0)===this.lastState) {
      omit("scheduler");
      // Preserve the next opposite edge on rearm, even when timer resolution
      // exceeds a half-period: otherwise every callback can alias same-state.
      this.timer=setTimeout(()=>void this.tick(token),Math.max(1,Math.ceil(deadline()-performance.now())));
      return;
    }
    const edge=this.nextEdge, planned=deadline(), on=edge%2===0;
    let began=now;
    try {
      await this.write(this.track,on,()=>{began=performance.now();});
      if(!this.active || token!==this.generation) return;
      const end=performance.now(), duration=end-began, late=Math.max(0,began-planned);
      this.lastStart=began; this.lastState=on;
      this.sampleCount++; this.commandTotal+=duration; this.commandMax=Math.max(this.commandMax,duration);
      this.lateTotal+=late; this.lateMax=Math.max(this.lateMax,late); this.observations++;
      if(this.samples.length===256) this.samples.shift(); this.samples.push(duration);
      if(this.trace.length===256) this.trace.shift();
      this.trace.push({plannedMs:planned-this.origin,startMs:began-this.origin,endMs:end-this.origin,
        durationMs:duration,state:on,edge,skips:Object.values(this.pendingReasons).reduce((a,b)=>a+b,0),reasons:{...this.pendingReasons}});
      this.pendingReasons={scheduler:0,rateLimit:0,commandBudget:0}; this.nextEdge++;
      // Each omitted transition (including parity partner) gets exactly one cause.
      // Epsilon preserves completed exact boundaries; no completion+16ms floor.
      let cause: SkipReason="commandBudget";
      while(deadline()<end-1e-7 || deadline()<began+16 || (this.nextEdge%2===0)===this.lastState) {
        if(deadline()<end-1e-7) cause="commandBudget";
        else if(deadline()<began+16) cause="rateLimit";
        omit(cause);
      }
      schedule();
    } catch {
      if(token===this.generation) {
        await this.stop(); this.error("手电筒控制失败，已停止。请降低频率或改用屏幕模式。");
      }
    }
  }
}
