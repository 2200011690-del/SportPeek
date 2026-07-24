"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Bell, Languages, MessageCircle, Monitor, Moon, Palette, ShieldCheck, Star, Sun, UserRound } from "lucide-react";
import { DEFAULT_DEVICE_SETTINGS } from "@/components/runtime/RuntimeDataContext";

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
  type SettingsTab = "profile" | "preferences" | "locale" | "notifications" | "appearance" | "telegram" | "privacy";
  type ThemePreference = "light" | "dark" | "system";
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_DEVICE_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<StoredSettings>(DEFAULT_DEVICE_SETTINGS);
  const [email, setEmail] = useState("Chưa đăng nhập");
  const [status, setStatus] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [telegram, setTelegram] = useState<TelegramAccount>({ configured: false, connected: false, enabled: false, botUsername: null });
  const [linkCode, setLinkCode] = useState("");
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    const storedTheme = localStorage.getItem("newspeek.theme");
    return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
      ? storedTheme
      : "system";
  });
  useEffect(() => {
    void fetchRuntime<{ email: string; profile: StoredSettings; notifications: boolean[]; quietHoursStart: string; quietHoursEnd: string; telegram: TelegramAccount }>("/api/me/preferences").then((response) => {
      const nextSettings = { ...DEFAULT_DEVICE_SETTINGS, ...response.data.profile, notifications: response.data.notifications, quietHoursStart: response.data.quietHoursStart, quietHoursEnd: response.data.quietHoursEnd };
      setAuthenticated(true);
      setEmail(response.data.email || "Chưa đăng nhập");
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      setTelegram(response.data.telegram);
    }).catch((error: unknown) => {
      setAuthenticated(false);
      if (!(error instanceof RuntimeRequestError && error.status === 401)) setStatus("Không thể tải cài đặt tài khoản lúc này.");
    });
  }, []);
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const save = async () => {
    if (!authenticated) { setStatus("Hãy đăng nhập trước khi lưu thay đổi."); return; }
    setStatus("Đang lưu...");
    const response = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(settings), signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (response?.ok) setSavedSettings(settings);
    setStatus(response?.ok ? "Đã lưu cài đặt vào tài khoản Supabase." : "Không thể lưu cài đặt lúc này.");
  };
  const applyTheme = (value: ThemePreference) => {
    setThemePreference(value);
    localStorage.setItem("newspeek.theme", value);
    window.dispatchEvent(new CustomEvent("newspeek-theme-change", { detail: value }));
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
  const notificationLabels = ["Tin nóng đã xác minh", "Tin thế giới", "Tin Việt Nam", "Tin công nghệ", "Tin kinh tế", "Bản tin hằng ngày"];
  const tabs: Array<[SettingsTab, string, typeof UserRound]> = [
    ["profile", "Hồ sơ", UserRound],
    ["preferences", "Nội dung quan tâm", Star],
    ["locale", "Ngôn ngữ", Languages],
    ["notifications", "Thông báo", Bell],
    ["appearance", "Giao diện", Palette],
    ["telegram", "Telegram", MessageCircle],
    ["privacy", "Dữ liệu & quyền riêng tư", ShieldCheck],
  ];
  const accountSettingsTab = ["profile", "locale", "notifications"].includes(activeTab);
  return (
    <div className="page-content settings-page">
      <PageHero eyebrow="TÀI KHOẢN" title="Cài đặt" description="Quản lý trải nghiệm đọc, thông báo và dữ liệu cá nhân." />
      <div className="settings-layout">
        <nav aria-label="Nhóm cài đặt">
          {tabs.map(([value, label, Icon]) => (
            <button
              type="button"
              key={value}
              className={activeTab === value ? "active" : ""}
              aria-current={activeTab === value ? "page" : undefined}
              onClick={() => { setActiveTab(value); setStatus(""); }}
            >
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>
        <div className="settings-panel">
          {authenticated === false && accountSettingsTab && (
            <p className="inline-status" role="status">
              Bạn chưa đăng nhập. <Link href="/login?next=/settings">Đăng nhập</Link> để đồng bộ cài đặt tài khoản.
            </p>
          )}
          {activeTab === "profile" && (
            <section>
              <span className="settings-section-label">Tài khoản</span>
              <h2>Hồ sơ cá nhân</h2>
              <p>Tên hiển thị dùng trong trải nghiệm cá nhân hóa của NewsPeek.</p>
              <div className="avatar-setting"><span className="player-avatar large">{getInitials(settings.displayName)}</span><small>Ảnh đại diện chưa được bật</small></div>
              <label className="form-field"><span>Tên hiển thị</span><input value={settings.displayName} onChange={(event) => setSettings((current) => ({ ...current, displayName: event.target.value }))} /></label>
              <label className="form-field"><span>Email</span><input value={email} disabled readOnly /></label>
            </section>
          )}
          {activeTab === "preferences" && (
            <section>
              <span className="settings-section-label">Bảng tin</span>
              <h2>Nội dung quan tâm</h2>
              <p>Theo dõi các nguồn bạn thường đọc để cải thiện mục Dành cho bạn.</p>
              <Link className="primary-button inline-action" href="/sources"><Star size={16} />Quản lý nguồn theo dõi</Link>
            </section>
          )}
          {activeTab === "locale" && (
            <section>
              <span className="settings-section-label">Khu vực</span>
              <h2>Ngôn ngữ & múi giờ</h2>
              <p>Áp dụng cho mốc thời gian và nội dung giao diện.</p>
              <div className="form-row-two">
                <label className="form-field"><span>Ngôn ngữ</span><select value={settings.language} onChange={(event) => setSettings((current) => ({ ...current, language: event.target.value as "vi" | "en" }))}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
                <label className="form-field"><span>Múi giờ</span><select value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))}><option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option><option value="UTC">UTC</option></select></label>
              </div>
            </section>
          )}
          {activeTab === "notifications" && (
            <section>
              <span className="settings-section-label">Theo dõi</span>
              <h2>Thông báo</h2>
              <p>Chọn loại bản tin muốn nhận sau khi đã liên kết Telegram.</p>
              {notificationLabels.map((label, index) => (
                <label className="toggle-row" key={label}>
                  <span><strong>{label}</strong><small>{index === 0 ? "Chỉ gửi khi có nhiều tín hiệu đáng chú ý" : "Theo sở thích đã lưu"}</small></span>
                  <input type="checkbox" checked={settings.notifications[index] ?? false} onChange={(event) => setSettings((current) => ({ ...current, notifications: current.notifications.map((value, itemIndex) => itemIndex === index ? event.target.checked : value) }))} />
                  <i />
                </label>
              ))}
              <div className="form-row-two">
                <label className="form-field"><span>Không làm phiền từ</span><input type="time" value={settings.quietHoursStart} onChange={(event) => setSettings((current) => ({ ...current, quietHoursStart: event.target.value }))} /></label>
                <label className="form-field"><span>Đến</span><input type="time" value={settings.quietHoursEnd} onChange={(event) => setSettings((current) => ({ ...current, quietHoursEnd: event.target.value }))} /></label>
              </div>
            </section>
          )}
          {activeTab === "appearance" && (
            <section>
              <span className="settings-section-label">Hiển thị</span>
              <h2>Giao diện</h2>
              <p>Chọn nền đọc phù hợp. Thay đổi được lưu trên thiết bị này.</p>
              <div className="theme-options" role="radiogroup" aria-label="Chọn giao diện">
                {([
                  ["light", "Sáng", Sun, "Nền sáng, độ tương phản cao"],
                  ["dark", "Tối", Moon, "Dễ đọc trong môi trường thiếu sáng"],
                  ["system", "Theo hệ thống", Monitor, "Tự đổi theo thiết bị"],
                ] as const).map(([value, label, Icon, description]) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={themePreference === value}
                    className={themePreference === value ? "active" : ""}
                    key={value}
                    onClick={() => applyTheme(value)}
                  >
                    <Icon size={21} />
                    <span><strong>{label}</strong><small>{description}</small></span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {activeTab === "telegram" && (
            <section>
              <span className="settings-section-label">Kết nối</span>
              <h2>Telegram</h2>
              {authenticated === false ? <p>Đăng nhập để xem trạng thái và liên kết tài khoản Telegram.</p> : authenticated === null ? <p>Đang tải trạng thái Telegram…</p> : !telegram.configured ? <><p>Telegram chưa được cấu hình trên máy chủ. Website vẫn hoạt động bình thường.</p><button className="primary-button" disabled>Chưa cấu hình</button></> : telegram.connected ? <><p>Telegram đã liên kết. Dùng /today, /following hoặc /stop trong bot.</p><span className="active-text">Đã kết nối{telegram.botUsername ? ` · @${telegram.botUsername}` : ""}</span></> : <><p>Tạo mã một lần, sau đó gửi <strong>/link CODE</strong> cho bot trong vòng 15 phút.</p><button className="primary-button" onClick={createTelegramCode}>Tạo mã liên kết</button>{linkCode && <div className="telegram-link-code"><strong>{linkCode}</strong><span>/link {linkCode}</span></div>}</>}
            </section>
          )}
          {activeTab === "privacy" && (
            <section>
              <span className="settings-section-label">Quyền riêng tư</span>
              <h2>Dữ liệu tài khoản</h2>
              <p>Bài đã lưu, nguồn theo dõi, lịch sử đọc và cài đặt được bảo vệ theo tài khoản.</p>
              <button className="danger-button" onClick={resetPersonalization} disabled={!authenticated}>Xóa toàn bộ dữ liệu cá nhân hóa</button>
            </section>
          )}
          {accountSettingsTab && dirty && (
            <div className="settings-actions">
              <button onClick={() => setSettings(savedSettings)}>Hoàn tác</button>
              <button className="primary-button" onClick={save} disabled={!authenticated}>Lưu thay đổi</button>
            </div>
          )}
          {status && <p className="inline-status" role="status">{status}</p>}
        </div>
      </div>
    </div>
  );
}

function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-hero"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
