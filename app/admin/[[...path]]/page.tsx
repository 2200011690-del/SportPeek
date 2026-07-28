import Link from "next/link";
import { redirect } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getMemberContext } from "@/lib/auth/access";
import { loadOperationsDashboard } from "@/lib/operations/dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vận hành | NewsPeek", robots: { index: false, follow: false } };

function timeLabel(value: string | null): string {
  if (!value) return "Chưa có";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Không rõ"
    : new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(date);
}

function percentage(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default async function AdminPage() {
  const [chatGPTUser, member] = await Promise.all([
    getChatGPTUser(),
    getMemberContext().catch(() => null),
  ]);
  if (!chatGPTUser && !member) redirect("/login?next=/admin");

  const dashboard = await loadOperationsDashboard();
  const metrics = dashboard.health.metrics;
  const currentAlerts = dashboard.health.alerts?.filter((alert) => alert.scope === "current") ?? [];
  const historicalAlerts = dashboard.health.alerts?.filter((alert) => alert.scope === "historical") ?? [];

  return (
    <main className="operations-dashboard">
      <header className="operations-header">
        <div>
          <span className="eyebrow">NEWSPEEK OPERATIONS</span>
          <h1>Trung tâm vận hành</h1>
          <p>
            Trạng thái hiện tại được tách riêng khỏi lỗi lịch sử. Trang tự làm mới
            khi bạn tải lại và không kích hoạt tác vụ ghi dữ liệu.
          </p>
        </div>
        <div className={`operations-state state-${dashboard.health.state}`}>
          <span>{dashboard.health.state}</span>
          <small>{timeLabel(dashboard.health.generatedAt)}</small>
        </div>
      </header>

      {currentAlerts.length ? (
        <section className="operations-alerts" aria-labelledby="current-alerts">
          <h2 id="current-alerts">Cảnh báo cần xử lý</h2>
          {currentAlerts.map((alert) => (
            <div className={`operations-alert severity-${alert.severity}`} key={alert.code}>
              <strong>{alert.code}</strong>
              <span>{alert.message}</span>
            </div>
          ))}
        </section>
      ) : (
        <div className="operations-ok" role="status">Không có cảnh báo vận hành hiện tại.</div>
      )}

      <section className="operations-metrics" aria-label="Chỉ số pipeline">
        {[
          ["Bài mới nhất", metrics?.latestArticleAgeMinutes === null || metrics?.latestArticleAgeMinutes === undefined ? "—" : `${metrics.latestArticleAgeMinutes} phút`],
          ["Story mới nhất", metrics?.latestStoryAgeMinutes === null || metrics?.latestStoryAgeMinutes === undefined ? "—" : `${metrics.latestStoryAgeMinutes} phút`],
          ["Hàng đợi hiện tại", String(metrics?.queue.pending ?? 0)],
          ["Lỗi hiện tại", String(metrics?.queue.currentFailures ?? 0)],
          ["AI chờ xử lý", String(metrics?.aiBacklog ?? 0)],
          ["Thành công 1 giờ", percentage(metrics?.successRate1h ?? null)],
        ].map(([label, value]) => (
          <article key={label}><span>{label}</span><strong>{value}</strong></article>
        ))}
      </section>

      <section className="operations-section">
        <div className="operations-section-heading">
          <div><span>Nguồn tin</span><h2>Độ tươi và sản lượng 24 giờ</h2></div>
          <Link href="/sources">Mở trang nguồn</Link>
        </div>
        <div className="operations-table-wrap">
          <table>
            <thead><tr><th>Nguồn</th><th>Loại</th><th>Trạng thái</th><th>Bài/24h</th><th>Tin cậy</th><th>Lần lấy gần nhất</th></tr></thead>
            <tbody>
              {dashboard.sources.map((source) => (
                <tr key={source.id}>
                  <td><strong>{source.name}</strong><small>{source.country ?? source.language}</small></td>
                  <td>{source.label}</td>
                  <td><span className={`source-health source-${source.state}`}>{source.state}</span>{source.lastError ? <small title={source.lastError}>Có lỗi gần nhất</small> : null}</td>
                  <td>{source.articleCount24h}</td>
                  <td>{source.reliability}/100</td>
                  <td>{timeLabel(source.lastFetchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="operations-section">
        <div className="operations-section-heading"><div><span>Pipeline</span><h2>30 tác vụ gần nhất</h2></div></div>
        <div className="operations-jobs">
          {dashboard.recentJobs.map((job) => (
            <article key={job.id}>
              <span className={`source-health source-${job.status === "completed" ? "healthy" : job.status === "failed" ? "error" : "stale"}`}>{job.status}</span>
              <strong>{job.type}</strong>
              <time>{timeLabel(job.startedAt)}</time>
              {job.errorCode ? <small>{job.errorCode}</small> : null}
            </article>
          ))}
        </div>
      </section>

      {historicalAlerts.length ? (
        <details className="operations-history">
          <summary>Lỗi lịch sử được giữ để kiểm toán</summary>
          {historicalAlerts.map((alert) => <p key={alert.code}>{alert.message}</p>)}
        </details>
      ) : null}
    </main>
  );
}
