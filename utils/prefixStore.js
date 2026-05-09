// ============================================================
//  Chaos RPG Bot — Prefix Store
//  Persiste o prefixo de comandos por servidor.
//  Padrão: "!"
// ============================================================

const fs   = require('fs');
const path = require('path');

const USE_LOCAL    = process.env.USE_LOCAL_DATA === 'true';
const LOCAL_PATH   = path.join(__dirname, '../data/prefixes.json');
const DEFAULT_PREFIX = '!';

// ── Local ─────────────────────────────────────────────────────

function readLocal() {
  if (!fs.existsSync(LOCAL_PATH))
    fs.writeFileSync(LOCAL_PATH, JSON.stringify({}, null, 2));
  try {
    return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeLocal(data) {
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ── MongoDB ───────────────────────────────────────────────────

async function getPrefixMongo(guildId) {
  const { collections } = require('./db');
  const { prefixes } = await collections();
  const doc = await prefixes.findOne({ _id: guildId });
  return doc?.prefix ?? DEFAULT_PREFIX;
}

async function setPrefixMongo(guildId, prefix) {
  const { collections } = require('./db');
  const { prefixes } = await collections();
  await prefixes.replaceOne({ _id: guildId }, { _id: guildId, prefix }, { upsert: true });
}

// ── Interface unificada ───────────────────────────────────────

async function getPrefix(guildId) {
  if (USE_LOCAL) {
    return readLocal()[guildId] ?? DEFAULT_PREFIX;
  }
  return getPrefixMongo(guildId);
}

async function setPrefix(guildId, prefix) {
  if (USE_LOCAL) {
    const data = readLocal();
    data[guildId] = prefix;
    writeLocal(data);
    return;
  }
  return setPrefixMongo(guildId, prefix);
}

module.exports = { getPrefix, setPrefix, DEFAULT_PREFIX };
