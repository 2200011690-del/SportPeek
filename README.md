# SportPeek

> **Tin thể thao quan trọng, được tổng hợp thông minh.**

SportPeek là nền tảng tổng hợp tin thể thao tiếng Việt, tập trung vào bóng đá trong MVP. Ứng dụng gom các bài cùng sự kiện, tạo tóm tắt trung lập, chấm độ nóng/độ tin cậy và kết hợp tin tức với lịch thi đấu, kết quả, live score, bảng xếp hạng và cá nhân hóa.

Toàn bộ tin và trận trong bản mặc định được ghi rõ **Dữ liệu minh họa**. Không có nội dung báo chí toàn văn, logo thương mại hoặc video highlights được sao chép.

## Kiến trúc

- **Web:** Next.js App Router tương thích Vinext, React 19, TypeScript strict, Tailwind CSS 4 và CSS design system riêng.
- **Dữ liệu:** Supabase PostgreSQL/Auth; migration đầy đủ, full-text search, trigger, index và Row Level Security. Giao diện tự chuyển sang dữ liệu demo nếu chưa cấu hình Supabase.
- **AI:** `AIProvider` có mock fallback; cấu hình `openai`, `gemini` qua biến môi trường mà không làm hỏng build khi thiếu key.
- **Ingestion:** RSS chính thức VFF/VPF chạy mặc định, có cache 5 phút, chuẩn hóa, content hash, link nguồn gốc và fallback an toàn.
- **Thể thao:** `SportsDataProvider` có adapter API-Football cho live score, fixtures, results, standings và teams; tự fallback khi thiếu key.
- **Thông báo:** `NotificationProvider` và Telegram adapter tự vô hiệu hóa an toàn khi thiếu token.
- **Triển khai:** build ESM tương thích Cloudflare/Sites; cũng có thể chạy Next.js trên Vercel và Supabase ở backend.

Các quyết định chính: giao diện được xây dựng mobile-first nhưng desktop dùng bố cục 3 cột; dark mode mặc định; dữ liệu công khai render được không cần đăng nhập; mọi hành động sở hữu dữ liệu được kiểm tra server/RLS; service-role chỉ tồn tại phía server; MVP dùng heuristic trước embedding để luôn chạy offline.

## Tính năng

- Trang chủ dashboard 3 cột, ticker, tin nổi bật/mới nhất, live, lịch đấu, BXH, chủ đề và đội phổ biến.
- `/for-you`, `/news`, chi tiết tin, `/live`, `/fixtures`, `/results`, chi tiết trận, `/standings`, `/transfers`.
- Trang giải đấu, đội bóng, cầu thủ, tìm kiếm hợp nhất, bookmarks, settings và auth UI.
- Admin dashboard có 8 KPI, biểu đồ, ingestion jobs và AI jobs.
- Dark/light theme, sidebar drawer, mobile bottom navigation, keyboard search `Ctrl/Cmd + K`, optimistic bookmark/follow.
- Metadata động, canonical, sitemap, robots, reduced-motion, focus state, semantic labels và no-index cho trang riêng tư.
- Trang pháp lý: `/terms`, `/privacy`, `/copyright`, `/sources`.
- API đã validate bằng Zod, rate limit cho search/cron, secret protection cho cron/AI và URL validation chống SSRF.

## Bắt đầu nhanh

Yêu cầu Node.js 22.13+ và npm 11+.

```bash
npm install
npm run setup
npm run dev
```

Mở `http://localhost:3000`. `npm run setup` tạo `.env.local` từ `.env.example` nếu chưa có. Không cần dịch vụ bên thứ ba để chạy chế độ demo.

## Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run start        # production preview
npm run lint         # ESLint
npm run typecheck    # TypeScript strict
npm test             # unit + integration tests
npm run test:e2e     # route smoke E2E; đặt E2E_BASE_URL
npm run format       # Prettier
npm run db:migrate   # push migration lên Supabase
npm run db:seed      # reset local Supabase và nạp seed
npm run ingest:mock  # chạy ingestion mock không cần server
npm run cron:demo    # gọi cron endpoint của server đang chạy
```

Chạy E2E với server đang hoạt động:

```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

Trên PowerShell: `$env:E2E_BASE_URL='http://localhost:3000'; npm run test:e2e`.

## Supabase

1. Tạo project Supabase và điền URL/anon key vào `.env.local`.
2. Cài Supabase CLI, sau đó `npx supabase link --project-ref <ref>`.
3. Chạy `npm run db:migrate`.
4. Seed local bằng `npm run db:seed`, hoặc chạy [`supabase/seed/seed.sql`](./supabase/seed/seed.sql) trong SQL Editor cho môi trường demo.
5. Cấu hình Site URL và redirect URL `/auth/callback` trong Supabase Auth; bật Email/Password, Magic Link và Google nếu cần.
6. Thêm email admin vào `ADMIN_EMAILS`, sau đó nâng `profiles.role='admin'` bằng SQL/service process an toàn. Không nhận role từ client.

