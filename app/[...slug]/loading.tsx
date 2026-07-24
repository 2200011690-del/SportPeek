export default function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-bar" />
      <strong>Đang mở nội dung…</strong>
      <small>NewsPeek đang chuẩn bị dữ liệu mới nhất.</small>
    </div>
  );
}
