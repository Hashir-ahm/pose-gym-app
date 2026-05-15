"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { draw2DSkeleton, clearOverlay } from "../../lib/skeleton2d";

const Skeleton3D = dynamic(() => import("../../components/Skeleton3D"), { ssr: false });

const BACKEND_WS = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

type FormStatus = "good" | "warning" | "error";

interface GymFrame {
  detected:     boolean;
  rep_count:    number;
  angle:        number;
  phase:        string;
  form_status:  FormStatus;
  active_error: string;
  arc_color:    string;
  joints_3d:    [number, number, number][];
  joints_2d:    [number, number][];
  good_reps:    number;
  form_errors:  number;
}

interface Summary {
  exercise_name: string;
  total_reps:    number;
  good_reps:     number;
  bad_reps:      number;
  form_score:    number;
  grade:         string;
  rep_details:   { rep: number; min_angle: number; max_angle: number; form: string }[];
}

const EXERCISES = [
  { key: "bicep_curl",       label: "Bicep Curl",       icon: "💪", functional: true,  muscle: "Biceps",       desc: "Keep elbows at sides. Curl fully, extend fully." },
  { key: "squat",            label: "Squat",            icon: "🦵", functional: true,  muscle: "Quads/Glutes", desc: "Feet shoulder width. Thighs parallel at bottom." },
  { key: "shoulder_press",   label: "Shoulder Press",   icon: "🏋️", functional: false, muscle: "Shoulders",    desc: "Press overhead until arms fully extended." },
  { key: "lateral_raise",    label: "Lateral Raise",    icon: "🙆", functional: false, muscle: "Shoulders",    desc: "Raise arms to shoulder height, keep slight bend." },
  { key: "tricep_extension", label: "Tricep Extension", icon: "💥", functional: false, muscle: "Triceps",      desc: "Extend arms fully behind head." },
  { key: "deadlift",         label: "Deadlift",         icon: "🏗️", functional: false, muscle: "Back/Glutes",  desc: "Hinge at hips, keep back flat throughout." },
  { key: "lunge",            label: "Lunge",            icon: "🚶", functional: false, muscle: "Quads/Glutes", desc: "Step forward, lower knee toward floor." },
  { key: "push_up",          label: "Push Up",          icon: "🤸", functional: false, muscle: "Chest/Triceps",desc: "Lower chest to floor, keep core tight." },
];

