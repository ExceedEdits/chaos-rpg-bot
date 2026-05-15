// ============================================================
//  Chaos RPG Bot — Map Store
//  Produção: MongoDB (banco único, separado por guildId)
//  Teste local: data/maps/<id>.json
// ============================================================

const fs   = require('fs');
const path = require('path');

const USE_LOCAL     = process.env.USE_LOCAL_DATA === 'true';
const MAPS_DIR      = path.join(__dirname, '../data/maps');

// ── Local (teste) ─────────────────────────────────────────────

function loadLocal(mapId) {
  const filePath = path.join(MAPS_DIR, `${mapId}.json`);
  if (!fs.existsSync(filePath))
    throw new Error(`Mapa "${mapId}" não encontrado em data/maps/.`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveLocal(mapId, mapData) {
  const filePath = path.join(MAPS_DIR, `${mapId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(mapData, null, 2), 'utf8');
}

// ── MongoDB (produção) ────────────────────────────────────────

// _id composto evita colisão entre guilds que usam o mesmo mapId
function docId(guildId, mapId) { return `${guildId}:${mapId}`; }

async function loadMongo(guildId, mapId) {
  const { collections } = require('./db');
  const { maps } = await collections();
  const doc = await maps.findOne({ _id: docId(guildId, mapId) });

  if (doc) {
    const { _id, ...data } = doc;
    return data;
  }

  // Importa do template local na primeira vez
  const templatePath = path.join(MAPS_DIR, `${mapId}.json`);
  if (!fs.existsSync(templatePath))
    throw new Error(`Mapa "${mapId}" não encontrado no banco nem nos templates.`);

  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  await maps.insertOne({ _id: docId(guildId, mapId), guildId, ...template });
  return template;
}

async function saveMongo(guildId, mapId, mapData) {
  const { collections } = require('./db');
  const { maps } = await collections();
  await maps.replaceOne(
    { _id: docId(guildId, mapId) },
    { _id: docId(guildId, mapId), guildId, ...mapData },
    { upsert: true },
  );
}

// ── Local: listar ─────────────────────────────────────────────

function listLocal() {
  if (!fs.existsSync(MAPS_DIR)) return [];
  return fs.readdirSync(MAPS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, f), 'utf8'));
        return { id: data.id ?? f.replace('.json', ''), name: data.name ?? f.replace('.json', '') };
      } catch { return null; }
    })
    .filter(Boolean);
}

async function listMongo(guildId) {
  const { collections } = require('./db');
  const { maps } = await collections();
  const docs = await maps.find({ guildId }).toArray();
  return docs.map(d => ({ id: d.id, name: d.name }));
}

// ── Local: remover ────────────────────────────────────────────

function removeLocal(mapId) {
  const filePath = path.join(MAPS_DIR, `${mapId}.json`);
  if (!fs.existsSync(filePath))
    throw new Error(`Mapa "${mapId}" não encontrado.`);
  fs.unlinkSync(filePath);
}

async function removeMongo(guildId, mapId) {
  const { collections } = require('./db');
  const { maps } = await collections();
  const result = await maps.deleteOne({ _id: docId(guildId, mapId) });
  if (result.deletedCount === 0)
    throw new Error(`Mapa "${mapId}" não encontrado.`);
}

// ── Interface unificada ───────────────────────────────────────

async function load(guildId, mapId) {
  return USE_LOCAL ? loadLocal(mapId) : loadMongo(guildId, mapId);
}

async function save(guildId, mapId, mapData) {
  return USE_LOCAL ? saveLocal(mapId, mapData) : saveMongo(guildId, mapId, mapData);
}

async function list(guildId) {
  return USE_LOCAL ? listLocal() : listMongo(guildId);
}

async function remove(guildId, mapId) {
  return USE_LOCAL ? removeLocal(mapId) : removeMongo(guildId, mapId);
}

module.exports = { load, save, list, remove };
