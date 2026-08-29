import { startWhatsApp, stopWhatsApp } from './whatsapp.js';

let stopping = false;

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} alındı, oturum kaydedilip kapanıyor…`);
  try {
    await stopWhatsApp();
  } catch (err) {
    console.error('Kapanış hatası:', err);
  }
  process.exit(0);
}

process.on('unhandledRejection', (err) => {
  console.error('Yakalanmamış hata:', err);
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

console.log('🚀 Wp-to-Tgram köprüsü başlatılıyor…');

startWhatsApp().catch((err) => {
  console.error('Başlatma hatası:', err);
  process.exit(1);
});
