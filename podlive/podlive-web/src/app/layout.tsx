import type { Metadata } from "next";
import "./globals.css";
import SocketProvider from "@/providers/SocketProvider";

export const metadata: Metadata = {
  title: "PodLive — Live Podcast Platform",
  description: "Host ultra-low latency live streams, invite viewers to stage, auto-record and publish your podcasts.",
  keywords: ["podcast", "live streaming", "livekit", "hls", "broadcast"],
  openGraph: {
    title: "PodLive",
    description: "Next-Generation Live Podcast Platform",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#080808] text-white">
        <SocketProvider>
          {children}
        </SocketProvider>
      </body>
    </html>
  );
}
