"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router   = useRouter();
  const [mode, setMode]       = useState<"login" | "register">("login");
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [name, setName]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Simulate auth — replace with real NextAuth signIn()
    await new Promise(r => setTimeout(r, 800));

    if (email && password) {
      // Store simple session token in localStorage for demo
      localStorage.setItem("pose_user", JSON.stringify({ email, name: name || email.split("@")[0] }));
      router.push("/dashboard");
    } else {
      setError("Please fill in all fields.");
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen grid-bg flex items-center justify-center px-6">
      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-neon-green opacity-5 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-lg bg-neon-green flex items-center justify-center">
            <span className="text-black font-bold text-sm">P</span>
          </div>
          <span className="text-white font-bold text-xl">Poselift</span>
        </Link>

        {/* Card */}
        <div className="p-8 rounded-2xl border border-white/5 bg-dark-800/80 backdrop-blur border-glow-green">
          {/* Tabs */}
          <div className="flex rounded-lg bg-dark-900 p-1 mb-8">
            {(["login","register"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all capitalize ${
                  mode === m
                    ? "bg-neon-green text-black"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-slate-400 text-xs mb-1.5 block">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ahmed"
                  className="w-full px-4 py-3 rounded-lg bg-dark-900 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-neon-green/50 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="text-slate-400 text-xs mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ahmed@example.com"
                className="w-full px-4 py-3 rounded-lg bg-dark-900 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-neon-green/50 transition-colors"
                required
              />
            </div>

            <div>
              <label className="text-slate-400 text-xs mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPass(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-lg bg-dark-900 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-neon-green/50 transition-colors"
                required
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-neon-green text-black font-bold rounded-lg hover:bg-neon-green/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Please wait..." : mode === "login" ? "Sign In →" : "Create Account →"}
            </button>
          </form>

          <p className="text-center text-slate-500 text-sm mt-6">
            {mode === "login" ? "No account? " : "Have an account? "}
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="text-neon-green hover:underline"
            >
              {mode === "login" ? "Register" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
