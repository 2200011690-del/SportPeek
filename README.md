# NewsPeek

NewsPeek là website tổng hợp tin tức Việt Nam và quốc tế. Hệ thống đọc RSS công khai, gom các bài nói về cùng một sự kiện, loại bỏ dữ kiện trùng, tạo bản tóm tắt tiếng Việt và giữ liên kết về từng bài gốc.

## Tính năng

- Bảng tin mới nhất, nổi bật và cá nhân hóa theo nguồn người đọc theo dõi.
- Chuyên mục Việt Nam, Thế giới, Kinh tế, Công nghệ, Chính trị, Sức khỏe, Khoa học, Văn hóa & Giải trí và Thể thao.
- 25 feed mặc định từ các nhà xuất bản Việt Nam và quốc tế.
- AI failover theo chuỗi Gemini → Groq → Cloudflare Workers AI; OpenAI vẫn được hỗ trợ khi cấu hình.
- Chi tiết tin chỉ tập trung vào ảnh, bản tóm tắt đầy đủ và liên kết nguồn.
- Supabase lưu nguồn, bài thô, story cluster, bookmark, follow và lịch sử xử lý.
- Worker chạy lịch RSS/story/AI mỗi phút trên Cloudflare.

Các API và giao diện dữ liệu bóng đá riêng (trận đấu, kết quả, bảng xếp hạng, đội và cầu thủ) đã được gỡ khỏi luồng sản phẩm. Các bảng cũ trong migration chưa bị xóa để có thể rollback an toàn.

## Chạy cục bộ

Yêu cầu Node.js 22.13+.

```bash
npm install
npm run setup
npm run dev
```

Mở `http://localhost:3000`.

## Kiểm thử

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

E2E với một server đang chạy:

```powershell
$env:E2E_BASE_URL='http://localhost:3000'
npm run test:e2e
```

## Đồng bộ và xử lý tin

```bash
npm run rss:test
npm run rss:sync
npm run rss:report
npm run stories:process
npm run stories:summarize
npm run stories:report
npm run ops:health
```

## Biến môi trường chính

| Biến | Mục đích |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | URL canonical |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase public URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Quyền worker/server, không đưa ra client |
| `AI_PROVIDER` | `failover`, `gemini`, `groq`, `cloudflare`, `openai` hoặc `off` |
| `AI_PROVIDER_CHAIN` | Thứ tự failover, mặc định `gemini,groq,cloudflare` |
| `GEMINI_API_KEY` | Gemini API key |
| `GROQ_API_KEY` | Groq API key |
| `OPENAI_API_KEY` | OpenAI API key tùy chọn |
| `NEWS_RSS_FEEDS` | JSON danh sách feed tùy chỉnh; bỏ trống để dùng nguồn mặc định |
| `CRON_SECRET` | Bảo vệ endpoint vận hành |

Không commit `.env.local` hoặc bất kỳ secret nào.

## API chính

- `GET /api/news`, `/api/stories`, `/api/stories/[slug]`
- `GET /api/feed/for-you`, `/api/search?q=...`, `/api/sources`
- `POST /api/bookmarks`, `/api/follows`, `/api/profile`
- `POST /api/cron/ingest`, `/api/ai/process` với Bearer secret

## Cấu trúc

```text
app/                 route, API, SEO và trạng thái lỗi
components/          giao diện NewsPeek
lib/ai/              AI providers, grounding và failover
lib/rss/             nguồn, parser và đồng bộ RSS
lib/stories/         gom cụm, tóm tắt, lưu và trình bày story
lib/supabase/        Supabase clients và quyền truy cập
worker/              Cloudflare Worker + cron
tests/               unit, integration và E2E smoke
```
