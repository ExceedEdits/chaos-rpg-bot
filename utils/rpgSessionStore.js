// ============================================================
//  Chaos RPG Bot — RPG Session Store
//  Múltiplas sessões por servidor, cada canal vinculado a uma.
//
//  Coleções:
//    rpg_sessions   → { _id: "guildId:sessionId", guildId, sessionId, ...config }
//    channel_sessions → { _id: channelId, guildId, sessionId }
//
//  Configurações de sessão (settings):
//    showStatusInTracker:  boolean  — exibe status ativos no tracker
//    showEffectsApplying:  boolean  — exibe efeitos aplicando no tracker
//    decrementMode:        'turn'|'round' — decrementa status por turno ou rodada
// ============================================================

const fs   = require('fs');
const path = require('path');

const USE_LOCAL         = process.env.USE_LOCAL_DATA === 'true';
const LOCAL_SESSIONS    = path.join(__dirname, '../data/rpg_sessions.json');
const LOCAL_CHANNELS    = path.join(__dirname, '../data/channel_sessions.json');

const DEFAULT_SETTINGS = {
  showStatusInTracker:  true,
  showEffectsApplying:  true,
  decrementMode:        'round', // 'turn' ou 'round'
};

const DEFAULT_SESSION = {
  activeMap:    'mar_profundo',
  mapMessageId: null,
  channelId:    null,
  turnEffects:  [],
  characters:   {},
  npcs:         {},
  enemies:      [],
  items:        {},
  combat:       { active: false, round: 0, current: 0, order: [] },
  settings:     { ...DEFAULT_SETTINGS },
};

// ── Helpers locais ────────────────────────────────────────────

function readLocalSessions() {
  if (!fs.existsSync(LOCAL_SESSIONS))
    fs.writeFileSync(LOCAL_SESSIONS, JSON.stringify({ sessions: [] }, null, 2));
  return JSON.parse(fs.readFileSync(LOCAL_SESSIONS, 'utf8')).sessions ?? [];
}

function writeLocalSessions(list) {
  fs.writeFileSync(LOCAL_SESSIONS, JSON.stringify({ sessions: list }, null, 2));
}

function readLocalChannels() {
  if (!fs.existsSync(LOCAL_CHANNELS))
    fs.writeFileSync(LOCAL_CHANNELS, JSON.stringify({ channels: [] }, null, 2));
  return JSON.parse(fs.readFileSync(LOCAL_CHANNELS, 'utf8')).channels ?? [];
}

function writeLocalChannels(list) {
  fs.writeFileSync(LOCAL_CHANNELS, JSON.stringify({ channels: list }, null, 2));
}

function docId(guildId, sessionId) { return `${guildId}:${sessionId}`; }

// ── MongoDB helpers ───────────────────────────────────────────

async function col() {
  const { collections } = require('./db');
  const c = await collections();
  return { sessions: c.rpg_sessions, channels: c.channel_sessions };
}

// ── CRUD de sessões ───────────────────────────────────────────

/** Lista todas as sessões de um servidor */
async function listSessions(guildId) {
  if (USE_LOCAL) {
    return readLocalSessions().filter(s => s.guildId === guildId);
  }
  const { sessions } = await col();
  return (await sessions.find({ guildId }).toArray())
    .map(({ _id, ...rest }) => rest);
}

/** Cria uma nova sessão */
async function createSession(guildId, sessionId) {
  const id  = sessionId.toLowerCase().replace(/\s+/g, '-');
  const doc = { guildId, sessionId: id, ...DEFAULT_SESSION };

  if (USE_LOCAL) {
    const list = readLocalSessions();
    if (list.find(s => s.guildId === guildId && s.sessionId === id))
      throw new Error(`Sessão "${id}" já existe neste servidor.`);
    list.push(doc);
    writeLocalSessions(list);
    return doc;
  }

  const { sessions } = await col();
  const exists = await sessions.findOne({ _id: docId(guildId, id) });
  if (exists) throw new Error(`Sessão "${id}" já existe neste servidor.`);
  await sessions.insertOne({ _id: docId(guildId, id), ...doc });
  return doc;
}

/** Carrega uma sessão pelo id */
async function loadSession(guildId, sessionId) {
  if (USE_LOCAL) {
    const s = readLocalSessions().find(
      s => s.guildId === guildId && s.sessionId === sessionId
    );
    return s ?? null;
  }
  const { sessions } = await col();
  const doc = await sessions.findOne({ _id: docId(guildId, sessionId) });
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

/** Salva (substitui) uma sessão */
async function saveSession(guildId, sessionId, data) {
  if (USE_LOCAL) {
    const list = readLocalSessions();
    const idx  = list.findIndex(
      s => s.guildId === guildId && s.sessionId === sessionId
    );
    const doc = { guildId, sessionId, ...data };
    if (idx >= 0) list[idx] = doc; else list.push(doc);
    writeLocalSessions(list);
    return;
  }
  const { sessions } = await col();
  const id = docId(guildId, sessionId);
  await sessions.replaceOne({ _id: id }, { _id: id, guildId, sessionId, ...data }, { upsert: true });
}

/** Remove uma sessão */
async function deleteSession(guildId, sessionId) {
  if (USE_LOCAL) {
    const list = readLocalSessions().filter(
      s => !(s.guildId === guildId && s.sessionId === sessionId)
    );
    writeLocalSessions(list);
    return;
  }
  const { sessions } = await col();
  await sessions.deleteOne({ _id: docId(guildId, sessionId) });
}

// ── Vínculo canal → sessão ────────────────────────────────────

/** Retorna o sessionId vinculado a um canal, ou null */
async function getChannelSession(channelId) {
  if (USE_LOCAL) {
    return readLocalChannels().find(c => c.channelId === channelId)?.sessionId ?? null;
  }
  const { channels } = await col();
  const doc = await channels.findOne({ _id: channelId });
  return doc?.sessionId ?? null;
}

/** Vincula um canal a uma sessão */
async function setChannelSession(guildId, channelId, sessionId) {
  if (USE_LOCAL) {
    const list = readLocalChannels().filter(c => c.channelId !== channelId);
    list.push({ channelId, guildId, sessionId });
    writeLocalChannels(list);
    return;
  }
  const { channels } = await col();
  await channels.replaceOne(
    { _id: channelId },
    { _id: channelId, guildId, sessionId },
    { upsert: true }
  );
}

/** Remove o vínculo de um canal */
async function clearChannelSession(channelId) {
  if (USE_LOCAL) {
    writeLocalChannels(readLocalChannels().filter(c => c.channelId !== channelId));
    return;
  }
  const { channels } = await col();
  await channels.deleteOne({ _id: channelId });
}

/**
 * Resolve a sessão ativa para uma interação.
 * Retorna { session, sessionId } ou null se não houver sessão vinculada.
 */
async function resolveSession(guildId, channelId) {
  const sessionId = await getChannelSession(channelId);
  if (!sessionId) return null;
  const session = await loadSession(guildId, sessionId);
  return session ? { session, sessionId } : null;
}

module.exports = {
  DEFAULT_SETTINGS,
  listSessions, createSession, loadSession, saveSession, deleteSession,
  getChannelSession, setChannelSession, clearChannelSession, resolveSession,
};
