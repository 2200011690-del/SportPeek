"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, Sparkles } from "lucide-react";
import { FormField } from "@/components/ui/badges";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export default function AuthPage({ type, signupAllowed }: { type: "login" | "register" | "forgot" | "reset"; signupAllowed: boolean }) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "callback_invalid") queueMicrotask(() => setStatus("Liên kết đăng nhập không hợp lệ hoặc đã hết hạn."));
    if (error === "callback_failed") queueMicrotask(() => setStatus("Không thể hoàn tất đăng nhập. Vui lòng thử lại."));
    if (error === "invitation_only") queueMicrotask(() => setStatus("NewsPeek chỉ dành cho thành viên được mời; đăng ký công khai đã tắt."));
    if (error === "not_invited") queueMicrotask(() => setStatus("Email này chưa nằm trong danh sách thành viên NewsPeek."));
    if (error === "configuration_required") queueMicrotask(() => setStatus("Đăng nhập nội bộ chưa được cấu hình hoàn chỉnh."));
  }, []);
  const content = type === "login" ? ["Chào mừng trở lại", "Đăng nhập để cá nhân hóa bảng tin của bạn.", "Đăng nhập"] : type === "register" ? ["Tạo tài khoản", "Theo dõi nguồn và lưu những tin quan trọng.", "Đăng ký"] : type === "reset" ? ["Đặt mật khẩu mới", "Nhập mật khẩu mới cho tài khoản của bạn.", "Cập nhật mật khẩu"] : ["Khôi phục mật khẩu", "Nhập email để nhận liên kết đặt lại mật khẩu.", "Gửi liên kết"];
  const returnTo = () => { const value = new URLSearchParams(window.location.search).get("next"); return value?.startsWith("/") && !value.startsWith("//") ? value : "/for-you"; };
  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo())}`;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setStatus("Đang xử lý..."); const client = createSupabaseClient();
    if (type === "register" && !signupAllowed) { setStatus("Đăng ký công khai đã tắt. Chủ sở hữu cần mời email của bạn."); return; }
    if (!client) { setStatus("Supabase Auth chưa được cấu hình."); return; }
    const data = new FormData(event.currentTarget); const email = String(data.get("email") ?? ""); const password = String(data.get("password") ?? "");
    const result = type === "login" ? await client.auth.signInWithPassword({ email, password }) : type === "register" ? await client.auth.signUp({ email, password, options: { data: { display_name: String(data.get("displayName") ?? "") } } }) : type === "reset" ? await client.auth.updateUser({ password }) : await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}` });
    if (result.error) setStatus(result.error.message); else if (type === "login") window.location.href = returnTo(); else if (type === "reset") { setStatus("Đã cập nhật mật khẩu. Đang chuyển về bảng tin..."); window.setTimeout(() => { window.location.href = "/for-you"; }, 900); } else setStatus("Hãy kiểm tra email để hoàn tất.");
  };
  const oauth = async () => { const client = createSupabaseClient(); if (!client) return setStatus("Google OAuth chưa được kết nối."); const result = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl() } }); if (result.error) setStatus(result.error.message); };
  const magic = async (event: React.MouseEvent<HTMLButtonElement>) => { const form = event.currentTarget.form; const email = String(new FormData(form ?? undefined).get("email") ?? ""); const client = createSupabaseClient(); if (!client) return setStatus("Magic Link chưa được kết nối."); const result = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl() } }); setStatus(result.error?.message ?? "Magic Link đã được gửi."); };
  return <div className="auth-page"><div className="auth-art"><div className="brand large"><span className="brand-symbol"><span /></span><span>NEWS<b>PEEK</b></span></div><div><span className="eyebrow">TIN TỨC · ĐƯỢC TỔNG HỢP THÔNG MINH</span><h2>Một góc nhìn rõ ràng hơn về những gì đang diễn ra.</h2><p>NewsPeek gom nhiều nguồn, loại bỏ nội dung trùng và làm nổi bật điều thực sự đáng chú ý.</p></div><div className="auth-stats"><span><strong>Việt Nam</strong>đa lĩnh vực</span><span><strong>Quốc tế</strong>đa nguồn</span><span><strong>AI</strong>xử lý trước</span></div></div><div className="auth-form-wrap"><Link href="/" className="auth-back"><ChevronLeft size={16} />Về trang chủ</Link><form className="auth-form" onSubmit={submit}><span className="eyebrow">TÀI KHOẢN NEWSPEEK</span><h1>{content[0]}</h1><p>{content[1]}</p>{type === "register" && <FormField label="Tên hiển thị" name="displayName" value="" required />}{type !== "reset" && <FormField label="Email" name="email" type="email" value="" required />}{type !== "forgot" && <FormField label={type === "reset" ? "Mật khẩu mới" : "Mật khẩu"} name="password" type="password" value="" required />}{type === "login" && <div className="form-options"><label><input type="checkbox" />Ghi nhớ tôi</label><Link href="/forgot-password">Quên mật khẩu?</Link></div>}<button type="submit" className="primary-button auth-submit">{content[2]}<ArrowRight size={17} /></button>{status && <p className="auth-status" role="status">{status}</p>}{(type === "login" || type === "register") && <><div className="or"><span />hoặc<span /></div><button type="button" className="oauth-button" onClick={oauth}>G<span>{type === "login" ? "Đăng nhập" : "Đăng ký"} với Google</span></button><button type="button" className="magic-button" onClick={magic}><Sparkles size={17} />Gửi magic link</button></>}{type === "login" && !signupAllowed ? <p className="auth-switch">Chỉ thành viên được mời mới có thể đăng nhập.</p> : type !== "reset" && <p className="auth-switch">{type === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"} <Link href={type === "login" ? "/register" : "/login"}>{type === "login" ? "Đăng ký" : "Đăng nhập"}</Link></p>}</form></div></div>;
}
