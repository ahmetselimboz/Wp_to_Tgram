/**
 * WhatsApp mesajlarını asistan tarzında Telegram metnine dönüştürür.
 */

const MEDIA_LABELS = {
  image: 'bir fotoğraf gönderdi',
  video: 'bir video gönderdi',
  audio: 'bir ses kaydı gönderdi',
  ptt: 'bir ses mesajı gönderdi',
  document: 'bir dosya gönderdi',
  sticker: 'bir çıkartma gönderdi',
  location: 'konum paylaştı',
  contact: 'bir kişi paylaştı',
  poll: 'bir anket oluşturdu',
  reaction: 'bir mesaja tepki verdi',
  unknown: 'bir mesaj gönderdi',
};

function escapeMarkdown(text) {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function extractText(message) {
  const content = message.message;
  if (!content) return null;

  return (
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    content.documentMessage?.caption ??
    null
  );
}

function detectMediaType(message) {
  const content = message.message;
  if (!content) return 'unknown';

  if (content.imageMessage) return 'image';
  if (content.videoMessage) return 'video';
  if (content.audioMessage) {
    return content.audioMessage.ptt ? 'ptt' : 'audio';
  }
  if (content.documentMessage) return 'document';
  if (content.stickerMessage) return 'sticker';
  if (content.locationMessage || content.liveLocationMessage) return 'location';
  if (content.contactMessage) return 'contact';
  if (content.pollCreationMessage) return 'poll';
  if (content.reactionMessage) return 'reaction';
  if (extractText(message)) return 'text';

  return 'unknown';
}

function mediaEmoji(type) {
  const map = {
    image: '📷',
    video: '🎥',
    audio: '🎵',
    ptt: '🎤',
    document: '📎',
    sticker: '😊',
    location: '📍',
    contact: '👤',
    poll: '📊',
    reaction: '👍',
    unknown: '💬',
  };
  return map[type] ?? '💬';
}

export function formatNotification(message, { senderName, groupName, isGroup }) {
  const type = detectMediaType(message);
  const safeName = escapeMarkdown(senderName || 'Bilinmeyen');
  const header = isGroup
    ? `👥 *${escapeMarkdown(groupName || 'Grup')}*\n👤 ${safeName}`
    : `👤 ${safeName}`;

  if (type === 'text') {
    const text = extractText(message);
    return `${header}\n\n💬 ${escapeMarkdown(text ?? '')}`;
  }

  if (type === 'reaction') {
    const emoji = message.message.reactionMessage?.text ?? '👍';
    return `${header}\n\n${emoji} bir mesaja tepki verdi.`;
  }

  const label = MEDIA_LABELS[type] ?? MEDIA_LABELS.unknown;
  const caption = extractText(message);

  let body = `${mediaEmoji(type)} ${label}.`;
  if (caption) {
    body += `\n\n_"${escapeMarkdown(caption)}"_`;
  }

  return `${header}\n\n${body}`;
}

export function formatConnectionStatus(status) {
  const labels = {
    connected: '✅ WhatsApp bağlantısı kuruldu.',
    disconnected: '⚠️ WhatsApp bağlantısı kesildi. Yeniden bağlanılıyor…',
    qr: '📱 WhatsApp\'a bağlanmak için QR kodu tarayın.',
  };
  const text = labels[status] ?? status;
  return escapeMarkdown(text);
}
