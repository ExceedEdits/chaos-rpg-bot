// ============================================================
//  Chaos RPG Bot — Session Store
//  Produção: MongoDB (banco único, separado por guildId)
//  Teste local: data/session.json
// ============================================================

const fs   = require('fs');
const path = require('path');

const USE_LOCAL   = process.env.USE_LOCAL_DATA === 'true';
const LOCAL_PATH  = path.join(__dirname, '../data/session.json');

const DEFAULT_SESSION = {
  activeMap:    'mar_profundo',
  mapMessageId: null,
  channelId:    null,
  turnEffects:  [],
  characters:   {},
  npcs:         {},
  enemies:      [],
  items:        {},
};

// ── Local (teste) ─────────────────────────────────────────────

function loadLocal() {
  if (!fs.existsSync(LOCAL_PATH)) {
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(DEFAULT_SESSION, null, 2));
    return { ...DEFAULT_SESSION };
  }
  return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
}

function saveLocal(sessionData) {
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(sessionData, null, 2), 'utf8');
}

// ── MongoDB (produção) ────────────────────────────────────────

async function loadMongo(guildId) {
  const { collections } = require('./db');
  const { sessions } = await collections();
  const doc = await sessions.findOne({ _id: guildId });
  if (!doc) {
    const fresh = { _id: guildId, ...DEFAULT_SESSION };
    await sessions.insertOne(fresh);
    // Garante registro na coleção guilds mesmo sem o evento guildCreate
    const { register } = require('./guildStore');
    await register({ id: guildId, name: 'unknown' }).catch(() => {});
    return { ...DEFAULT_SESSION };
  }
  const { _id, ...data } = doc;
  return data;
}

async function saveMongo(guildId, sessionData) {
  const { collections } = require('./db');
  const { sessions } = await collections();
  await sessions.replaceOne(
    { _id: guildId },
    { _id: guildId, ...sessionData },
    { upsert: true },
  );
}

// ── Interface unificada ───────────────────────────────────────

async function load(guildId) {
  return USE_LOCAL ? loadLocal() : loadMongo(guildId);
}

async function save(guildId, sessionData) {
  return USE_LOCAL ? saveLocal(sessionData) : saveMongo(guildId, sessionData);
}

module.exports = { load, save };
