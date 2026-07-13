export interface NotificationProvider { sendBreakingNews(chatId: string, message: string): Promise<boolean>; sendMatchAlert(chatId: string, message: string): Promise<boolean>; sendDailyDigest(chatId: string, message: string): Promise<boolean>; }
export class TelegramNotificationProvider implements NotificationProvider {
  private readonly token = process.env.TELEGRAM_BOT_TOKEN;
  private async send(chatId: string, text: string): Promise<boolean> { if (!this.token) return false; const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }), signal: AbortSignal.timeout(8_000) }); return response.ok; }
  sendBreakingNews(chatId: string, message: string){return this.send(chatId, `🔥 ${message}`)} sendMatchAlert(chatId: string, message: string){return this.send(chatId, `⚽ ${message}`)} sendDailyDigest(chatId: string, message: string){return this.send(chatId, `📰 ${message}`)}
}
export function createLinkCode(): string { return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(); }
