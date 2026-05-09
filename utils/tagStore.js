// ============================================================
//  Chaos RPG Bot — Tag Store
//  Produção: MongoDB (banco único, separado por guildId)
//  Teste local: data/tags.json
// ============================================================

const fs   = require('fs');
const path = require('path');

const USE_LOCAL  = process.env.USE_LOCAL_DATA === 'true';
const LOCAL_PATH = path.join(__dirname, '../data/tags.json');

// ── Local (teste) ─────────────────────────────────────────────

function readLocal() {
  if (!fs.existsSync(LOCAL_PATH)) {
    fs.writeFileSync(LOCAL_PATH, JSON.stringify({ tags: {} }, null, 2));
    return {};
  }
  return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')).tags ?? {};
}

function writeLocal(tags) {
  fs.writeFileSync(LOCAL_PATH, JSON.stringify({ tags }, null, 2), 'utf8');
}

// ── MongoDB (produção) ────────────────────────────────────────

function docId(guildId, name) { return `${guildId}:${name.toLowerCase()}`; }

async function getAllMongo(guildId) {
  const { collections } = require('./db');
  const { tags } = await collections();
  const docs = await tags.find({ guildId }).toArray();
  return Object.fromEntries(docs.map(({ _id, guildId: _g, ...rest }) => [rest.name, rest]));
}

async function getMongo(guildId, name) {
  const { collections } = require('./db');
  const { tags } = await collections();
  const doc = await tags.findOne({ _id: docId(guildId, name) });
  if (!doc) return null;
  const { _id, guildId: _g, ...data } = doc;
  return data;
}

async function upsertMongo(guildId, tagDef) {
  const { collections } = require('./db');
  const { tags } = await collections();
  const id = docId(guildId, tagDef.name);
  await tags.replaceOne(
    { _id: id },
    { _id: id, guildId, ...tagDef },
    { upsert: true },
  );
}

async function removeMongo(guildId, name) {
  const { collections } = require('./db');
  const { tags } = await collections();
  const result = await tags.deleteOne({ _id: docId(guildId, name) });
  return result.deletedCount > 0;
}

// ── Interface unificada ───────────────────────────────────────

async function getAll(guildId) {
  return USE_LOCAL ? readLocal() : getAllMongo(guildId);
}

async function get(guildId, name) {
  if (USE_LOCAL) return readLocal()[name.toLowerCase()] ?? null;
  return getMongo(guildId, name);
}

async function upsert(guildId, tagDef) {
  if (USE_LOCAL) {
    const tags = readLocal();
    tags[tagDef.name.toLowerCase()] = tagDef;
    writeLocal(tags);
    return;
  }
  return upsertMongo(guildId, tagDef);
}

async function remove(guildId, name) {
  if (USE_LOCAL) {
    const tags = readLocal();
    const key  = name.toLowerCase();
    if (!tags[key]) return false;
    delete tags[key];
    writeLocal(tags);
    return true;
  }
  return removeMongo(guildId, name);
}

module.exports = { getAll, get, upsert, remove };
