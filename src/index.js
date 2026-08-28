import { startWhatsApp } from './whatsapp.js';

process.on('unhandledRejection', (err) => {
  console.error('Yakalanmamış hata:', err);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM alındı, kapanılıyor…');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT alındı, kapanılıyor…');
  process.exit(0);
});

console.log('🚀 Wp-to-Tgram köprüsü başlatılıyor…');

startWhatsApp().catch((err) => {
  console.error('Başlatma hatası:', err);
  process.exit(1);
});
