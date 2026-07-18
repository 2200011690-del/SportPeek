import assert from "node:assert/strict";
import test from "node:test";
import { DisabledNotificationProvider } from "../../lib/telegram";
import { isQuietTime, preferenceAllows } from "../../lib/telegram/notifications";

test("Telegram remains disabled safely without configuration", async () => {
  const provider = new DisabledNotificationProvider(); assert.equal(provider.configured, false); assert.equal(await provider.sendText("1", "message"), false);
});

test("quiet hours support same-day and overnight ranges in account timezone", () => {
  const afternoonUtc = new Date("2026-07-14T07:30:00.000Z"); // 14:30 in Ho Chi Minh City
  assert.equal(isQuietTime(afternoonUtc, "Asia/Ho_Chi_Minh", "14:00", "15:00"), true);
  const nightUtc = new Date("2026-07-14T16:30:00.000Z"); // 23:30 in Ho Chi Minh City
  assert.equal(isQuietTime(nightUtc, "Asia/Ho_Chi_Minh", "22:00", "07:00"), true);
  assert.equal(isQuietTime(afternoonUtc, "Asia/Ho_Chi_Minh", "22:00", "07:00"), false);
});

test("notification preference maps general-news topics onto the legacy preference columns", () => {
  assert.equal(preferenceAllows("economy_news", { telegram_enabled: true, transfer_news: true }), true);
  assert.equal(preferenceAllows("breaking_news", { telegram_enabled: false, breaking_news: true }), false);
});
