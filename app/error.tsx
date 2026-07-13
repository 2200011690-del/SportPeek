"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="fatal-state"><h1>Không thể tải nội dung</h1><p>SportPeek gặp sự cố tạm thời. Vui lòng thử lại.</p><button onClick={reset}>Thử lại</button></main>;
}
