import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShiftTrack — A smoother shift",
  description: "A clear view of your team's tasks. Stay organized, track progress, and make every shift count.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
