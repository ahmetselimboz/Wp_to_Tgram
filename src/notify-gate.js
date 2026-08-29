/**
 * Sohbet açıkken (mesaj okundu / sohbet sıfırlandı / sen cevap yazdın)
 * Telegram bildirimi göndermemek için kısa bir bekleme kapısı.
 */
export function createNotifyGate({ delayMs, logger, send }) {
  const pending = new Map();

  function entryId(key) {
    return `${key?.remoteJid ?? ''}|${key?.id ?? ''}`;
  }

  async function flush(id) {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    try {
      await send(item.text);
    } catch (err) {
      logger.error({ err }, 'Gecikmeli Telegram bildirimi gönderilemedi');
    }
  }

  function schedule(message, text) {
    if (delayMs <= 0) {
      return send(text);
    }

    const id = entryId(message.key);
    const existing = pending.get(id);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      flush(id);
    }, delayMs);

    pending.set(id, {
      timer,
      chatJid: message.key.remoteJid,
      text,
    });
  }

  function cancelMessage(key) {
    const id = entryId(key);
    const item = pending.get(id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(id);
    logger.debug({ id }, 'Bildirim iptal (mesaj okundu)');
  }

  function cancelChat(jid) {
    if (!jid) return;
    for (const [id, item] of pending) {
      if (item.chatJid !== jid) continue;
      clearTimeout(item.timer);
      pending.delete(id);
    }
  }

  function clear() {
    for (const item of pending.values()) clearTimeout(item.timer);
    pending.clear();
  }

  return { schedule, cancelMessage, cancelChat, clear };
}

export function isReadStatus(status) {
  return status === 4 || status === 5;
}
