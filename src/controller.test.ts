import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseFrequency, StrobeController } from "./controller";
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function hardware(supported = true) {
  const writes: boolean[] = [];
  const track = {
    readyState: "live",
    stop: vi.fn(),
    getCapabilities: () => ({ torch: supported }),
    applyConstraints: vi.fn(async (c: any) => {
      writes.push(c.advanced[0].torch);
    }),
  };
  return {
    track,
    writes,
    stream: {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("window", { isSecureContext: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("shared strict frequency", () => {
  it.each(["0.1", "12.3", "999", "999.0", "12."])("accepts %s without rounding", draft => expect(parseFrequency(draft)).toBe(Number(draft)));
  it.each(["", "0", "-1", "NaN", "Infinity", "1000", "0.01", "12.34", "1e2", ".1", " 12", "+12"])("rejects %s", draft => expect(parseFrequency(draft)).toBeNull());
});
it("never starts automatically; screen stop cancels all future pulses", async () => {
  const light = vi.fn();
  const c = new StrobeController(light, vi.fn());
  expect(light).not.toHaveBeenCalled();
  await c.start("screen", 1);
  await vi.advanceTimersByTimeAsync(16);
  expect(light).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(512);
  expect(light).toHaveBeenLastCalledWith(false);
  await c.stop();
  light.mockClear();
  await vi.advanceTimersByTimeAsync(3000);
  expect(light).not.toHaveBeenCalled();
});
it("immediate stop during initial await cannot restart", async () => {
  const light = vi.fn();
  const c = new StrobeController(light, vi.fn());
  const pending = c.start("screen", 1);
  await c.stop();
  expect(await pending).toBe(false);
  expect(light.mock.calls.some(([on]) => on)).toBe(false);
});
it("late permission stream is turned off and disposed after cancellation", async () => {
  const h = hardware();
  let resolve!: (s: MediaStream) => void;
  const getUserMedia = vi.fn(
    () => new Promise<MediaStream>((r) => (resolve = r)),
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const c = new StrobeController(vi.fn(), vi.fn());
  const pending = c.start("torch", 1);
  await flush();
  await c.stop();
  resolve(h.stream);
  expect(await pending).toBe(false);
  expect(h.writes).toEqual([false]);
  expect(h.track.stop).toHaveBeenCalledOnce();
  expect(getUserMedia).toHaveBeenCalledWith({
    video: { facingMode: { exact: "environment" } },
    audio: false,
  });
});
it("unsupported torch cleans stream and explains failure", async () => {
  const h = hardware(false),
    error = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => h.stream },
  });
  const c = new StrobeController(vi.fn(), error);
  expect(await c.start("torch", 1)).toBe(false);
  expect(h.track.stop).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledWith(expect.stringContaining("不支持"));
});
it("serializes slow hardware writes and queues off before track release", async () => {
  const h = hardware();
  let resolve!: () => void;
  let inFlight = 0,
    max = 0;
  h.track.applyConstraints.mockImplementation(async (c: any) => {
    inFlight++;
    max = Math.max(max, inFlight);
    h.writes.push(c.advanced[0].torch);
    await new Promise<void>((r) => (resolve = r));
    inFlight--;
  });
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => h.stream },
  });
  const c = new StrobeController(vi.fn(), vi.fn());
  await c.start("torch", 999);
  await flush();
  await vi.advanceTimersByTimeAsync(2000);
  expect(h.writes).toEqual([true]);
  const stopping = c.stop();
  expect(h.track.stop).not.toHaveBeenCalled();
  resolve();
  await flush();
  expect(h.writes).toEqual([true, false]);
  resolve();
  await stopping;
  expect(max).toBe(1);
  expect(h.track.stop).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(2000);
  expect(h.writes).toEqual([true, false]);
});
it("permission denial gives actionable message", async () => {
  const error = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    },
  });
  const c = new StrobeController(vi.fn(), error);
  expect(await c.start("torch", 1)).toBe(false);
  expect(error).toHaveBeenCalledWith(expect.stringContaining("权限被拒绝"));
});

it.each([0.1, 12.3, 12, 15, 20, 24, 30, 999])("samples %s Hz once per frame and drops missed frames", async (hz) => {
  const pending = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { pending.set(++id, cb); return id; });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => pending.delete(key));
  const light = vi.fn();
  const c = new StrobeController(light, vi.fn());
  await c.start("screen", hz);
  light.mockClear();
  const step = (now: number) => {
    const callbacks = [...pending.values()]; pending.clear();
    const before = light.mock.calls.length;
    callbacks.forEach(cb => cb(now));
    expect(light.mock.calls.length - before).toBeLessThanOrEqual(1);
    expect(pending.size).toBe(1);
  };
  step(100);
  expect(light).toHaveBeenLastCalledWith(true);
  step(100 + 750 / hz);
  expect(light).toHaveBeenLastCalledWith(false);
  step(100 + 1000 * 100 / hz);
  expect(light).toHaveBeenLastCalledWith(true);
  await c.stop();
  expect(pending.size).toBe(0);
  expect(light).toHaveBeenLastCalledWith(false);
});

