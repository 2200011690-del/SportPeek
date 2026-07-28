import Link from "next/link";

export default function NotFound() {
  return <main className="large-empty">
    <span className="eyebrow">LỖI 404</span>
    <h1>Không tìm thấy trang</h1>
    <p>Trang bạn tìm kiếm không tồn tại hoặc đã được di chuyển.</p>
    <Link href="/" className="primary-button">Về trang chủ</Link>
  </main>;
}
