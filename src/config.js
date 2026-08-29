import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Ortam değişkeni eksik: ${name}`);
  }
  return value;
}

export const config = {
  telegram: {
    botToken: required('TELEGRAM_BOT_TOKEN'),
    chatId: required('TELEGRAM_CHAT_ID'),
  },
  authDir: process.env.AUTH_DIR ?? './data/auth',
  dataDir: process.env.DATA_DIR ?? './data',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  notifyDelayMs: Number(process.env.NOTIFY_DELAY_MS ?? 15_000),
};
