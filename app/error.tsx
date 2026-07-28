"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { ShieldAlert, RefreshCw, Home } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[NewsPeek Error Boundary]", error);
  }, [error]);

  return (
    <main className="fatal-state">
      <div className="fatal-state-card">
        <div className="fatal-state-icon">
          <ShieldAlert size={32} />
        </div>
        <h1>Không thể tải nội dung</h1>
        <p>
          NewsPeek gặp sự cố kết nối hoặc dữ liệu tạm thời. Vui lòng thử lại hoặc quay lại trang chủ.
        </p>
        <div className="fatal-state-actions">
          <button onClick={reset} className="primary-button">
            <RefreshCw size={16} /> Thử lại
          </button>
          <Link href="/" className="secondary-button">
            <Home size={16} /> Trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}
