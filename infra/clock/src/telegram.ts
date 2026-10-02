/** Minimal Telegram sender for the Worker (outbound only). Never throws: a failed alert must not break posting. */
export async function telegram(token: string | undefined, chatId: string | undefined, text: string, f: typeof fetch = fetch): Promise<void> {
  if (!token || !chatId) return;
  try {
    await f(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
    });
  } catch {
    /* ignore */
  }
}
