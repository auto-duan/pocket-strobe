import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { parseFrequency, StrobeController, type Mode } from "./controller";
import "./style.css";
function App() {
  const [mode, setMode] = useState<Mode>("screen"),
    [draft, setDraft] = useState("15"),
    [frequencyError, setFrequencyError] = useState(""),
    [running, setRunning] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [full, setFull] = useState(false),
    [awake, setAwake] = useState(true),
    [note, setNote] = useState("");
  const hz = parseFrequency(draft);
  const validate = () => {
    const value = parseFrequency(draft);
    setFrequencyError(value === null ? "请输入 0.1–999 Hz 的普通数字，最多一位小数（不接受科学计数法）。" : "");
    return value;
  };
  const epoch = useRef(0),
    wake = useRef<WakeLockSentinel | null>(null),
    mounted = useRef(true);
  const output = useRef<HTMLDivElement | null>(null);
  const light = useRef(false);
  const controller = useRef<StrobeController | null>(null);
  if (!controller.current)
    controller.current = new StrobeController((on) => {
      light.current = on;
      if (output.current) output.current.style.backgroundColor = on ? "white" : "black";
    }, (message) => {
      setError(message);
      setRunning(false);
      setBusy(false);
      void wake.current?.release().catch(() => {});
    });
  const stop = () => {
    ++epoch.current;
    setRunning(false);
    setBusy(false);
    void controller.current!.stop();
    void wake.current?.release().catch(() => {});
    wake.current = null;
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
  };
  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.hidden) stop();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    window.addEventListener("keydown", key);
    return () => {
      mounted.current = false;
      ++epoch.current;
      void controller.current!.stop();
      void wake.current?.release().catch(() => {});
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const start = async () => {
    if (busy || running) return;
    const value = validate();
    if (value === null) return;
    const token = ++epoch.current;
    setBusy(true);
    setError("");
    setNote("");
    if (full && document.documentElement.requestFullscreen)
      void document.documentElement
        .requestFullscreen()
        .catch(() => setNote("无法进入系统全屏，仍可使用网页全屏。"));
    if (awake && navigator.wakeLock)
      void navigator.wakeLock
        .request("screen")
        .then((lock) => {
          if (token !== epoch.current || !mounted.current)
            void lock.release().catch(() => {});
          else wake.current = lock;
        })
        .catch(() => setNote("保持亮屏不可用，请留意系统自动锁屏。"));
    const ok = await controller.current!.start(mode, value);
    if (token !== epoch.current || !mounted.current) return;
    setBusy(false);
    setRunning(ok);
    if (!ok) {
      void wake.current?.release().catch(() => {});
      wake.current = null;
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    }
  };
  const frequency = (n: number) => { setDraft(String(n)); setFrequencyError(""); };
  return (
    <>
      <main hidden={running} className="mx-auto max-w-[1080px] pt-5 pr-[max(24px,env(safe-area-inset-right))] pb-6 pl-[max(24px,env(safe-area-inset-left))] min-[701px]:pt-8">
        <header className="flex items-center justify-between gap-4">
          <a className="flex items-center gap-3 text-[23px] font-[750] text-inherit no-underline focus-visible:outline-3 focus-visible:outline-[#d1f897] focus-visible:outline-offset-4 [&>small]:ml-1.5 [&>small]:hidden [&>small]:text-[10px] [&>small]:tracking-[2px] [&>small]:text-[#a7b2a5] min-[701px]:[&>small]:block" href="./">
            <span className="text-[32px] text-[#c9ee9b]">✳</span> 微光{" "}
            <small>POCKET STROBE</small>
          </a>
          <span className="whitespace-nowrap rounded-[20px] border border-[#344234] px-3 py-2 text-[10px] text-[#a9b8a5] min-[701px]:text-[11px]">纯本地 · 无上传</span>
        </header>
        <section className="pt-[42px] pb-[22px] min-[701px]:pt-[65px] min-[701px]:pb-[34px] [&>h1]:my-4 [&>h1]:text-[clamp(32px,5vw,48px)] [&>h1]:font-bold [&>h1]:tracking-[-2px] [&>p]:my-3.5 [&>p]:text-sm [&>p]:leading-[1.8] [&>p]:text-[#a5b0a2]">
          <div className="text-[10px] tracking-[3px] text-[#bbd79c]">A LITTLE LIGHT, YOUR RHYTHM</div>
          <h1>让光，跟上节奏。</h1>
          <p>在暗处照亮运动物体，探索定格与慢动作错觉。</p>
        </section>
        <div className="grid grid-cols-1 gap-[18px] min-[701px]:grid-cols-[1.15fr_1fr] min-[701px]:gap-6">
          <section className="rounded-[21px] border border-[#344032] bg-[#1a211bd9] p-[23px] min-[701px]:rounded-3xl min-[701px]:p-7" aria-label="频闪设置">
            <div className="flex items-center justify-between gap-3 [&>h2]:text-base [&>h2]:font-bold [&>span]:text-[9px] [&>span]:tracking-[1.5px] [&>span]:text-[#a1ae9d]">
              <h2>光源</h2>
              <span>01 / SOURCE</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {(["screen", "torch"] as Mode[]).map((m) => (
                <button
                  key={m}
                  disabled={running || busy}
                  aria-pressed={mode === m}
                  className="min-h-12 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-[#d1f897] focus-visible:outline-offset-4 [-webkit-tap-highlight-color:transparent] flex flex-col items-start gap-2 rounded-2xl border border-[#3b4738] bg-[#202921] p-[18px] aria-pressed:border-[#c6ed96] aria-pressed:bg-[#2b3926] aria-pressed:shadow-[inset_0_0_0_1px_#c6ed96] [&>strong]:text-sm [&>small]:text-[11px] [&>small]:text-[#b1bda9]"
                  onClick={() => {
                    setMode(m);
                    setError("");
                  }}
                >
                  <span className="text-[28px] text-[#ceeaa9]">
                    {m === "screen" ? "▣" : "ϟ"}
                  </span>
                  <strong>{m === "screen" ? "屏幕闪光" : "后置手电筒"}</strong>
                  <small>
                    {m === "screen" ? "用整个屏幕发光" : "调用相机 LED"}
                  </small>
                </button>
              ))}
            </div>
            <p className="my-[11px] text-[11px] leading-[1.8] text-[#a9b6a3]">
              {mode === "screen"
                ? "无需相机权限 · 建议先降低屏幕亮度"
                : "需要 HTTPS + 后置相机权限 · iOS 浏览器通常不支持"}
            </p>
            <div className="flex items-center justify-between gap-3 [&>h2]:text-base [&>h2]:font-bold [&>span]:text-[9px] [&>span]:tracking-[1.5px] [&>span]:text-[#a1ae9d] mt-8 border-t border-[#344032] pt-[25px]">
              <h2>闪烁频率</h2>
              <span>02 / FREQUENCY</span>
            </div>
            <label className="mt-5 block text-sm" htmlFor="frequency">目标闪烁频率（Hz）</label>
            <input id="frequency" className="my-3 min-h-14 w-full min-w-0 rounded-xl border border-[#667655] bg-[#202921] px-4 text-3xl tabular-nums focus-visible:outline-3 focus-visible:outline-[#d1f897]"
              type="text" role="spinbutton" inputMode="decimal" min="0.1" max="999" step="0.1"
              aria-valuemin={0.1} aria-valuemax={999} aria-valuenow={hz ?? undefined}
              aria-invalid={!!frequencyError} aria-describedby="frequency-help frequency-error"
              value={draft} disabled={busy || running}
              onChange={(e) => { setDraft(e.target.value); setFrequencyError(""); }} onBlur={validate}
              onKeyDown={(e) => {
                if ((e.key === "ArrowUp" || e.key === "ArrowDown") && hz !== null) {
                  e.preventDefault();
                  frequency(Math.min(999, Math.max(0.1, Math.round((hz + (e.key === "ArrowUp" ? 0.1 : -0.1)) * 10) / 10)));
                }
              }} />
            <p id="frequency-help" className="text-xs text-[#b7c7a7]">两种光源共用 · 0.1–999 Hz · 最多一位小数</p>
            <p id="frequency-error" role={frequencyError ? "alert" : undefined} className="mt-2 text-xs text-[#ffe0d0]">{frequencyError}</p>
            <div className="my-5 flex gap-1.5 [&>button]:flex-1 [&>button]:rounded-[10px] [&>button]:border [&>button]:border-[#3e4a37] [&>button]:bg-transparent [&>button]:text-xs [&>button[aria-pressed=true]]:border-[#c8ed99] [&>button[aria-pressed=true]]:bg-[#c8ed99] [&>button[aria-pressed=true]]:text-[#182210]">
              {[12, 15, 20, 24, 30].map((n) => (
                <button className="min-h-12 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-[#d1f897] focus-visible:outline-offset-4 [-webkit-tap-highlight-color:transparent]"
                  disabled={busy || running}
                  key={n}
                  aria-pressed={hz === n}
                  onClick={() => frequency(n)}
                >
                  {n} Hz
                </button>
              ))}
            </div>
            <p className="mt-[11px] mb-0 border-t border-[#344032] pt-[18px] text-[11px] leading-[1.8] text-[#a9b6a3]">
              目标每秒 {hz ?? "—"} 次闪光（Hz，不是显示 FPS）· 50% 目标占空比
              <br />
              <strong>实际频率未测量，不能保证达到目标（包括 999 Hz）。</strong>
              {mode === "screen" ? "屏幕每帧最多更新一次；60 Hz 屏幕理想交替上限 30 Hz，高目标会量化、混叠。" : "LED 受硬件与浏览器限制；串行写入、至少间隔 16 ms，跳过错失脉冲，不追赶。"} 切换光源不改变目标。
            </p>
          </section>
          <aside>
            <p className="my-3 text-[11px] leading-relaxed text-[#b9b09b]">闪光可能引发光敏性癫痫、眩晕或不适；有相关病史请勿使用，勿照射他人，不适立即停止。</p>
            {typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches && (
              <p className="my-3 text-[11px] leading-relaxed text-[#b9b09b]">系统已开启减少动态效果。建议不要启动频闪。</p>
            )}
            <section className="mx-1 my-[18px] grid gap-1 [&>label]:flex [&>label]:min-h-10 [&>label]:items-center [&>label]:gap-[9px] [&>label]:text-xs [&>label]:text-[#bac5b4]">
              <label>
                <input
                  className="size-5 shrink-0 accent-[#c5ed97] focus-visible:outline-3 focus-visible:outline-[#d1f897] focus-visible:outline-offset-4"
                  type="checkbox"
                  checked={awake}
                  onChange={(e) => setAwake(e.target.checked)}
                  disabled={busy || running}
                />{" "}
                尝试保持屏幕常亮
              </label>
              <label>
                <input
                  className="size-5 shrink-0 accent-[#c5ed97] focus-visible:outline-3 focus-visible:outline-[#d1f897] focus-visible:outline-offset-4"
                  type="checkbox"
                  checked={full}
                  onChange={(e) => setFull(e.target.checked)}
                  disabled={busy || running}
                />{" "}
                启动时进入系统全屏
              </label>
            </section>
            <button
              className="min-h-12 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-[#d1f897] focus-visible:outline-offset-4 [-webkit-tap-highlight-color:transparent] flex min-h-[60px] w-full items-center justify-between rounded-[15px] border-0 bg-[#c9ef9b] px-[22px] font-bold text-[#1b2912] [&>span]:text-[22px]"
              disabled={busy || running}
              onClick={() => void start()}
            >
              <span>▷</span> {busy ? "正在准备光源…" : "开始频闪"}{" "}
              <span>↗</span>
            </button>
            {busy && (
              <button className="min-h-12 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-[#d1f897] focus-visible:outline-offset-4 [-webkit-tap-highlight-color:transparent] mt-2.5 w-full rounded-xl border border-[#b38266] bg-[#563829]" onClick={stop}>
                取消并停止
              </button>
            )}
            <p className="my-[10px] text-center text-[10px] leading-[1.8] text-[#a1ae99]">不会自动启动 · 切到后台即停止</p>
            {error && (
              <p className="my-[13px] rounded-xl border border-[#a56d50] bg-[#402c24] p-3 text-[13px] leading-[1.8] text-[#ffe0d0]" role="alert">
                {error}
              </p>
            )}
            {note && (
              <p role="status" className="my-[11px] text-[11px] leading-[1.8] text-[#a9b6a3]">
                {note}
              </p>
            )}
          </aside>
        </div>
        <footer className="mt-10 flex flex-col justify-between gap-2.5 border-t border-[#2d382d] pt-[22px] text-[9px] tracking-[1px] text-[#98a591] min-[701px]:flex-row min-[701px]:gap-5">
          <span>微光 / POCKET STROBE</span>
          <span>不是医疗、求救或精密测量工具</span>
        </footer>
      </main>
      {running && (
        <div
          ref={(el) => { output.current = el; if (el) el.style.backgroundColor = light.current ? "white" : "black"; }}
          data-testid="strobe-output"
          className="fixed inset-0 z-20 cursor-pointer overflow-hidden bg-black"
          onClick={stop}
          role="presentation"
        >
          <button
            autoFocus
            className="absolute top-[max(12px,env(safe-area-inset-top))] right-[max(12px,env(safe-area-inset-right))] min-h-11 min-w-11 cursor-pointer rounded-full border border-white/30 bg-black/45 px-4 text-xs text-white/90 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            onClick={(e) => {
              e.stopPropagation();
              stop();
            }}
          >
            ■ 立即停止
          </button>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
