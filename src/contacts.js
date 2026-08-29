import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizeJid(jid) {
  if (!jid || typeof jid !== 'string') return null;
  try {
    return jidNormalizedUser(jid) || jid;
  } catch {
    return jid;
  }
}

function isGroupJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

function isBroadcastJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@broadcast');
}

function isPersonJid(jid) {
  return Boolean(jid) && !isGroupJid(jid) && !isBroadcastJid(jid);
}

function prettyPhone(jid) {
  const normalized = normalizeJid(jid);
  if (!normalized || normalized.endsWith('@lid')) return null;
  const user = normalized.split('@')[0];
  if (!/^\d{5,}$/.test(user)) return null;
  return `+${user}`;
}

function looksLikePhone(value) {
  return typeof value === 'string' && /^\+?\d{5,}$/.test(value.trim());
}

function mergeRecord(existing, incoming, source) {
  const incomingName = firstNonEmpty(incoming.name);
  const incomingNotify = firstNonEmpty(incoming.notify);
  const sameAsProfile = incomingName && incomingNotify && incomingName === incomingNotify;

  let name = firstNonEmpty(existing?.name);
  if (incomingName && !looksLikePhone(incomingName)) {
    if (source === 'contacts') {
      name = incomingName;
    } else if (!name && !sameAsProfile) {
      name = incomingName;
    }
  }

  return {
    id: incoming.id || existing?.id,
    lid: firstNonEmpty(incoming.lid, existing?.lid),
    name,
    notify: firstNonEmpty(incomingNotify, existing?.notify),
    verifiedName: firstNonEmpty(incoming.verifiedName, existing?.verifiedName),
  };
}

export async function createContactStore({ filePath, logger }) {
  const byId = new Map();
  const aliases = new Map();
  let saveTimer = null;
  let loaded = false;

  function canonicalId(jid) {
    const normalized = normalizeJid(jid);
    if (!normalized) return null;
    return aliases.get(normalized) || normalized;
  }

  function rememberAlias(from, to) {
    const source = normalizeJid(from);
    const target = normalizeJid(to);
    if (!source || !target || source === target) return;
    aliases.set(source, target);
  }

  function getRecord(jid) {
    const id = canonicalId(jid);
    return id ? byId.get(id) ?? null : null;
  }

  function upsertOne(incoming) {
    const rawId = normalizeJid(incoming?.id);
    if (!rawId || !isPersonJid(rawId)) return false;

    if (incoming.lid) rememberAlias(incoming.lid, rawId);

    const id = canonicalId(rawId);
    if (rawId !== id) rememberAlias(rawId, id);

    const existing = byId.get(id);
    const merged = mergeRecord(existing, { ...incoming, id }, incoming._source);
    byId.set(id, merged);
    if (merged.lid) rememberAlias(merged.lid, id);

    return JSON.stringify(existing ?? null) !== JSON.stringify(merged);
  }

  function scheduleSave() {
    if (!loaded) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persist().catch((err) => logger.warn({ err }, 'Kişi listesi kaydedilemedi'));
    }, 1000);
  }

  async function persist() {
    await mkdir(dirname(filePath), { recursive: true });
    const payload = JSON.stringify(
      {
        contacts: [...byId.values()],
        aliases: [...aliases.entries()],
      },
      null,
      0,
    );
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, payload, 'utf8');
    await rename(tmpPath, filePath);
  }

  async function load() {
    try {
      const raw = await readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      for (const [from, to] of data.aliases ?? []) {
        rememberAlias(from, to);
      }
      for (const contact of data.contacts ?? []) {
        upsertOne({ ...contact, _source: 'contacts' });
      }
      logger.info(
        { total: byId.size, named: [...byId.values()].filter((c) => c.name).length },
        'Kayıtlı kişiler yüklendi',
      );
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn({ err }, 'Kişi listesi okunamadı, boş başlıyor');
      }
    } finally {
      loaded = true;
    }
  }

  function upsert(contacts, source = 'contacts') {
    let changed = false;
    for (const contact of contacts ?? []) {
      if (upsertOne({ ...contact, _source: source })) changed = true;
    }
    if (changed) scheduleSave();
  }

  function stats() {
    const all = [...byId.values()];
    return {
      total: all.length,
      named: all.filter((c) => c.name).length,
    };
  }

  function alias(lid, jid) {
    const lidId = normalizeJid(lid);
    const pnId = normalizeJid(jid);
    if (!lidId || !pnId || lidId === pnId) return;

    rememberAlias(lidId, pnId);

    const lidRecord = byId.get(lidId);
    const pnRecord = byId.get(pnId);
    if (lidRecord || pnRecord) {
      const merged = mergeRecord(pnRecord, { ...lidRecord, id: pnId, lid: lidId });
      if (lidRecord) byId.delete(lidId);
      byId.set(pnId, merged);
    }

    scheduleSave();
  }

  function resolve(jids, pushName) {
    const candidates = [...new Set((jids ?? []).map(normalizeJid).filter(Boolean))];
    let contact = null;
    for (const jid of candidates) {
      const found = getRecord(jid);
      if (!found) continue;
      contact = found;
      if (found.name) break;
    }

    return (
      firstNonEmpty(
        contact?.name,
        contact?.verifiedName,
        contact?.notify,
        pushName,
        ...candidates.map(prettyPhone),
      ) ?? 'Bilinmeyen'
    );
  }

  await load();

  return { upsert, alias, resolve, stats };
}

export function bindContactEvents(sock, contactStore) {
  sock.ev.on('contacts.upsert', (contacts) => {
    contactStore.upsert(contacts, 'contacts');
  });

  sock.ev.on('contacts.update', (updates) => {
    contactStore.upsert(updates, 'contacts');
  });

  sock.ev.on('messaging-history.set', ({ contacts }) => {
    contactStore.upsert(contacts, 'history');
  });

  sock.ev.on('chats.phoneNumberShare', ({ lid, jid }) => {
    contactStore.alias(lid, jid);
  });
}

function asLidAndPn(a, b) {
  if (!a || !b) return null;
  const left = normalizeJid(a);
  const right = normalizeJid(b);
  if (!left || !right) return null;
  if (left.endsWith('@lid') && right.endsWith('@s.whatsapp.net')) return [left, right];
  if (right.endsWith('@lid') && left.endsWith('@s.whatsapp.net')) return [right, left];
  return null;
}

export function rememberSenderIds(contactStore, message) {
  const key = message.key ?? {};
  const pairs = [
    asLidAndPn(key.senderLid, key.senderPn),
    asLidAndPn(key.senderLid, key.remoteJidAlt),
    asLidAndPn(key.participant, key.participantAlt),
    asLidAndPn(key.remoteJid, key.remoteJidAlt),
    asLidAndPn(key.remoteJid, key.senderPn),
  ];

  for (const pair of pairs) {
    if (pair) contactStore.alias(pair[0], pair[1]);
  }

  const jid = normalizeJid(key.participant ?? key.remoteJid);
  if (jid && isPersonJid(jid) && message.pushName) {
    contactStore.upsert([{ id: jid, notify: message.pushName }], 'notify');
  }
}

export function senderJidsFromMessage(message) {
  const remoteJid = message.key.remoteJid;
  const isGroup = remoteJid?.endsWith('@g.us');

  if (isGroup) {
    return [
      message.key.participant,
      message.key.participantAlt,
      message.key.participantPn,
      message.key.senderPn,
      message.key.senderLid,
    ];
  }

  return [
    remoteJid,
    message.key.remoteJidAlt,
    message.key.senderPn,
    message.key.senderLid,
  ];
}
