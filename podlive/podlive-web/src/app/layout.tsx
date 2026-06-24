import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SocketProvider from "@/providers/SocketProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#080808] text-white`}>
        <SocketProvider>
          {children}
        </SocketProvider>
      </body>
    </html>
  );
}
