import { access, copyFile } from "node:fs/promises";

try { await access(".env.local"); console.log("✓ .env.local đã tồn tại"); }
catch { await copyFile(".env.example", ".env.local"); console.log("✓ Đã tạo .env.local từ .env.example"); }
console.log("✓ Cài dependencies bằng npm install");
console.log("✓ Chạy npm run dev để mở NewsPeek");
