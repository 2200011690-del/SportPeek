export interface NotificationProvider {
  readonly configured: boolean;
  sendText(chatId: string, message: string): Promise<boolean>;
  sendBreakingNews(chatId: string, message: string): Promise<boolean>;
  sendMatchAlert(chatId: string, message: string): Promise<boolean>;
  sendDailyDigest(chatId: string, message: string): Promise<boolean>;
}

const safeMessage = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim().slice(0, 3_800);

export class DisabledNotificationProvider implements NotificationProvider {
  readonly configured = false;
  async sendText(chatId: string, message: string): Promise<boolean> { void chatId; void message; return false; }
  async sendBreakingNews(chatId: string, message: string): Promise<boolean> { void chatId; void message; return false; }
  async sendMatchAlert(chatId: string, message: string): Promise<boolean> { void chatId; void message; return false; }
  async sendDailyDigest(chatId: string, message: string): Promise<boolean> { void chatId; void message; return false; }
}

export class TelegramNotificationProvider implements NotificationProvider {
  readonly configured = true;
  constructor(private readonly token = process.env.TELEGRAM_BOT_TOKEN ?? "") {}
  async sendText(chatId: string, text: string): Promise<boolean> {
    if (!this.token || !/^-?\d{1,24}$/.test(chatId)) return false;
    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: safeMessage(text), disable_web_page_preview: true }), signal: AbortSignal.timeout(8_000) });
    return response.ok;
  }
  sendBreakingNews(chatId: string, message: string) { return this.sendText(chatId, `🔥 ${message}`); }
  sendMatchAlert(chatId: string, message: string) { return this.sendText(chatId, `⚽ ${message}`); }
  sendDailyDigest(chatId: string, message: string) { return this.sendText(chatId, `📰 ${message}`); }
}

export function createLinkCode(): string { return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(); }
export function getNotificationProvider(): NotificationProvider { return process.env.TELEGRAM_BOT_TOKEN ? new TelegramNotificationProvider() : new DisabledNotificationProvider(); }