it("999 Hz torch keeps target but bounds scheduling without backlog", async () => {
 const h = hardware();
 vi.stubGlobal("navigator", {mediaDevices:{getUserMedia:async()=>h.stream}});
 const c = new StrobeController(vi.fn(), vi.fn());
 expect(await c.start("torch",999)).toBe(true);
 expect((c as any).frequency).toBe(999);
 await vi.advanceTimersByTimeAsync(1000);
 expect(h.writes.length).toBeGreaterThan(1);
 expect(h.writes.length).toBeLessThanOrEqual(64);
 await c.stop();
 const count=h.writes.length;
 await vi.advanceTimersByTimeAsync(1000);
 expect(h.writes.length).toBe(count);
 expect(vi.getTimerCount()).toBe(0);
});
it.each([0, -1, NaN, Infinity, 1000, 12.34])("controller rejects invalid %s instead of clamping", async value => {
 const error=vi.fn(), light=vi.fn(); const c=new StrobeController(light,error);
 expect(await c.start("screen",value)).toBe(false);
 expect(error).toHaveBeenCalled();
 expect(vi.getTimerCount()).toBe(0);
});

it("10Hz alternating 10/90ms writes stay on absolute grid without catch-up", async () => {
 const h=hardware(), starts:number[]=[], states:boolean[]=[]; let inflight=0,max=0;
 h.track.applyConstraints.mockImplementation(async (c:any)=>{
  const on=c.advanced[0].torch; states.push(on); starts.push(performance.now());
  max=Math.max(max,++inflight);
  await new Promise<void>(r=>setTimeout(r,states.length%2 ? 10:90)); --inflight;
 });
 vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:async()=>h.stream}});
 const c=new StrobeController(vi.fn(),vi.fn()); await c.start("torch",10);
 await vi.advanceTimersByTimeAsync(1000);
 expect(starts.slice(0,8)).toEqual([0,50,200,250,400,450,600,650]);
 expect(states.every((s,i)=>i===0 || s!==states[i-1])).toBe(true);
 expect(max).toBe(1);
 const d=c.getDiagnostics();
 expect(d.sampleCount).toBe(10); expect(d.commandMeanMs).toBe(50);
 expect(d.commandP95Ms).toBe(90); expect(d.commandMaxMs).toBe(90);
 expect(d.skippedEdges).toBe(10); expect(d.observedTooSlow).toBe(true);
 console.log("10Hz simulation",JSON.stringify({starts:starts.slice(0,10),samples:d.sampleCount,skipped:d.skippedEdges}));
 const stop=c.stop(); await vi.advanceTimersByTimeAsync(200); await stop;
 expect(c.getDiagnostics().sampleCount).toBe(10);
});
it("late timers skip expired edges and never replay bursts",async()=>{
 const h=hardware();vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:async()=>h.stream}});
 const c=new StrobeController(vi.fn(),vi.fn()); await c.start("torch",10);await flush();
 // Move monotonic time independently, simulating a suspended event loop.
 vi.spyOn(performance,"now").mockReturnValue(525);
 await vi.advanceTimersByTimeAsync(50);await flush();
 expect(h.writes).toEqual([true]);
 vi.spyOn(performance,"now").mockReturnValue(550);
 await vi.advanceTimersByTimeAsync(25);await flush();
 expect(h.writes).toEqual([true,false]);
 expect(c.getDiagnostics().skippedEdges).toBeGreaterThanOrEqual(9);
 await c.stop();vi.restoreAllMocks();
});
it("diagnostics ignore stopped in-flight writes and reset with a new run",async()=>{
 const h=hardware();let release!:()=>void;
 h.track.applyConstraints.mockImplementationOnce(()=>new Promise<void>(r=>release=r));
 vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:async()=>h.stream}});
 const c=new StrobeController(vi.fn(),vi.fn());await c.start("torch",10);await flush();
 const stopping=c.stop();release();await stopping;
 expect(c.getDiagnostics().sampleCount).toBe(0);
 await c.start("torch",999);await vi.advanceTimersByTimeAsync(6000);
 expect(c.getDiagnostics().retainedSamples).toBeLessThanOrEqual(256);
 expect(c.getDiagnostics().sampleCount).toBeGreaterThan(256);
 await c.stop();await c.start("torch",1);await flush();
 expect(c.getDiagnostics().sampleCount).toBe(1);expect(c.getDiagnostics().skippedEdges).toBe(0);
 await c.stop();
});

