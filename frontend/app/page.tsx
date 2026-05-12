"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animated particle background
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext("2d")!;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: { x:number; y:number; vx:number; vy:number; size:number; alpha:number }[] = [];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
      });
    }

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,136,${p.alpha})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <main className="relative min-h-screen grid-bg overflow-hidden flex flex-col items-center justify-center px-6">
      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-neon-green opacity-5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-neon-blue opacity-5 blur-3xl pointer-events-none" />

      {/* Hero */}
      <div className="relative z-10 text-center max-w-4xl">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-neon-green/30 bg-neon-green/5 mb-8">
          <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
          <span className="text-neon-green text-xs font-mono tracking-widest uppercase">
            AI-Powered Pose Estimation
          </span>
        </div>

        <h1 className="text-6xl md:text-8xl font-bold mb-6 leading-tight">
          <span className="text-white">See Your</span>
          <br />
          <span className="text-neon-green glow-green">3D Skeleton</span>
          <br />
          <span className="text-white">Live</span>
        </h1>

        <p className="text-slate-400 text-lg md:text-xl mb-12 max-w-2xl mx-auto leading-relaxed">
          Real-time 2D to 3D human pose estimation using a deep residual neural network
          trained on 2M+ annotated frames. Just open your webcam.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="px-8 py-4 bg-neon-green text-black font-bold rounded-lg hover:bg-neon-green/90 transition-all duration-200 hover:scale-105 animate-glow-pulse"
          >
            Get Started →
          </Link>
          <a
            href="#how-it-works"
            className="px-8 py-4 border border-neon-green/30 text-neon-green rounded-lg hover:bg-neon-green/10 transition-all duration-200"
          >
            How It Works
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="relative z-10 mt-24 grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-4xl">
        {[
          { label: "Training Frames",  value: "2M+" },
          { label: "Joints Tracked",   value: "17" },
          { label: "Camera Views",     value: "4" },
          { label: "PCK @ 150mm",      value: "95%" },
        ].map(s => (
          <div
            key={s.label}
            className="p-6 rounded-xl border border-neon-green/10 bg-dark-800/50 backdrop-blur text-center"
          >
            <div className="text-3xl font-bold text-neon-green glow-green mb-1">{s.value}</div>
            <div className="text-slate-500 text-sm">{s.label}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div id="how-it-works" className="relative z-10 mt-24 w-full max-w-4xl">
        <h2 className="text-3xl font-bold text-center text-white mb-12">
          How It <span className="text-neon-green">Works</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step:"01", title:"Open Webcam",    desc:"Allow camera access. MediaPipe detects your 2D joints in real time." },
            { step:"02", title:"AI Lifts to 3D", desc:"Our deep residual MLP converts 2D coordinates into full 3D joint positions." },
            { step:"03", title:"See Your Skeleton", desc:"Your 3D skeleton renders live in the browser with color-coded bones." },
          ].map(s => (
            <div key={s.step} className="p-6 rounded-xl border border-white/5 bg-dark-800/50 backdrop-blur">
              <div className="text-neon-green font-mono text-sm mb-3">{s.step}</div>
              <h3 className="text-white font-bold text-lg mb-2">{s.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 mt-16 mb-8 text-slate-600 text-sm">
        Built for FYP — Deep Learning, Computer Vision
      </div>
    </main>
  );
}
