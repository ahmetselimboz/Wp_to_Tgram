import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { config } from './config.js';
import { formatNotification, formatConnectionStatus } from './formatter.js';
import { sendTelegramMessage, sendTelegramPhoto } from './telegram.js';

const logger = pino({ level: config.logLevel });

async function saveQrCode(qr) {
  await mkdir(config.dataDir, { recursive: true });
  const pngPath = join(config.dataDir, 'qr.png');
  const txtPath = join(config.dataDir, 'qr.txt');

  await QRCode.toFile(pngPath, qr, { width: 512 });
  await writeFile(txtPath, qr, 'utf8');

  logger.info({ pngPath, txtPath }, 'QR kodu kaydedildi — WhatsApp > Bağlı Cihazlar > Cihaz Bağla');
}

async function resolveSenderName(sock, message) {
  const jid = message.key.participant ?? message.key.remoteJid;
  if (!jid) return message.pushName ?? 'Bilinmeyen';

  try {
    const contact = await sock.onWhatsApp(jid);
    if (contact?.[0]?.exists) {
      return message.pushName ?? jid.split('@')[0];
    }
  } catch {
    // pushName yeterli
  }

  return message.pushName ?? jid.split('@')[0];
}

async function resolveGroupName(sock, groupJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    return metadata.subject ?? 'Grup';
  } catch {
    return 'Grup';
  }
}

function shouldSkipMessage(message) {
  if (!message.message) return true;
  if (message.key.fromMe) return true;

  const statusBroadcast = message.key.remoteJid === 'status@broadcast';
  if (statusBroadcast) return true;

  return false;
}

async function handleIncomingMessage(sock, message) {
  if (shouldSkipMessage(message)) return;

  const remoteJid = message.key.remoteJid;
  const isGroup = remoteJid.endsWith('@g.us');

  const senderName = await resolveSenderName(sock, message);
  const groupName = isGroup ? await resolveGroupName(sock, remoteJid) : null;

  const text = formatNotification(message, { senderName, groupName, isGroup });
  await sendTelegramMessage(text);

  logger.info(
    { from: senderName, group: groupName, jid: remoteJid },
    'Mesaj Telegram\'a iletildi',
  );
}

export async function startWhatsApp() {
  await mkdir(config.authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();

  let sock = null;

  const connect = async () => {
    sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        await saveQrCode(qr);
        try {
          await sendTelegramPhoto(
            join(config.dataDir, 'qr.png'),
            formatConnectionStatus('qr'),
          );
        } catch (err) {
          logger.warn({ err }, 'QR kodu Telegram\'a gönderilemedi');
        }
      }

      if (connection === 'open') {
        logger.info('WhatsApp bağlantısı kuruldu');
        try {
          await sendTelegramMessage(formatConnectionStatus('connected'));
        } catch (err) {
          logger.warn({ err }, 'Bağlantı bildirimi gönderilemedi');
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.warn({ statusCode, shouldReconnect }, 'WhatsApp bağlantısı kapandı');

        if (statusCode === DisconnectReason.loggedOut) {
          logger.error('Oturum sonlandı — auth dizinini temizleyip yeniden QR tarayın');
          try {
            await sendTelegramMessage(
              '❌ WhatsApp oturumu kapandı\\. VPS\\\'te `data/auth` klasörünü silip konteyneri yeniden başlatın\\.',
            );
          } catch {
            // ignore
          }
          return;
        }

        if (shouldReconnect) {
          setTimeout(connect, 3000);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        try {
          await handleIncomingMessage(sock, message);
        } catch (err) {
          logger.error({ err, id: message.key.id }, 'Mesaj işlenemedi');
        }
      }
    });
  };

  await connect();
}
