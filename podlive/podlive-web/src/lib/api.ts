const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
    }
    if (window.location.hostname.includes("indiasearch.site")) {
      return "https://podlive-api-18as.onrender.com";
    }
  }
  return (process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export function getSocketUrl(): string {
  return getApiBaseUrl();
}

let cachedLiveKitWsUrl: string | null = null;

export async function fetchLiveKitWsUrl(): Promise<string> {
  if (cachedLiveKitWsUrl) return cachedLiveKitWsUrl;
  try {
    const res = await fetch(buildApiUrl("/api/config"));
    const data = await res.json();
    if (data.livekitUrl) {
      cachedLiveKitWsUrl = String(data.livekitUrl);
      return cachedLiveKitWsUrl;
    }
  } catch (err) {
    console.warn("Could not fetch LiveKit URL from /api/config:", err);
  }
  return process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://your-project.livekit.cloud";
}
