import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { parseFrequency, StrobeController, type Mode, type TorchDiagnostics } from "./controller";
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
  const [diagnostics, setDiagnostics] = useState<TorchDiagnostics | null>(null);
  const invalidStart = useRef(false);
  const frequencyInput = useRef<HTMLInputElement>(null);
  const hz = parseFrequency(draft);
  const validate = () => {
    const raw = frequencyInput.current?.value ?? draft;
    const value = frequencyInput.current?.validity.badInput || parseFrequency(draft) === null ? null : parseFrequency(raw);
    if (raw !== draft) setDraft(raw);
    setFrequencyError(value === null ? "请输入 0.1–999，最多一位小数。" : "");
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
    const report = setInterval(() => { const d = controller.current!.getDiagnostics(); if (d.sampleCount || d.active) setDiagnostics(d); }, 1000);
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
      clearInterval(report);
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
    if (invalidStart.current || value === null) { invalidStart.current = false; return; }
    const token = ++epoch.current;
    if (mode === "torch") setDiagnostics(null);
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
      <main hidden={running} className="mx-auto max-w-[560px] px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[calc(124px+env(safe-area-inset-bottom))] sm:pt-12">
        <header className="mb-8 flex items-center justify-between"><a href="./" className="text-xl font-bold text-inherit no-underline"><span className="mr-2 text-3xl text-[#c9ef9b]">✳</span>微光</a><span className="text-[10px] tracking-[2px] text-[#98ab91]">POCKET STROBE</span></header>
        <section aria-label="频闪设置" className="rounded-3xl border border-[#344032] bg-[#1a211b] p-5 sm:p-7">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#101710] p-1.5">{(["screen", "torch"] as Mode[]).map(m => <button key={m} disabled={busy} aria-pressed={mode === m} className="min-h-12 rounded-xl text-sm text-[#aebda4] aria-pressed:bg-[#35452c] aria-pressed:text-[#dbf4bf]" onClick={() => { setMode(m); setError(""); }}>{m === "screen" ? "屏幕闪光" : "后置手电筒"}</button>)}</div>
          <label htmlFor="frequency" className="mt-8 block text-xs text-[#b2c0a7]">闪烁频率</label>
          <div className="mt-2 flex items-baseline gap-3 border-b border-[#667655] pb-3 focus-within:border-[#c9ef9b]">
            <input id="frequency" ref={frequencyInput} className="min-h-20 w-full min-w-0 bg-transparent text-[64px] font-medium leading-none tracking-[-3px] tabular-nums outline-none"
              type="number" inputMode="decimal" min="0.1" max="999" step="0.1" aria-invalid={!!frequencyError} aria-describedby="frequency-help frequency-error" value={draft} disabled={busy}
              onBeforeInput={e => { const event = e.nativeEvent as InputEvent; if (event.data && !/^[0-9.]+$/.test(event.data)) e.preventDefault(); }}
              onPaste={e => { if (!/^\d+(?:\.\d?)?$/.test(e.clipboardData.getData("text"))) { e.preventDefault(); setFrequencyError("仅支持数字，最多一位小数。"); } }}
              onChange={e => { const value = e.target.value; if (value === "" || /^\d+(?:\.\d?)?$/.test(value)) { setDraft(value); setFrequencyError(""); } else { e.target.value = draft; setFrequencyError("仅支持数字，最多一位小数。"); } }} onBlur={validate}
              onKeyDown={e => { if (e.ctrlKey || e.metaKey || e.altKey) return; if (e.key.length === 1 && !/[0-9.]/.test(e.key)) e.preventDefault(); if ((e.key === "ArrowUp" || e.key === "ArrowDown") && hz !== null) { e.preventDefault(); frequency(Math.min(999, Math.max(0.1, Math.round((hz + (e.key === "ArrowUp" ? 0.1 : -0.1)) * 10) / 10))); } }} />
            <span className="text-lg text-[#a9b99c]">Hz</span>
          </div>
          <p id="frequency-help" className="mt-3 text-[11px] text-[#8fa183]">0.1–999 Hz · 最多一位小数</p>
          <p id="frequency-error" role={frequencyError ? "alert" : undefined} className="mt-2 text-xs text-[#ffe0d0]">{frequencyError}</p>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">{[12,20,30,45,60,70].map(n => <button key={n} disabled={busy} aria-pressed={hz === n} className="min-h-11 rounded-xl border border-[#3e4a37] text-xs aria-pressed:border-[#c9ef9b] aria-pressed:bg-[#c9ef9b] aria-pressed:text-[#182210]" onClick={() => frequency(n)}>{n} Hz</button>)}</div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#344032] pt-4 text-xs text-[#b5c3ac]">
            <label className="flex min-h-11 items-center gap-2"><input className="size-4 accent-[#c9ef9b]" type="checkbox" checked={awake} onChange={e => setAwake(e.target.checked)} disabled={busy} />保持常亮</label>
            <label className="flex min-h-11 items-center gap-2"><input className="size-4 accent-[#c9ef9b]" type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} disabled={busy} />系统全屏</label>
          </div>
        </section>
        <p className="mt-4 text-[11px] leading-relaxed text-[#95a58a]">目标频率，实际受屏幕刷新率与硬件限制。{mode === "torch" && "手电筒需相机权限，部分浏览器不支持。"}</p>
        <p className="mt-3 text-[11px] leading-relaxed text-[#b9aa94]">闪光可能引发光敏性癫痫或不适；有相关病史请勿使用，不适立即停止。</p>
        {typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches && <p className="mt-2 text-[11px] text-[#b9aa94]">系统已开启减少动态效果，建议不要启动频闪。</p>}
        {mode === "torch" && <details data-testid="torch-diagnostics" className="mt-4 rounded-xl border border-[#344032] p-3 text-xs text-[#aebda4]">
          <summary className="cursor-pointer">本机手电筒诊断</summary>
          <p className="mt-3">仅记录 API 命令耗时，不是实测 LED 闪烁频率。数据仅在本机内存，不上传。</p>
          {diagnostics ? <>
            <p className="mt-2">目标 {diagnostics.targetHz} Hz · 样本 {diagnostics.sampleCount}（最近 {diagnostics.retainedSamples} 条用于 p95）</p>
            <p>命令耗时 ms：平均 {diagnostics.commandMeanMs.toFixed(1)} / p95 {diagnostics.commandP95Ms.toFixed(1)} / 最大 {diagnostics.commandMaxMs.toFixed(1)}</p>
            <p>调度迟到 ms：平均 {diagnostics.latenessMeanMs.toFixed(1)} / 最大 {diagnostics.latenessMaxMs.toFixed(1)} · 跨过名义时间槽 {diagnostics.skippedEdges}</p>
            <button className="mt-3 min-h-11 rounded-lg border border-[#667655] px-3" onClick={() => {
              const data = { notice: "API timing, NOT measured LED frequency. Local only.", ...controller.current!.getDiagnostics() };
              const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: "application/json"}));
              const a = document.createElement("a"); a.href = url; a.download = "torch-diagnostics.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}>下载诊断 JSON</button>
          </> : <p className="mt-2">手动启动并停止后可查看报告；新一轮手电筒运行会重置。</p>}
        </details>}
        {mode === "torch" && diagnostics?.observedTooSlow && <p role="status" className="mt-3 text-xs text-[#ffe0d0]">已观察到调度迟到或重定相；本机跟不上目标，请降低频率。不是实测光频。</p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-[#a56d50] bg-[#402c24] p-3 text-xs text-[#ffe0d0]">{error}</p>}
        {note && <p role="status" className="mt-3 text-xs text-[#b5c3ac]">{note}</p>}
        <div data-testid="action-dock" className="fixed inset-x-0 bottom-0 z-10 border-t border-[#344032] bg-[#101710f5] px-[max(20px,env(safe-area-inset-left))] pt-3 pb-[max(16px,env(safe-area-inset-bottom))]"><div className="mx-auto max-w-[520px]"><button className="min-h-14 w-full rounded-2xl bg-[#c9ef9b] text-base font-bold text-[#1b2912]" onPointerDown={() => { invalidStart.current = validate() === null; }} onClick={() => busy ? stop() : void start()}>{busy ? "取消并停止" : "开始频闪"}</button></div></div>
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
