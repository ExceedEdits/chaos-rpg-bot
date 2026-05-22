// ============================================================
//  Chaos RPG Bot — Guild Settings Store
//  Armazena configurações por guild (masterRoleId, diceListener, etc.)
//  Um único documento por guild na coleção "guilds" do MongoDB.
//  Cache em memória evita leituras redundantes ao DB.
// ============================================================

const USE_LOCAL = process.env.USE_LOCAL_DATA === 'true';

// Cache unificado: guildId → { masterRoleId, diceListenerEnabled, ... }
const _cache = new Map();

// ── Helpers internos ──────────────────────────────────────────

/** Retorna o documento de settings do cache ou do MongoDB. */
async function _loadSettings(guildId) {
  if (_cache.has(guildId)) return _cache.get(guildId);
  if (USE_LOCAL) {
    const defaults = { masterRoleId: null, diceListenerEnabled: true };
    _cache.set(guildId, defaults);
    return defaults;
  }
  const { collections } = require('./db');
  const { guilds } = await collections();
  const doc = await guilds.findOne({ _id: guildId }) ?? {};
  const settings = {
    masterRoleId:       doc.masterRoleId       ?? null,
    diceListenerEnabled: doc.diceListenerEnabled ?? true,
  };
  _cache.set(guildId, settings);
  return settings;
}

/** Persiste um campo específico no MongoDB e atualiza o cache. */
async function _saveField(guildId, field, value) {
  const settings = _cache.get(guildId) ?? {};
  settings[field] = value;
  _cache.set(guildId, settings);
  if (USE_LOCAL) return;
  const { collections } = require('./db');
  const { guilds } = await collections();
  await guilds.updateOne(
    { _id: guildId },
    { $set: { [field]: value } },
    { upsert: true },
  );
}

// ── Cargo de Mestre ───────────────────────────────────────────

/**
 * Retorna o ID do cargo de Mestre configurado para a guild.
 * Retorna null se nenhum foi configurado.
 */
async function getMasterRoleId(guildId) {
  return (await _loadSettings(guildId)).masterRoleId;
}

/**
 * Define o ID do cargo de Mestre para a guild.
 */
async function setMasterRoleId(guildId, roleId) {
  await _saveField(guildId, 'masterRoleId', roleId);
}

// ── Listener de dados em mensagens ───────────────────────────

/**
 * Retorna se o listener de rolagem de dados em mensagens está ativo.
 * Padrão: true (ativo).
 */
async function getDiceListener(guildId) {
  return (await _loadSettings(guildId)).diceListenerEnabled;
}

/**
 * Ativa ou desativa o listener de rolagem de dados em mensagens.
 */
async function setDiceListener(guildId, enabled) {
  await _saveField(guildId, 'diceListenerEnabled', enabled);
}

module.exports = { getMasterRoleId, setMasterRoleId, getDiceListener, setDiceListener };
