"use client";

import { useEffect, useState } from "react";
import { Loader2, Mic, ShieldCheck } from "lucide-react";
import { buildApiUrl } from "@/lib/api";

export default function SingleSignOnPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    const exchange = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const ticket = params.get("ticket");
        const requestedReturn = params.get("returnTo") || "/";
        const returnTo = requestedReturn.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : "/";
        window.history.replaceState({}, "", "/sso");
        if (!ticket) throw new Error("CHEETCHAT sign-in ticket is missing.");
        const response = await fetch(buildApiUrl("/api/auth/sso/cheetchat"), {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Single sign-on failed.");
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        localStorage.setItem("user", JSON.stringify(data.user));
        window.location.replace(returnTo);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not sign in to PodLive.");
      }
    };
    exchange();
  }, []);

  return <main className="flex min-h-screen items-center justify-center bg-[#080808] p-6 text-white">
    <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#111118] p-8 text-center shadow-2xl">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600"><Mic className="h-7 w-7" /></div>
      <h1 className="mt-5 text-xl font-bold">Signing in to PodLive</h1>
      {!error ? <><Loader2 className="mx-auto mt-5 h-6 w-6 animate-spin text-indigo-400" /><p className="mt-3 text-sm text-zinc-400">Using your secure CHEETCHAT account…</p></> : <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4"><p className="text-sm text-red-300">{error}</p><button onClick={() => window.parent === window ? window.location.assign('/login') : window.location.reload()} className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-bold text-black">Try again</button></div>}
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-500"><ShieldCheck className="h-4 w-4" />Your password is never shared with PodLive</div>
    </div>
  </main>;
}
