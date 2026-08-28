import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { config } from './config.js';

const API_BASE = `https://api.telegram.org/bot${config.telegram.botToken}`;

export async function sendTelegramMessage(text) {
  const response = await fetch(`${API_BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegram.chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API hatası (${response.status}): ${body}`);
  }

  return response.json();
}

export async function sendTelegramPhoto(filePath, caption) {
  const buffer = await readFile(filePath);
  const formData = new FormData();
  formData.append('chat_id', config.telegram.chatId);
  formData.append('photo', new Blob([buffer], { type: 'image/png' }), basename(filePath));

  if (caption) {
    formData.append('caption', caption);
    formData.append('parse_mode', 'MarkdownV2');
  }

  const response = await fetch(`${API_BASE}/sendPhoto`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram fotoğraf hatası (${response.status}): ${body}`);
  }

  return response.json();
}
