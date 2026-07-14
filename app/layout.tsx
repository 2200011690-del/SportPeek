import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Space_Grotesk } from "next/font/google";
import { isInternalMode } from "@/lib/config";
import "./globals.css";

const vietnam = Be_Vietnam_Pro({ variable: "--font-vietnam", subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700", "800"] });
const display = Space_Grotesk({ variable: "--font-display", subsets: ["latin", "vietnamese"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "SportPeek — Tin thể thao quan trọng", template: "%s | SportPeek" },
  description: "Tin thể thao quan trọng, được tổng hợp thông minh. Tin tức, lịch thi đấu, kết quả và bảng xếp hạng trong một trải nghiệm hiện đại.",
  applicationName: "SportPeek",
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "vi_VN", siteName: "SportPeek", title: "SportPeek — Góc nhìn thể thao thông minh", description: "Tin thể thao quan trọng, được tổng hợp thông minh.", images: [{ url: "/og.png", width: 1740, height: 909, alt: "SportPeek — Tin thể thao quan trọng, được tổng hợp thông minh" }] },
  twitter: { card: "summary_large_image", title: "SportPeek", description: "Tin thể thao quan trọng, được tổng hợp thông minh.", images: ["/og.png"] },
  robots: isInternalMode() ? { index: false, follow: false, noarchive: true, nosnippet: true } : undefined,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#090b0d", colorScheme: "dark light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" data-theme="dark" suppressHydrationWarning><body className={`${vietnam.variable} ${display.variable}`}>{children}</body></html>;
}
