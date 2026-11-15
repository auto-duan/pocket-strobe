import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { clampFrequency, StrobeController, type Mode } from "./controller";
import "./style.css";
function App() {
  const [mode, setMode] = useState<Mode>("screen"),
    [hz, setHz] = useState(1),
    [consent, setConsent] = useState(false),
    [running, setRunning] = useState(false),
    [busy, setBusy] = useState(false),
    [light, setLight] = useState(false),
    [error, setError] = useState(""),
    [full, setFull] = useState(false),
    [awake, setAwake] = useState(true),
    [note, setNote] = useState("");
  const epoch = useRef(0),
    wake = useRef<WakeLockSentinel | null>(null),
    mounted = useRef(true);
  const controller = useRef<StrobeController | null>(null);
  if (!controller.current)
    controller.current = new StrobeController(setLight, (message) => {
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
    if (!consent || busy || running) return;
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
    const ok = await controller.current!.start(mode, hz);
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
  const frequency = (n: number) => {
    const v = clampFrequency(n, mode);
    setHz(v);
    controller.current!.setFrequency(v, mode);
  };
  return (
    <>
      <main>
        <header>
          <a className="brand" href="./">
            <span className="brand-icon">✳</span> 微光{" "}
            <small>POCKET STROBE</small>
          </a>
          <span className="local">纯本地 · 无上传</span>
        </header>
        <section className="intro">
          <div className="eyebrow">A LITTLE LIGHT, YOUR RHYTHM</div>
          <h1>让光，跟上节奏。</h1>
          <p>口袋里的频闪灯。选择一种光源，从慢一点开始。</p>
        </section>
        <div className="layout">
          <section className="panel controls" aria-label="频闪设置">
            <div className="section-heading">
              <h2>光源</h2>
              <span>01 / SOURCE</span>
            </div>
            <div className="modes">
              {(["screen", "torch"] as Mode[]).map((m) => (
                <button
                  key={m}
                  disabled={running || busy}
                  aria-pressed={mode === m}
                  className={mode === m ? "selected" : ""}
                  onClick={() => {
                    setMode(m);
                    setHz((v) => clampFrequency(v, m));
                    setError("");
                  }}
                >
                  <span className="mode-icon">
                    {m === "screen" ? "▣" : "ϟ"}
                  </span>
                  <strong>{m === "screen" ? "屏幕闪光" : "后置手电筒"}</strong>
                  <small>
                    {m === "screen" ? "用整个屏幕发光" : "调用相机 LED"}
                  </small>
                </button>
              ))}
            </div>
            <p className="hint">
              {mode === "screen"
                ? "无需相机权限 · 建议先降低屏幕亮度"
                : "需要 HTTPS + 后置相机权限 · iOS 浏览器通常不支持"}
            </p>
            <div className="section-heading frequency-heading">
              <h2>闪烁频率</h2>
              <span>02 / FREQUENCY</span>
            </div>
            <div className="frequency">
              <button
                aria-label="降低频率"
                disabled={busy || running}
                onClick={() => frequency(hz - 0.5)}
              >
                −
              </button>
              <div>
                <output>{hz.toFixed(1)}</output>
                <span>Hz</span>
              </div>
              <button
                aria-label="增加频率"
                disabled={busy || running}
                onClick={() => frequency(hz + 0.5)}
              >
                +
              </button>
            </div>
            <label className="sr-only" htmlFor="frequency">
              闪烁频率（赫兹）
            </label>
            <input
              id="frequency"
              type="range"
              min="0.5"
              max={mode === "screen" ? 15 : 5}
              step="0.1"
              value={hz}
              disabled={busy || running}
              onChange={(e) => frequency(Number(e.target.value))}
            />
            <div className="range-labels">
              <span>0.5 Hz · 慢</span>
              <span>{mode === "screen" ? 15 : 5} Hz · 快</span>
            </div>
            <div className="presets">
              {[0.5, 1, 2, 5].map((n) => (
                <button
                  disabled={busy || running}
                  key={n}
                  aria-pressed={hz === n}
                  onClick={() => frequency(n)}
                >
                  {n} Hz
                </button>
              ))}
            </div>
            <p className="timing">
              每秒约 {hz} 次闪烁 · 约 50% 占空比
              <br />
              目标频率而非精密计时；屏幕刷新率、系统调度与 LED
              响应均会造成偏差。
            </p>
          </section>
          <aside>
            <section className="panel safety">
              <div className="warning-icon">!</div>
              <h2>先确认安全，再点亮。</h2>
              <p>
                <strong>光敏性癫痫警告</strong>
                ：闪光可能引发癫痫发作、眩晕或不适，即使没有既往病史也有风险。
              </p>
              <ul>
                <li>有光敏性癫痫或相关病史，请勿使用。</li>
                <li>勿直视光源、照射他人或在驾驶时使用。</li>
                <li>远离儿童；任何不适请立即停止。</li>
              </ul>
              {typeof matchMedia !== "undefined" &&
                matchMedia("(prefers-reduced-motion: reduce)").matches && (
                  <p className="reduced">
                    系统已开启减少动态效果。建议不要启动频闪。
                  </p>
                )}
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={running || busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>我已了解闪光风险，确认自己及周围的人适合使用。</span>
              </label>
            </section>
            <section className="options">
              <label>
                <input
                  type="checkbox"
                  checked={awake}
                  onChange={(e) => setAwake(e.target.checked)}
                  disabled={busy || running}
                />{" "}
                尝试保持屏幕常亮
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={full}
                  onChange={(e) => setFull(e.target.checked)}
                  disabled={busy || running}
                />{" "}
                启动时进入系统全屏
              </label>
            </section>
            <button
              className="start"
              disabled={!consent || busy || running}
              onClick={() => void start()}
            >
              <span>▷</span> {busy ? "正在准备光源…" : "开始频闪"}{" "}
              <span>↗</span>
            </button>
            {busy && (
              <button className="cancel" onClick={stop}>
                取消并停止
              </button>
            )}
            <p className="start-note">不会自动启动 · 切到后台即停止</p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {note && (
              <p role="status" className="hint">
                {note}
              </p>
            )}
          </aside>
        </div>
        <footer>
          <span>微光 / POCKET STROBE</span>
          <span>不是医疗、求救或精密测量工具</span>
        </footer>
      </main>
      {running && (
        <div
          className={"output " + (mode === "screen" && light ? "lit" : "")}
          onClick={stop}
          role="presentation"
        >
          <div className="output-label">
            {mode === "screen" ? "屏幕频闪运行中" : "后置手电筒运行中"} ·{" "}
            {hz.toFixed(1)} Hz
          </div>
          <button
            autoFocus
            className="stop"
            onClick={(e) => {
              e.stopPropagation();
              stop();
            }}
          >
            ■ 立即停止
          </button>
          <p>轻触任意位置或按 Esc 停止</p>
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
