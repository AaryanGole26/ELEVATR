import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/shared/auth-context";
import Navbar from "@/shared/components/Navbar";
import Chatbot from "@/shared/components/Chatbot";
import { ToastProvider } from "@/shared/components/ui";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "ELEVATR | Unified AI Hiring Platform",
  description: "JD-driven AI hiring pipeline with screening and interviews"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body>
        <AuthProvider>
          <ToastProvider>
            <Navbar />
            <main className="shell">{children}</main>
            <Chatbot />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
