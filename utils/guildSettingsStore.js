// ============================================================
//  Chaos RPG Bot — Guild Settings Store
//  Armazena configurações por guild (masterRoleId, etc.)
//  Fallback para process.env.MASTER_ROLE (nome) se nenhum ID configurado.
// ============================================================

const USE_LOCAL = process.env.USE_LOCAL_DATA === 'true';
const _cache = new Map(); // cache em memória por guildId

/**
 * Retorna o ID do cargo de Mestre configurado para a guild.
 * Retorna null se nenhum foi configurado.
 */
async function getMasterRoleId(guildId) {
  if (_cache.has(guildId)) return _cache.get(guildId);
  if (USE_LOCAL) return null;
  const { collections } = require('./db');
  const { guilds } = await collections();
  const doc = await guilds.findOne({ _id: guildId }, { projection: { masterRoleId: 1 } });
  const roleId = doc?.masterRoleId ?? null;
  _cache.set(guildId, roleId);
  return roleId;
}

/**
 * Define o ID do cargo de Mestre para a guild.
 * Atualiza o cache e persiste no MongoDB.
 */
async function setMasterRoleId(guildId, roleId) {
  _cache.set(guildId, roleId);
  if (USE_LOCAL) return;
  const { collections } = require('./db');
  const { guilds } = await collections();
  await guilds.updateOne({ _id: guildId }, { $set: { masterRoleId: roleId } }, { upsert: true });
}

module.exports = { getMasterRoleId, setMasterRoleId };