Migration chính: [`supabase/migrations/202607130001_sportpeek_schema.sql`](./supabase/migrations/202607130001_sportpeek_schema.sql). Migration tạo 24 bảng, enum, FK, unique constraint chống trùng, search vector/GIN index, audit log, trigger và policy RLS.

## Biến môi trường

| Biến | Phạm vi | Bắt buộc |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | URL canonical | Có khi deploy |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase public URL | Chỉ khi dùng Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key + RLS | Chỉ khi dùng Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin/worker | Chỉ cho worker/admin |
| `AI_PROVIDER` | `mock`, `openai`, `gemini` | Không, mặc định mock |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI adapter | Không |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini adapter | Không |
| `TELEGRAM_BOT_TOKEN` | Telegram bot | Không |
| `CRON_SECRET` | Bảo vệ cron/AI endpoint | Có khi bật cron |
| `ADMIN_EMAILS` | Allowlist khởi tạo admin | Có cho production |
| `SPORTS_DATA_PROVIDER`, `SPORTS_DATA_API_KEY` | Live sports provider | Không, mặc định mock |

Không commit `.env.local`. Tuyệt đối không đặt `SUPABASE_SERVICE_ROLE_KEY` trong biến `NEXT_PUBLIC_*`.

## API chính

- `GET /api/news`, `/api/feed/for-you`, `/api/search?q=...`
- `GET /api/matches/live`, `/api/fixtures`, `/api/results`, `/api/standings`
- `GET /api/teams/[slug]`, `/api/players/[id]`
- `POST /api/bookmarks`, `/api/follows`, `/api/profile`
- `POST /api/cron/ingest`, `/api/ai/process` với `Authorization: Bearer $CRON_SECRET`

Các API sở hữu dữ liệu trong demo trả mock response; migration/RLS là nguồn sự thật khi nối Supabase.

## Dữ liệu production và fallback

- AI classify/summary/entity/preview/recap.
- Tin tức mặc định là dữ liệu thật từ RSS chính thức của VFF và VPF.
- Live score, fixtures, results và standings chuyển sang API-Football khi đặt `SPORTS_DATA_PROVIDER=api-football` và `SPORTS_DATA_API_KEY`; nếu thiếu key, giao diện hiển thị rõ dữ liệu dự phòng.
- Authentication interaction trên giao diện demo; Supabase client/schema đã cấu hình sẵn.
- Bookmark/follow optimistic state trong phiên demo; production lưu bằng Supabase/RLS.
- Telegram không gửi khi thiếu token.

## Telegram

Module hỗ trợ sinh mã liên kết, gửi breaking news, match alert và daily digest. Bot production có thể ánh xạ `/start`, `/link CODE`, `/today`, `/live`, `/following`, `/stop` vào service layer. Khi `TELEGRAM_BOT_TOKEN` trống, tất cả send method trả `false` an toàn.

## Triển khai Vercel + Supabase

1. Push repository lên GitHub và import vào Vercel.
2. Đặt toàn bộ biến môi trường trong Project Settings; chỉ ba biến `NEXT_PUBLIC_*` được phép ra client.
3. Chạy migration/seed trên Supabase trước lần deploy đầu.
4. Build command `npm run build`; cài đặt `npm install`.
5. Cập nhật `NEXT_PUBLIC_APP_URL`, Supabase Site URL, redirect URL và Google OAuth callback theo domain production.
6. Tạo Vercel Cron gọi `POST /api/cron/ingest` với Bearer secret. Worker dài hạn có thể chuyển sang Railway/Render và dùng service-role server-side.

## Cấu trúc chính

```text
app/                 routes, API, SEO, error/loading states
components/          SportPeek UI shell và reusable components
lib/ai/              AI provider abstraction + mock
lib/ingestion/       RSS/JSON/mock providers, normalization, dedupe
lib/scoring/         hotness, reliability, personalization
lib/sports-data/     sports provider abstraction
lib/supabase/        public/admin clients
lib/telegram/        notification provider
supabase/migrations/ schema + RLS
supabase/seed/        demo dataset
tests/               unit, integration, E2E smoke
```

## Hạn chế và hướng tiếp theo

- Adapter OpenAI/Gemini và sports API hiện dùng mock fallback; cần chọn vendor và hoàn thiện request/response mapping sau khi có tài khoản.
- Auth form là UI/configuration-ready; cần nối hành động form với Supabase Auth và hoàn thiện email templates/OAuth redirect trong project thật.
- Feed demo giữ bookmark/follow trong React state; production cần đổi API route sang Supabase server client.
- RSS parser MVP chỉ xử lý cấu trúc phổ biến; production nên dùng parser XML chuẩn và kiểm tra robots/điều khoản theo từng nguồn.
- E2E mặc định là smoke test HTTP để chạy nhẹ. Nên bổ sung Playwright project riêng cho tương tác đăng nhập/bookmark/admin trong CI có test Supabase.
- Bước tiếp theo nên là: nối Supabase thật → chọn sports provider → thêm queue/Redis → embedding clustering → web push/Telegram webhook → observability/Sentry.
