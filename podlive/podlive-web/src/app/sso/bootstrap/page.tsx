"use client";

import { useEffect, useState } from "react";
import { Loader2, Mic } from "lucide-react";

export default function SessionBootstrapPage() {
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const encoded = new URLSearchParams(window.location.hash.slice(1)).get("session");
      window.history.replaceState({}, "", "/sso/bootstrap");
      if (!encoded) throw new Error("PodLive session is missing.");
      const session = JSON.parse(decodeURIComponent(escape(atob(encoded))));
      if (!session.accessToken || !session.user) throw new Error("PodLive session is invalid.");
      localStorage.setItem("accessToken", session.accessToken);
      if (session.refreshToken) localStorage.setItem("refreshToken", session.refreshToken);
      localStorage.setItem("user", JSON.stringify(session.user));
      window.location.replace("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open PodLive.");
    }
  }, []);
  return <main className="flex min-h-screen items-center justify-center bg-[#080808] p-6 text-white"><div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600"><Mic className="h-7 w-7" /></div><h1 className="mt-5 text-xl font-bold">Opening PodLive</h1>{error ? <p className="mt-4 text-sm text-red-400">{error}</p> : <Loader2 className="mx-auto mt-5 h-6 w-6 animate-spin text-indigo-400" />}</div></main>;
}
