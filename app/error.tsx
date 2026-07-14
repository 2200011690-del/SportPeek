"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { ShieldAlert, RefreshCw, Home } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[SportPeek Error Boundary]", error);
  }, [error]);

  return (
    <main className="fatal-state" style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "2rem",
      background: "radial-gradient(circle at center, #111317 0%, #090b0d 100%)",
      color: "#f3f4f6",
      fontFamily: "var(--font-vietnam, sans-serif)",
      textAlign: "center"
    }}>
      <div style={{
        maxWidth: "480px",
        padding: "2.5rem",
        borderRadius: "16px",
        background: "rgba(18, 22, 28, 0.7)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)"
      }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          background: "rgba(239, 68, 68, 0.1)",
          color: "#ef4444",
          marginBottom: "1.5rem"
        }}>
          <ShieldAlert size={32} />
        </div>
        <h1 style={{
          fontSize: "1.5rem",
          fontWeight: "700",
          fontFamily: "var(--font-display, sans-serif)",
          marginBottom: "0.75rem",
          letterSpacing: "-0.025em"
        }}>Không thể tải nội dung</h1>
        <p style={{
          color: "#9ca3af",
          fontSize: "0.925rem",
          lineHeight: "1.5",
          marginBottom: "2rem"
        }}>
          SportPeek gặp sự cố kết nối hoặc dữ liệu tạm thời. Vui lòng thử lại hoặc quay lại trang chủ.
        </p>
        <div style={{
          display: "flex",
          gap: "1rem",
          justifyContent: "center"
        }}>
          <button onClick={reset} className="primary-button" style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer"
          }}>
            <RefreshCw size={16} /> Thử lại
          </button>
          <Link href="/" className="secondary-button" style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem"
          }}>
            <Home size={16} /> Trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}
