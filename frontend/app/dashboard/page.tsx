"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// Dynamically import Three.js component (no SSR)
const Skeleton3D = dynamic(() => import("../../components/Skeleton3D"), { ssr: false });

const BACKEND_WS  = process.env.NEXT_PUBLIC_WS_URL  || "ws://localhost:8000";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Tab = "webcam" | "upload";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser]         = useState<{ email:string; name:string } | null>(null);
  const [tab, setTab]           = useState<Tab>("webcam");

  // Webcam state
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wsRef      = useRef<WebSocket | null>(null);
  const [streaming, setStreaming]   = useState(false);
  const [joints3d, setJoints3d]     = useState<[number,number,number][] | null>(null);
  const [detected, setDetected]     = useState(false);
  const [fps, setFps]               = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsTime   = useRef(Date.now());

  // Upload state
  const [videoFile, setVideoFile]   = useState<File | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [playbackFrame, setPlaybackFrame] = useState(0);

  // Auth check
  useEffect(() => {
    const stored = localStorage.getItem("pose_user");
    if (!stored) { router.push("/login"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  const logout = () => {
    localStorage.removeItem("pose_user");
    router.push("/login");
  };

  // ── WEBCAM ────────────────────────────────────────────────────────────────
  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width:640, height:480 } });
      if (videoRef.current) videoRef.current.srcObject = stream;

      const ws = new WebSocket(`${BACKEND_WS}/ws/pose`);
      wsRef.current = ws;

      ws.onopen  = () => { setStreaming(true); sendFrames(ws); };
      ws.onclose = () => setStreaming(false);
      ws.onerror = (e) => console.error("WS error", e);

      ws.onmessage = (evt) => {
        const data = JSON.parse(evt.data);
        setDetected(data.detected);
        if (data.detected) setJoints3d(data.joints_3d);

        // FPS counter
        frameCountRef.current++;
        const now = Date.now();
        if (now - lastFpsTime.current > 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsTime.current = now;
        }
      };
    } catch (err) {
      alert("Camera permission denied. Please allow camera access.");
    }
  }, []);

  const sendFrames = (ws: WebSocket) => {
    const canvas = canvasRef.current!;
    const video  = videoRef.current!;
    const ctx    = canvas.getContext("2d")!;

    const loop = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, 640, 480);
        canvas.toBlob(blob => {
          if (blob && ws.readyState === WebSocket.OPEN) {
            blob.arrayBuffer().then(buf => ws.send(buf));
          }
        }, "image/jpeg", 0.7);
      }
      setTimeout(loop, 66); // ~15fps to backend
    };
    loop();
  };

  const stopWebcam = () => {
    wsRef.current?.close();
    const stream = (videoRef.current?.srcObject as MediaStream);
    stream?.getTracks().forEach(t => t.stop());
    setStreaming(false);
    setDetected(false);
    setJoints3d(null);
  };

  // ── VIDEO UPLOAD ──────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!videoFile) return;
    setUploading(true);
    setUploadResult(null);

    const form = new FormData();
    form.append("file", videoFile);

    try {
      const res  = await fetch(`${BACKEND_URL}/api/upload-video`, { method:"POST", body:form });
      const data = await res.json();
      setUploadResult(data);
      setPlaybackFrame(0);
    } catch (err) {
      alert("Upload failed. Make sure the backend is running.");
    } finally {
      setUploading(false);
    }
  };

  // Video playback — advance frame every 100ms
  useEffect(() => {
    if (!uploadResult) return;
    const id = setInterval(() => {
      setPlaybackFrame(f => (f + 1) % uploadResult.total_frames);
    }, 1000 / (uploadResult.fps || 10));
    return () => clearInterval(id);
  }, [uploadResult]);

  const currentFrame = uploadResult?.frames?.[playbackFrame];

  if (!user) return null;

  return (
    <main className="min-h-screen bg-dark-900 grid-bg">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 px-6 py-4 border-b border-white/5 bg-dark-900/80 backdrop-blur flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-neon-green flex items-center justify-center">
            <span className="text-black font-bold text-xs">P</span>
          </div>
          <span className="text-white font-bold">Poselift</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-slate-400 text-sm hidden sm:block">
            Welcome, <span className="text-neon-green">{user.name}</span>
          </span>
          <button
            onClick={logout}
            className="px-4 py-1.5 text-sm border border-white/10 text-slate-400 rounded-lg hover:border-red-500/50 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
          <button
            onClick={() => router.push("/gym")}
            className="px-4 py-1.5 text-sm border border-neon-green/30 text-neon-green rounded-lg hover:bg-neon-green/10 transition-colors"
          >
  🏋️       Gym Mode
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">
            3D Pose <span className="text-neon-green">Estimation</span>
          </h1>
          <p className="text-slate-500 text-sm">Real-time 2D → 3D skeleton reconstruction</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-dark-800 rounded-xl w-fit mb-8 border border-white/5">
          {(["webcam","upload"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); if(streaming) stopWebcam(); }}
              className={`px-6 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                tab === t ? "bg-neon-green text-black" : "text-slate-400 hover:text-white"
              }`}
            >
              {t === "webcam" ? "📷 Live Webcam" : "🎬 Upload Video"}
            </button>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid lg:grid-cols-2 gap-6">

          {/* LEFT — Input panel */}
          <div className="rounded-2xl border border-white/5 bg-dark-800/50 backdrop-blur overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <span className="text-white font-medium text-sm">
                {tab === "webcam" ? "Camera Feed" : "Video Input"}
              </span>
              {tab === "webcam" && (
                <div className={`flex items-center gap-2 text-xs ${detected ? "text-neon-green" : "text-slate-500"}`}>
                  <span className={`w-2 h-2 rounded-full ${detected ? "bg-neon-green animate-pulse" : "bg-slate-600"}`} />
                  {detected ? `Tracking  ${fps}fps` : "No person detected"}
                </div>
              )}
            </div>

            <div className="p-4">
              {tab === "webcam" ? (
                <>
                  <div className="relative rounded-xl overflow-hidden bg-dark-900 aspect-video mb-4">
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} width={640} height={480} className="hidden" />
                    {!streaming && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-4xl mb-3">📷</div>
                          <p className="text-slate-500 text-sm">Camera not started</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={streaming ? stopWebcam : startWebcam}
                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                      streaming
                        ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                        : "bg-neon-green text-black hover:bg-neon-green/90 animate-glow-pulse"
                    }`}
                  >
                    {streaming ? "⏹ Stop Camera" : "▶ Start Camera"}
                  </button>
                </>
              ) : (
                <>
                  <label className="block w-full cursor-pointer">
                    <div className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                      videoFile ? "border-neon-green/40 bg-neon-green/5" : "border-white/10 hover:border-neon-green/20"
                    }`}>
                      <div className="text-4xl mb-3">🎬</div>
                      {videoFile
                        ? <p className="text-neon-green text-sm font-medium">{videoFile.name}</p>
                        : <p className="text-slate-500 text-sm">Click to upload MP4, AVI, MOV</p>
                      }
                    </div>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={e => { setVideoFile(e.target.files?.[0] || null); setUploadResult(null); }}
                    />
                  </label>

                  <button
                    onClick={handleUpload}
                    disabled={!videoFile || uploading}
                    className="w-full py-3 mt-4 rounded-xl font-bold text-sm bg-neon-green text-black hover:bg-neon-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {uploading ? "Processing video..." : "Analyse Video →"}
                  </button>

                  {uploadResult && (
                    <div className="mt-3 p-3 rounded-lg bg-dark-900 border border-neon-green/10">
                      <p className="text-neon-green text-xs">
                        ✓ {uploadResult.total_frames} frames processed
                      </p>
                      <input
                        type="range"
                        min={0}
                        max={uploadResult.total_frames - 1}
                        value={playbackFrame}
                        onChange={e => setPlaybackFrame(+e.target.value)}
                        className="w-full mt-2 accent-neon-green"
                      />
                      <p className="text-slate-500 text-xs mt-1">
                        Frame {playbackFrame + 1} / {uploadResult.total_frames}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT — 3D Skeleton */}
          <div className="rounded-2xl border border-white/5 bg-dark-800/50 backdrop-blur overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <span className="text-white font-medium text-sm">3D Skeleton</span>
              <span className="text-xs text-slate-500">Drag to rotate · Scroll to zoom</span>
            </div>
            <div className="h-[420px]">
              <Skeleton3D
                joints={
                  tab === "webcam"
                    ? joints3d
                    : currentFrame?.detected
                      ? currentFrame.joints_3d
                      : null
                }
              />
            </div>

            {/* Legend */}
            <div className="px-5 py-3 border-t border-white/5 grid grid-cols-5 gap-2">
              {[
                { color:"#E74C3C", label:"R.Leg" },
                { color:"#3498DB", label:"L.Leg" },
                { color:"#2ECC71", label:"Spine" },
                { color:"#9B59B6", label:"L.Arm" },
                { color:"#F39C12", label:"R.Arm" },
              ].map(b => (
                <div key={b.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: b.color }} />
                  <span className="text-slate-500 text-xs">{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