// Manual monotonic clock avoids integer timer quantization and tests exact API time.
async function simulate(delays:number[], hz=10, jitter=0, until=500) {
 let now=0, n=0; const starts:number[]=[];
 const tasks:{at:number; cb:()=>void}[]=[];
 vi.spyOn(performance,"now").mockImplementation(()=>now);
 vi.stubGlobal("setTimeout",(cb:()=>void,ms:number)=>{tasks.push({at:now+ms+jitter,cb});return tasks.length;});
 vi.stubGlobal("clearTimeout",()=>{});
 const h=hardware();
 h.track.applyConstraints.mockImplementation(async()=>{
  starts.push(now); const d=delays[n++%delays.length];
  await new Promise<void>(r=>tasks.push({at:now+d,cb:r}));
 });
 vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:async()=>h.stream}});
 const c=new StrobeController(vi.fn(),vi.fn());await c.start("torch",hz);await flush();
 for(let i=0;i<10000;i++) {
  tasks.sort((a,b)=>a.at-b.at);const t=tasks[0];if(!t || t.at>until)break;
  tasks.shift();now=t.at;t.cb();await flush();
 }
 return {c,starts};
}
it.each([0,10,35,40,48,50])("10Hz %sms API commands have zero artificial skips",async delay=>{
 const {c,starts}=await simulate([delay]);
 expect(starts.slice(0,8)).toEqual([0,50,100,150,200,250,300,350]);
 expect(c.getDiagnostics().skippedEdges).toBe(0);
 expect(c.getDiagnostics().trace[0]).toMatchObject({plannedMs:0,startMs:0,endMs:delay,durationMs:delay,state:true,edge:0,skips:0});
});
it("documents old completion+16 regression",()=>{
 const starts=[0];for(let i=0;i<4;i++){
  let edge=Math.ceil((starts.at(-1)!+40+16)/50);
  if(edge%2===((starts.at(-1)!/50)%2))edge++;
  starts.push(edge*50);
 }
 expect(starts).toEqual([0,150,300,450,600]);
});
it.each([0.3,1.9])("10Hz boundary timer lateness +%sms is not an omitted transition",async jitter=>{
 const {c,starts}=await simulate([48],10,jitter);
 expect(starts.length).toBeGreaterThanOrEqual(10);
 expect(c.getDiagnostics().skippedEdges).toBe(0);
 expect(c.getDiagnostics().latenessMaxMs).toBeLessThanOrEqual(jitter+1);
});
it.each([[54.8],[90],[48,54.8]])("overbudget %j skips exactly omitted grid transitions",async(...values)=>{
 const delays=values as number[];
 const {c,starts}=await simulate(delays);
 const d=c.getDiagnostics();
 expect(d.skippedEdges).toBeGreaterThan(0);
 expect(d.skippedEdges).toBe(Object.values(d.skippedByReason).reduce((a,b)=>a+b,0));
 expect(d.skippedByReason.scheduler).toBe(0);expect(d.skippedByReason.rateLimit).toBe(0);
 expect(starts.slice(0,4)).toEqual(delays[0]===48?[0,50,200,250]:[0,150,300,450]);
 for(let i=1;i<d.trace.length;i++)expect(d.trace[i].skips).toBe(d.trace[i].edge-d.trace[i-1].edge-1);
});
it("999Hz start gaps stay >=16ms and trace remains bounded",async()=>{
 const {c,starts}=await simulate([0],999,0,6000);
 expect(starts.length).toBeGreaterThan(256);
 expect(starts.every((s,i)=>!i || s-starts[i-1]>=16)).toBe(true);
 const d=c.getDiagnostics();expect(d.trace.length).toBe(256);expect(d.schemaVersion).toBe(2);
 expect(d.skippedByReason.rateLimit).toBeGreaterThan(0);
 d.trace[0].reasons.rateLimit=-1;expect(c.getDiagnostics().trace[0].reasons.rateLimit).not.toBe(-1);
});

it("in-flight restart cannot contaminate the new run",async()=>{
 const h=hardware();let release!:()=>void;
 h.track.applyConstraints.mockImplementationOnce(()=>new Promise<void>(r=>release=r));
 vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:async()=>h.stream}});
 const c=new StrobeController(vi.fn(),vi.fn());await c.start("torch",10);await flush();
 const restarting=c.start("torch",10);await flush();release();expect(await restarting).toBe(true);await flush();
 expect(c.getDiagnostics().sampleCount).toBe(1);expect(c.getDiagnostics().trace.map(t=>t.edge)).toEqual([0]);
 await c.stop();expect(vi.getTimerCount()).toBe(0);
});
it("early callback rearms without an early command",async()=>{
 const h=hardware();vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:async()=>h.stream}});
 const c=new StrobeController(vi.fn(),vi.fn());await c.start("torch",10);await flush();
 vi.spyOn(performance,"now").mockReturnValue(49.7);
 await vi.advanceTimersByTimeAsync(50);expect(h.writes).toEqual([true]);
 vi.mocked(performance.now).mockReturnValue(50.3);
 await vi.advanceTimersByTimeAsync(1);expect(h.writes).toEqual([true,false]);
 expect(c.getDiagnostics().skippedEdges).toBe(0);await c.stop();
});
