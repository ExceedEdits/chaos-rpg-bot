// ============================================================
//  Chaos RPG Bot — Guild Store
//  Coleção "guilds": registro de todos os servidores que usam
//  o bot. Alimentada automaticamente no primeiro uso.
// ============================================================

const USE_LOCAL = process.env.USE_LOCAL_DATA === 'true';

// ── MongoDB ───────────────────────────────────────────────────

async function registerMongo(guild) {
  const { collections } = require('./db');
  const { guilds } = await collections();

  await guilds.updateOne(
    { _id: guild.id },
    {
      $setOnInsert: { joinedAt: new Date().toISOString() },
      $set: {
        name:      guild.name,
        lastSeen:  new Date().toISOString(),
      },
    },
    { upsert: true },
  );
}

async function unregisterMongo(guildId) {
  const { collections } = require('./db');
  const { guilds } = await collections();
  await guilds.updateOne(
    { _id: guildId },
    { $set: { active: false, leftAt: new Date().toISOString() } },
  );
}

async function listMongo() {
  const { collections } = require('./db');
  const { guilds } = await collections();
  return guilds.find({}).toArray();
}

// ── Interface unificada ───────────────────────────────────────

/**
 * Registra ou atualiza um servidor.
 * Chamado automaticamente no guildCreate e no primeiro comando.
 *
 * @param {{ id: string, name: string }} guild
 */
async function register(guild) {
  if (USE_LOCAL) return; // sem efeito no modo local
  return registerMongo(guild);
}

/**
 * Marca um servidor como inativo (bot removido/banido).
 * Não apaga os dados — preserva sessão, mapas e tags.
 */
async function unregister(guildId) {
  if (USE_LOCAL) return;
  return unregisterMongo(guildId);
}

/**
 * Lista todos os servidores registrados.
 */
async function list() {
  if (USE_LOCAL) return [];
  return listMongo();
}

module.exports = { register, unregister, list };
