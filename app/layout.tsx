import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Space_Grotesk } from "next/font/google";
import { isInternalMode } from "@/lib/config";
import "./globals.css";

const vietnam = Be_Vietnam_Pro({ variable: "--font-vietnam", subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700", "800"] });
const display = Space_Grotesk({ variable: "--font-display", subsets: ["latin", "vietnamese"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "NewsPeek — Tin quan trọng, hiểu nhanh", template: "%s | NewsPeek" },
  description: "Tin quan trọng từ Việt Nam và thế giới, được gộp theo sự kiện, tóm tắt rõ ràng và dẫn về nguồn gốc.",
  applicationName: "NewsPeek",
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "vi_VN", siteName: "NewsPeek", title: "NewsPeek — Tin quan trọng, hiểu nhanh", description: "Tin Việt Nam và quốc tế được tổng hợp thông minh, minh bạch nguồn.", images: [{ url: "/og.png", width: 1740, height: 909, alt: "NewsPeek — Tin quan trọng, hiểu nhanh" }] },
  twitter: { card: "summary_large_image", title: "NewsPeek", description: "Tin Việt Nam và quốc tế được tổng hợp thông minh.", images: ["/og.png"] },
  robots: isInternalMode() ? { index: false, follow: false, noarchive: true, nosnippet: true } : undefined,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#090b0d", colorScheme: "dark light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" data-theme="dark" suppressHydrationWarning><body className={`${vietnam.variable} ${display.variable}`}>{children}</body></html>;
}