export default function GymPage() {
  const router = useRouter();
  const [user, setUser]               = useState<any>(null);
  const [exercise, setExercise]       = useState("");
  const [started, setStarted]         = useState(false);
  const [frame, setFrame]             = useState<GymFrame | null>(null);
  const [summary, setSummary]         = useState<Summary | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [repFlash, setRepFlash]       = useState(false);
  const [wsStatus, setWsStatus]       = useState<"disconnected"|"connecting"|"connected">("disconnected");
  const [cameraError, setCameraError] = useState("");
  const [debugMsg, setDebugMsg]       = useState("");

  // Always-mounted refs
  const captureVideoRef  = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef       = useRef<HTMLCanvasElement>(null);
  const wsRef            = useRef<WebSocket | null>(null);
  const loopRef          = useRef<boolean>(false);
  const frameRef         = useRef<GymFrame | null>(null);
  const prevRepRef       = useRef(0);

  useEffect(() => {
    const stored = localStorage.getItem("pose_user");
    if (!stored) { router.push("/login"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  // ── Overlay draw loop ─────────────────────────────────────────────────────
  const startOverlayLoop = useCallback(() => {
    const drawLoop = () => {
      if (!loopRef.current) return;

      const capture = captureCanvasRef.current;
      const overlay = overlayRef.current;
      const f       = frameRef.current;

      if (capture && overlay && f?.joints_2d && f.detected) {
        const parent   = overlay.parentElement;
        const displayW = parent?.clientWidth  || 640;
        const displayH = parent?.clientHeight || 480;
        draw2DSkeleton(
          overlay,
          f.joints_2d,
          f.form_status,
          displayW,
          displayH,
          capture.width  || 640,
          capture.height || 480,
          true,
        );
      } else {
        clearOverlay(overlayRef.current);
      }

      requestAnimationFrame(drawLoop);
    };
    requestAnimationFrame(drawLoop);
  }, []);

  // ── Frame sending loop ────────────────────────────────────────────────────
  const startFrameLoop = useCallback((ws: WebSocket) => {
    loopRef.current = true;

    const loop = () => {
      if (!loopRef.current) return;

      const video   = captureVideoRef.current;
      const capture = captureCanvasRef.current;

      if (!video || !capture || ws.readyState !== WebSocket.OPEN) {
        setTimeout(loop, 100);
        return;
      }

      const ctx = capture.getContext("2d");
      if (ctx && video.videoWidth > 0 && video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, capture.width, capture.height);
        capture.toBlob(blob => {
          if (blob && blob.size > 5000 && ws.readyState === WebSocket.OPEN) {
            blob.arrayBuffer().then(buf => {
              try { ws.send(buf); } catch {}
            });
          }
        }, "image/jpeg", 0.85);
      }

      setTimeout(loop, 80);
    };

    loop();
  }, []);

  // ── Start session ─────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    const ex = EXERCISES.find(e => e.key === exercise);
    if (!ex) return;

    if (!ex.functional) {
      alert(`${ex.label} is coming soon! Please select Bicep Curl or Squat.`);
      return;
    }

    setCameraError("");
    setDebugMsg("Starting camera...");
    setWsStatus("connecting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
    } catch {
      setCameraError("Camera permission denied. Please allow camera access.");
      setWsStatus("disconnected");
      setDebugMsg("");
      return;
    }

    const video   = captureVideoRef.current!;
    const capture = captureCanvasRef.current!;
    video.srcObject = stream;

    await new Promise<void>(resolve => {
      const check = () => {
        if (video.videoWidth > 0 && video.readyState >= 2) resolve();
        else setTimeout(check, 100);
      };
      video.addEventListener("canplay", check, { once: true });
      setTimeout(check, 500);
      setTimeout(resolve, 4000);
    });

    try { await video.play(); } catch {}

    capture.width  = video.videoWidth  || 640;
    capture.height = video.videoHeight || 480;

    setDebugMsg(`Camera ready. Connecting...`);

    const ws = new WebSocket(`${BACKEND_WS}/ws/gym?exercise=${exercise}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      setStarted(true);
      setDebugMsg("");
      startFrameLoop(ws);
      startOverlayLoop();
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === "summary") { setSummary(data); setShowSummary(true); return; }
        if (data.error) return;

        setFrame(data);
        frameRef.current = data;

        if ((data.rep_count ?? 0) > prevRepRef.current) {
          prevRepRef.current = data.rep_count;
          setRepFlash(true);
          setTimeout(() => setRepFlash(false), 400);
        }
      } catch {}
    };

    ws.onerror = () => {
      setCameraError("Cannot connect to backend. Make sure it is running on port 8000.");
      setWsStatus("disconnected");
      setDebugMsg("");
    };

    ws.onclose = () => setWsStatus("disconnected");

  }, [exercise, startFrameLoop, startOverlayLoop]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const stopCamera = () => {
    loopRef.current = false;
    const stream = captureVideoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    if (captureVideoRef.current) captureVideoRef.current.srcObject = null;
    frameRef.current = null;
    clearOverlay(overlayRef.current);
  };

  const stopSession = () => {
    stopCamera();
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ action: "get_summary" }));
  };

  const resetSession = () => {
    wsRef.current?.send(JSON.stringify({ action: "reset" }));
    setFrame(null);
    frameRef.current = null;
    prevRepRef.current = 0;
  };

  const endAndGoBack = () => {
    loopRef.current = false;
    wsRef.current?.close();
    stopCamera();
    setStarted(false); setExercise(""); setFrame(null);
    setSummary(null); setShowSummary(false);
    prevRepRef.current = 0;
    setWsStatus("disconnected"); setDebugMsg("");
  };

  const formColors = {
    good:    { bg: "bg-neon-green/10", border: "border-neon-green/40", text: "text-neon-green" },
    warning: { bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-400" },
    error:   { bg: "bg-red-500/10",    border: "border-red-500/40",    text: "text-red-400"    },
  };
  const fs = frame?.form_status || "good";
  const fc = formColors[fs];

  if (!user) return null;

  return (
    <main className="min-h-screen bg-dark-900 grid-bg">

      {/* Always-mounted hidden elements — never inside conditionals */}
      <video ref={captureVideoRef} autoPlay muted playsInline className="hidden" />
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Navbar */}
      <nav className="sticky top-0 z-50 px-6 py-4 border-b border-white/5 bg-dark-900/80 backdrop-blur flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => { endAndGoBack(); router.push("/dashboard"); }}
            className="text-slate-400 hover:text-white text-sm transition-colors">
            ← Dashboard
          </button>
          <span className="text-white font-bold">Gym Mode</span>
          <div className={`flex items-center gap-1.5 text-xs ${
            wsStatus === "connected"  ? "text-neon-green"  :
            wsStatus === "connecting" ? "text-yellow-400"  : "text-slate-500"
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              wsStatus === "connected"  ? "bg-neon-green animate-pulse" :
              wsStatus === "connecting" ? "bg-yellow-400 animate-pulse" : "bg-slate-600"
            }`} />
            {wsStatus === "connected" ? "Live" : wsStatus === "connecting" ? "Connecting..." : "Offline"}
          </div>
        </div>
        <span className="text-slate-400 text-sm hidden sm:block">
          Welcome, <span className="text-neon-green">{user?.name}</span>
        </span>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Exercise selector */}
        {!started && (
          <div>
            <div className="mb-6">
              <h2 className="text-white font-bold text-xl mb-1">Select Exercise</h2>
              <p className="text-slate-500 text-sm">Functional exercises track reps and form. Others coming soon.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {EXERCISES.map(ex => (
                <button key={ex.key}
                  onClick={() => ex.functional && setExercise(ex.key)}
                  className={`p-5 rounded-xl border text-left transition-all relative ${
                    exercise === ex.key
                      ? "border-neon-green/60 bg-neon-green/10"
                      : ex.functional
                        ? "border-white/10 bg-dark-800/50 hover:border-white/20 cursor-pointer"
                        : "border-white/5 bg-dark-800/30 opacity-50 cursor-not-allowed"
                  }`}>
                  {!ex.functional && (
                    <span className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Soon</span>
                  )}
                  <div className="text-3xl mb-2">{ex.icon}</div>
                  <div className="text-white font-bold text-sm">{ex.label}</div>
                  <div className="text-neon-green/60 text-xs mt-0.5">{ex.muscle}</div>
                  <div className="text-slate-500 text-xs mt-2 leading-relaxed">{ex.desc}</div>
                </button>
              ))}
            </div>

            {cameraError && (
              <div className="mb-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">❌ {cameraError}</div>
            )}
            {debugMsg && (
              <div className="mb-4 p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 text-yellow-400 text-sm">⏳ {debugMsg}</div>
            )}

            <button onClick={startSession}
              disabled={!exercise || wsStatus === "connecting"}
              className="px-8 py-3 bg-neon-green text-black font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neon-green/90 transition-all animate-glow-pulse">
              {wsStatus === "connecting" ? "Starting..." : "Start Session →"}
            </button>
          </div>
        )}

        {/* Live session */}
        {started && (
          <div className="grid lg:grid-cols-2 gap-6">

            {/* LEFT */}
            <div className="space-y-4">

              {/* Rep counter */}
              <div className={`rounded-2xl border p-6 text-center transition-all duration-200 ${
                repFlash ? "border-neon-green bg-neon-green/20" : "border-white/5 bg-dark-800/50"
              }`}>
                <div className="text-slate-400 text-xs mb-1 uppercase tracking-widest">
                  {EXERCISES.find(e => e.key === exercise)?.label} — Reps
                </div>
                <div className={`text-8xl font-bold transition-all duration-150 ${
                  repFlash ? "text-neon-green scale-110" : "text-white"
                }`}>
                  {frame?.rep_count ?? 0}
                </div>
                <div className="flex justify-center gap-8 mt-4">
                  <div className="text-center">
                    <div className="text-neon-green font-bold text-xl">{frame?.good_reps ?? 0}</div>
                    <div className="text-slate-500 text-xs">Good</div>
                  </div>
                  <div className="text-center">
                    <div className="text-red-400 font-bold text-xl">{frame?.form_errors ?? 0}</div>
                    <div className="text-slate-500 text-xs">Errors</div>
                  </div>
                  <div className="text-center">
                    <div className="text-neon-blue font-bold text-xl">
                      {frame?.angle != null ? `${frame.angle}°` : "--"}
                    </div>
                    <div className="text-slate-500 text-xs">Angle</div>
                  </div>
                </div>
              </div>

              {/* Form status */}
              <div className={`rounded-xl border px-5 py-4 transition-all duration-300 ${fc.bg} ${fc.border}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {fs === "good" ? "✅" : fs === "warning" ? "⚠️" : "❌"}
                  </span>
                  <div>
                    <div className={`font-bold text-sm ${fc.text}`}>
                      {fs === "good" ? "Good Form" : fs === "warning" ? "Check Form" : "Form Error"}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">
                      {frame?.active_error || (frame?.detected ? "Keep it up!" : "Stand back — full body must be visible")}
                    </div>
                  </div>
                </div>
              </div>

              {/* Angle bar */}
              <div className="rounded-xl border border-white/5 bg-dark-800/50 p-4">
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>0°</span>
                  <span className="text-white font-medium">{frame?.angle ?? 0}°</span>
                  <span>180°</span>
                </div>
                <div className="h-3 bg-dark-900 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-150"
                    style={{
                      width:      `${((frame?.angle ?? 0) / 180) * 100}%`,
                      background:  frame?.arc_color ?? "#00ff88",
                      boxShadow:  `0 0 10px ${frame?.arc_color ?? "#00ff88"}88`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-600 mt-1">
                  <span>Curled / Bent</span>
                  <span>Extended / Standing</span>
                </div>
              </div>

              {/* Camera with 2D skeleton overlay */}
              <div className="rounded-xl overflow-hidden bg-dark-900 border border-white/5 relative"
                style={{ aspectRatio: "4/3" }}>

                {/* Mirrored display video */}
                <video autoPlay muted playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                  ref={(el) => {
                    if (el && captureVideoRef.current?.srcObject &&
                        el.srcObject !== captureVideoRef.current.srcObject) {
                      el.srcObject = captureVideoRef.current.srcObject;
                    }
                  }}
                />

                {/* 2D skeleton overlay */}
                <canvas ref={overlayRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ zIndex: 10 }}
                />

                {/* Detection badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur"
                  style={{ zIndex: 20 }}>
                  <span className={`w-2 h-2 rounded-full ${frame?.detected ? "bg-neon-green animate-pulse" : "bg-red-400"}`} />
                  <span className="text-white text-xs">
                    {frame?.detected ? "Person detected" : "No person detected"}
                  </span>
                </div>

                {/* Phase badge */}
                <div className="absolute top-3 right-3 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur"
                  style={{ zIndex: 20 }}>
                  <span className="text-white text-xs">
                    {frame?.phase === "up" ? "↑ Going up" : "↓ Going down"}
                  </span>
                </div>

                {/* No detection tip */}
                {!frame?.detected && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ zIndex: 15 }}>
                    <div className="text-center bg-black/60 px-6 py-4 rounded-xl backdrop-blur">
                      <div className="text-3xl mb-2">🧍</div>
                      <p className="text-slate-300 text-sm font-medium">Stand back from camera</p>
                      <p className="text-slate-500 text-xs mt-1">Full body must be visible</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex gap-3">
                <button onClick={stopSession}
                  className="flex-1 py-3 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-bold text-sm hover:bg-red-500/30 transition-all">
                  End Session & See Summary
                </button>
                <button onClick={resetSession}
                  className="px-6 py-3 border border-white/10 text-slate-400 rounded-xl text-sm hover:border-white/20 hover:text-white transition-all">
                  Reset
                </button>
              </div>
            </div>

            {/* RIGHT — 3D Skeleton */}
            <div className="rounded-2xl border border-white/5 bg-dark-800/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-white font-medium text-sm">3D Skeleton</span>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${fc.bg} ${fc.text}`}>
                  {fs.toUpperCase()}
                </span>
              </div>
              <div className="h-[500px]">
                <Skeleton3D joints={frame?.joints_3d ?? null} />
              </div>
              <div className="px-5 py-3 border-t border-white/5 grid grid-cols-5 gap-2">
                {[
                  { color:"#E74C3C", label:"R.Leg" },
                  { color:"#3498DB", label:"L.Leg" },
                  { color:"#2ECC71", label:"Spine" },
                  { color:"#9B59B6", label:"L.Arm" },
                  { color:"#F39C12", label:"R.Arm" },
                ].map(b => (
                  <div key={b.label} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ background: b.color }} />
                    <span className="text-slate-500 text-xs">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Modal */}
      {showSummary && summary && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur z-50 flex items-center justify-center p-6">
          <div className="bg-dark-800 border border-white/10 rounded-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-white mb-1">Session Complete 🎉</h2>
            <p className="text-slate-400 text-sm mb-6">{summary.exercise_name}</p>

            <div className="text-center py-6 mb-6 rounded-xl bg-dark-900 border border-white/5">
              <div className="text-5xl mb-2">{summary.grade?.split(" ")[1] || "🏅"}</div>
              <div className="text-neon-green text-2xl font-bold">{summary.form_score}%</div>
              <div className="text-slate-400 text-sm">Form Score</div>
              <div className="text-white font-bold mt-1">{summary.grade?.split(" ")[0]}</div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label:"Total Reps", value: summary.total_reps, color:"text-white" },
                { label:"Good Reps",  value: summary.good_reps,  color:"text-neon-green" },
                { label:"Errors",     value: summary.bad_reps,   color:"text-red-400" },
              ].map(s => (
                <div key={s.label} className="text-center p-4 rounded-xl bg-dark-900">
                  <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-slate-500 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {summary.rep_details?.length > 0 && (
              <div className="mb-6 max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-white/5">
                      <th className="text-left py-2">Rep</th>
                      <th className="text-left py-2">Min°</th>
                      <th className="text-left py-2">Max°</th>
                      <th className="text-left py-2">Form</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rep_details.map(r => (
                      <tr key={r.rep} className="border-b border-white/5">
                        <td className="py-1.5 text-white">#{r.rep}</td>
                        <td className="py-1.5 text-slate-300">{r.min_angle}°</td>
                        <td className="py-1.5 text-slate-300">{r.max_angle}°</td>
                        <td className={`py-1.5 font-medium ${r.form === "good" ? "text-neon-green" : "text-red-400"}`}>
                          {r.form === "good" ? "✓ Good" : "✗ Bad"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={endAndGoBack}
                className="flex-1 py-3 bg-neon-green text-black font-bold rounded-xl hover:bg-neon-green/90 transition-all">
                New Session
              </button>
              <button onClick={() => router.push("/dashboard")}
                className="px-6 py-3 border border-white/10 text-slate-400 rounded-xl hover:text-white transition-all">
                Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
