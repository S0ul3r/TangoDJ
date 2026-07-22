import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { SpotifyProvider } from "@/context/SpotifyContext";
import { LibraryProvider } from "@/context/LibraryContext";
import { PlaybackProvider } from "@/context/PlaybackContext";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const sans = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TangoDJ — Milonga DJ Assistant",
  description:
    "Organize tango tandas, build milonga night queues, and play via Spotify Connect or local MP3s.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} antialiased`}>
        <SpotifyProvider>
          <LibraryProvider>
            <PlaybackProvider>{children}</PlaybackProvider>
          </LibraryProvider>
        </SpotifyProvider>
      </body>
    </html>
  );
}
