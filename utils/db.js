// ============================================================
//  Chaos RPG Bot — MongoDB Client
//  Banco único "chaos-rpg", documentos separados por guildId.
//  Não é carregado quando USE_LOCAL_DATA=true.
// ============================================================

const { MongoClient } = require('mongodb');

if (!process.env.MONGODB_URI) {
  console.error('[Chaos RPG] MONGODB_URI não definida no .env. Encerrando.');
  process.exit(1);
}

const client  = new MongoClient(process.env.MONGODB_URI);
let connected = false;
let _db       = null;

const DB_NAME = 'chaos-rpg';

async function connect() {
  if (!connected) {
    await client.connect();
    connected = true;
    _db = client.db(DB_NAME);
    console.log(`[Chaos RPG] MongoDB conectado (banco: ${DB_NAME}).`);
  }
}

/**
 * Retorna as três coleções do bot.
 *
 * Separação por guild via campo guildId (sessions) ou _id composto (maps, tags):
 *   sessions → _id = guildId
 *   maps     → _id = "<guildId>:<mapId>"
 *   tags     → _id = "<guildId>:<tagName>"
 */
async function collections() {
  await connect();
  return {
    guilds:           _db.collection('guilds'),
    sessions:         _db.collection('sessions'),
    rpg_sessions:     _db.collection('rpg_sessions'),
    channel_sessions: _db.collection('channel_sessions'),
    maps:             _db.collection('maps'),
    tags:             _db.collection('tags'),
    characters:       _db.collection('characters'),
    prefixes:         _db.collection('prefixes'),
  };
}

async function close() {
  if (connected) {
    await client.close();
    connected = false;
  }
}

module.exports = { collections, close };
