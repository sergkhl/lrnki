import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Lrnki Admin Lab", description: "Learner-neutral concept graph exploration lab" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
