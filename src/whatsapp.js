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
import {
  bindContactEvents,
  createContactStore,
  rememberSenderIds,
  senderJidsFromMessage,
} from './contacts.js';
import { formatNotification, formatConnectionStatus } from './formatter.js';
import { createNotifyGate, isReadStatus } from './notify-gate.js';
import { sendTelegramMessage, sendTelegramPhoto } from './telegram.js';

const logger = pino({ level: config.logLevel });

let activeSock = null;
let reconnectTimer = null;
let shuttingDown = false;

async function saveQrCode(qr) {
  await mkdir(config.dataDir, { recursive: true });
  const pngPath = join(config.dataDir, 'qr.png');
  const txtPath = join(config.dataDir, 'qr.txt');

  await QRCode.toFile(pngPath, qr, { width: 512 });
  await writeFile(txtPath, qr, 'utf8');

  logger.info({ pngPath, txtPath }, 'QR kodu kaydedildi — WhatsApp > Bağlı Cihazlar > Cihaz Bağla');
}

function resolveSenderName(contactStore, message) {
  return contactStore.resolve(senderJidsFromMessage(message), message.pushName);
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

async function handleIncomingMessage(sock, contactStore, notifyGate, message) {
  rememberSenderIds(contactStore, message);
  if (shouldSkipMessage(message)) return;

  const remoteJid = message.key.remoteJid;
  const isGroup = remoteJid.endsWith('@g.us');

  const senderName = resolveSenderName(contactStore, message);
  const groupName = isGroup ? await resolveGroupName(sock, remoteJid) : null;

  const text = formatNotification(message, { senderName, groupName, isGroup });
  notifyGate.schedule(message, text);

  logger.info(
    { from: senderName, group: groupName, jid: remoteJid, id: message.key.id },
    'Mesaj bildirimi kuyruğa alındı',
  );
}

export async function stopWhatsApp() {
  shuttingDown = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const sock = activeSock;
  activeSock = null;
  if (!sock) return;

  await new Promise((resolve) => {
    const done = () => resolve();
    const timer = setTimeout(done, 2000);
    try {
      sock.end(undefined);
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

export async function startWhatsApp() {
  shuttingDown = false;
  await mkdir(config.authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();
  const contactStore = await createContactStore({
    filePath: join(config.dataDir, 'contacts.json'),
    logger,
  });
  const notifyGate = createNotifyGate({
    delayMs: Number.isFinite(config.notifyDelayMs) ? config.notifyDelayMs : 15_000,
    logger,
    send: sendTelegramMessage,
  });

  const connect = async () => {
    if (shuttingDown) return;

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    activeSock = sock;

    sock.ev.on('creds.update', saveCreds);
    bindContactEvents(sock, contactStore);

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
        logger.info({ contacts: contactStore.stats() }, 'WhatsApp bağlantısı kuruldu');
        setTimeout(() => {
          logger.info({ contacts: contactStore.stats() }, 'Kişi senkronu');
        }, 8000);
        try {
          await sendTelegramMessage(formatConnectionStatus('connected'));
        } catch (err) {
          logger.warn({ err }, 'Bağlantı bildirimi gönderilemedi');
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = !shuttingDown && statusCode !== DisconnectReason.loggedOut;

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
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        if (message.key.fromMe && message.key.remoteJid) {
          notifyGate.cancelChat(message.key.remoteJid);
        }

        try {
          await handleIncomingMessage(sock, contactStore, notifyGate, message);
        } catch (err) {
          logger.error({ err, id: message.key.id }, 'Mesaj işlenemedi');
        }
      }
    });

    sock.ev.on('messages.update', (updates) => {
      for (const { key, update } of updates ?? []) {
        if (isReadStatus(update?.status)) {
          notifyGate.cancelMessage(key);
        }
      }
    });

    sock.ev.on('chats.update', (updates) => {
      for (const chat of updates ?? []) {
        if (typeof chat.unreadCount === 'number' && chat.unreadCount === 0) {
          notifyGate.cancelChat(chat.id);
        }
      }
    });
  };

  await connect();
}
