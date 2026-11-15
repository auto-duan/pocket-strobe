import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clampFrequency, StrobeController } from "./controller";
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
  vi.stubGlobal("window", { isSecureContext: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("safe frequency", () => {
  it("clamps ranges and invalid values", () => {
    expect(clampFrequency(100, "screen")).toBe(15);
    expect(clampFrequency(10, "torch")).toBe(5);
    expect(clampFrequency(-2, "screen")).toBe(0.5);
    expect(clampFrequency(NaN, "screen")).toBe(1);
    expect(clampFrequency(1.23, "screen")).toBe(1.2);
  });
});
it("never starts automatically; screen stop cancels all future pulses", async () => {
  const light = vi.fn();
  const c = new StrobeController(light, vi.fn());
  expect(light).not.toHaveBeenCalled();
  await c.start("screen", 1);
  expect(light).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(500);
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
  await c.start("torch", 5);
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
