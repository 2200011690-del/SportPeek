"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Bell, Languages, MessageCircle, Star, ShieldCheck, UserRound } from "lucide-react";
import { DEFAULT_DEVICE_SETTINGS } from "@/components/SportPeekApp";

type StoredSettings = { displayName: string; language: "vi" | "en"; timezone: string; notifications: boolean[]; quietHoursStart: string; quietHoursEnd: string };
type TelegramAccount = { configured: boolean; connected: boolean; enabled: boolean; botUsername: string | null };

class RuntimeRequestError extends Error {
  constructor(readonly status: number, url: string) {
    super(`${url} trả về HTTP ${status}`);
  }
}

async function fetchRuntime<T>(url: string): Promise<{ data: T }> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new RuntimeRequestError(response.status, url);
  return response.json() as Promise<{ data: T }>;
}

const getInitials = (name: string) => (name?.trim() || "TBD").split(" ").map((word) => word[0]).slice(-2).join("").toUpperCase();

export default function SettingsPage() {
  type SettingsTab = "profile" | "locale" | "preferences" | "notifications" | "telegram" | "privacy";
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_DEVICE_SETTINGS);
  const [email, setEmail] = useState("Chưa đăng nhập");
  const [status, setStatus] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [telegram, setTelegram] = useState<TelegramAccount>({ configured: false, connected: false, enabled: false, botUsername: null });
  const [linkCode, setLinkCode] = useState("");
  useEffect(() => {
    void fetchRuntime<{ email: string; profile: StoredSettings; notifications: boolean[]; quietHoursStart: string; quietHoursEnd: string; telegram: TelegramAccount }>("/api/me/preferences").then((response) => {
      setAuthenticated(true);
      setEmail(response.data.email || "Chưa đăng nhập");
      setSettings({ ...DEFAULT_DEVICE_SETTINGS, ...response.data.profile, notifications: response.data.notifications, quietHoursStart: response.data.quietHoursStart, quietHoursEnd: response.data.quietHoursEnd });
      setTelegram(response.data.telegram);
    }).catch((error: unknown) => {
      setAuthenticated(false);
      if (!(error instanceof RuntimeRequestError && error.status === 401)) setStatus("Không thể tải cài đặt tài khoản lúc này.");
    });
  }, []);
  const save = async () => {
    if (!authenticated) { setStatus("Hãy đăng nhập trước khi lưu thay đổi."); return; }
    setStatus("Đang lưu...");
    const response = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(settings), signal: AbortSignal.timeout(12_000) }).catch(() => null);
    setStatus(response?.ok ? "Đã lưu cài đặt vào tài khoản Supabase." : "Không thể lưu cài đặt lúc này.");
  };
  const resetPersonalization = async () => {
    if (!authenticated) { setStatus("Hãy đăng nhập trước khi xóa dữ liệu cá nhân hóa."); return; }
    setStatus("Đang xóa...");
    const response = await fetch("/api/me/reset", { method: "POST", signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (response?.ok) window.location.reload(); else setStatus("Không thể xóa dữ liệu cá nhân hóa lúc này.");
  };
  const createTelegramCode = async () => {
    if (!authenticated) { setStatus("Hãy đăng nhập trước khi liên kết Telegram."); return; }
    setStatus("Đang tạo mã liên kết..."); const response = await fetch("/api/telegram/link-code", { method: "POST", signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (!response?.ok) { setStatus("Không thể tạo mã liên kết."); return; }
    const result = await response.json() as { configured: boolean; code: string | null }; if (!result.configured || !result.code) { setStatus("Telegram chưa được cấu hình trên server."); return; }
    setLinkCode(result.code); setStatus("Mã có hiệu lực 15 phút. Gửi /link CODE cho bot.");
  };
  const notificationLabels = ["Tin nóng đã xác minh", "Trận đấu bắt đầu", "Bàn thắng", "Kết quả trận đấu", "Tin chuyển nhượng", "Bản tin hằng ngày"];
  const tabs: Array<[SettingsTab, string, typeof UserRound]> = [["profile", "Hồ sơ", UserRound], ["locale", "Ngôn ngữ & múi giờ", Languages], ["preferences", "Sở thích", Star], ["notifications", "Thông báo", Bell], ["telegram", "Telegram", MessageCircle], ["privacy", "Dữ liệu thiết bị", ShieldCheck]];
  return <div className="page-content settings-page"><PageHero eyebrow="CÁ NHÂN" title="Cài đặt" description="Các lựa chọn được lưu theo tài khoản nội bộ." /><div className="settings-layout"><nav>{tabs.map(([value, label, Icon]) => <button key={value} className={activeTab === value ? "active" : ""} onClick={() => { setActiveTab(value); setStatus(""); }}><Icon size={17} />{label}</button>)}</nav><div className="settings-panel">{authenticated === false && <p className="inline-status" role="status">Bạn chưa đăng nhập. <Link href="/login?next=/settings">Đăng nhập</Link> để tải và lưu cài đặt tài khoản.</p>}{activeTab === "profile" && <section><h2>Hồ sơ cá nhân</h2><p>Tên hiển thị dành cho trải nghiệm nội bộ của bạn.</p><div className="avatar-setting"><span className="player-avatar large">{getInitials(settings.displayName)}</span><small>Ảnh đại diện chưa được bật</small></div><label className="form-field"><span>Tên hiển thị</span><input value={settings.displayName} onChange={(event) => setSettings((current) => ({ ...current, displayName: event.target.value }))} /></label><label className="form-field"><span>Email Supabase</span><input value={email} disabled readOnly /></label></section>}{activeTab === "locale" && <section><h2>Ngôn ngữ & múi giờ</h2><p>Áp dụng cho các mốc thời gian và nội dung giao diện.</p><div className="form-row-two"><label className="form-field"><span>Ngôn ngữ</span><select value={settings.language} onChange={(event) => setSettings((current) => ({ ...current, language: event.target.value as "vi" | "en" }))}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label><label className="form-field"><span>Múi giờ</span><select value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))}><option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option><option value="UTC">UTC</option></select></label></div></section>}{activeTab === "preferences" && <section><h2>Sở thích đội bóng</h2><p>Theo dõi đội, giải và cầu thủ tại trang hồ sơ tương ứng.</p><Link className="primary-button inline-action" href="/for-you"><Star size={16} />Chọn đội yêu thích</Link></section>}{activeTab === "notifications" && <section><h2>Thông báo</h2><p>Tùy chọn chỉ được thực thi khi Telegram đã liên kết; quiet hours dùng múi giờ tài khoản.</p>{notificationLabels.map((label, index) => <label className="toggle-row" key={label}><span><strong>{label}</strong><small>{index === 0 ? "Chỉ gửi khi có đủ nguồn tin cậy" : "Theo sở thích đã lưu"}</small></span><input type="checkbox" checked={settings.notifications[index] ?? false} onChange={(event) => setSettings((current) => ({ ...current, notifications: current.notifications.map((value, itemIndex) => itemIndex === index ? event.target.checked : value) }))} /><i /></label>)}<div className="form-row-two"><label className="form-field"><span>Không làm phiền từ</span><input type="time" value={settings.quietHoursStart} onChange={(event) => setSettings((current) => ({ ...current, quietHoursStart: event.target.value }))} /></label><label className="form-field"><span>Đến</span><input type="time" value={settings.quietHoursEnd} onChange={(event) => setSettings((current) => ({ ...current, quietHoursEnd: event.target.value }))} /></label></div></section>}{activeTab === "telegram" && <section><h2>Telegram</h2>{authenticated === false ? <p>Đăng nhập để xem trạng thái và liên kết tài khoản Telegram.</p> : authenticated === null ? <p>Đang tải trạng thái Telegram...</p> : !telegram.configured ? <><p>Server chưa có đủ TELEGRAM_BOT_TOKEN và TELEGRAM_WEBHOOK_SECRET. Module đang tắt an toàn; website vẫn hoạt động.</p><button className="primary-button" disabled>Chưa cấu hình</button></> : telegram.connected ? <><p>Telegram đã liên kết. Dùng /today, /live, /following hoặc /stop trong bot.</p><span className="active-text">Đã kết nối{telegram.botUsername ? ` · @${telegram.botUsername}` : ""}</span></> : <><p>Tạo mã một lần, sau đó gửi <strong>/link CODE</strong> cho bot trong vòng 15 phút.</p><button className="primary-button" onClick={createTelegramCode}>Tạo mã liên kết</button>{linkCode && <div className="telegram-link-code"><strong>{linkCode}</strong><span>/link {linkCode}</span></div>}</>}</section>}{activeTab === "privacy" && <section><h2>Dữ liệu tài khoản</h2><p>Bookmark, theo dõi, lịch sử đọc và cài đặt được lưu trong Supabase với RLS theo tài khoản.</p><button className="danger-button" onClick={resetPersonalization} disabled={!authenticated}>Xóa toàn bộ dữ liệu cá nhân hóa</button></section>}{["profile", "locale", "notifications"].includes(activeTab) && <div className="settings-actions"><button onClick={() => setSettings(DEFAULT_DEVICE_SETTINGS)}>Khôi phục mặc định</button><button className="primary-button" onClick={save} disabled={!authenticated}>Lưu thay đổi</button></div>}{status && <p className="inline-status" role="status">{status}</p>}</div></div></div>;
}

function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-hero"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
