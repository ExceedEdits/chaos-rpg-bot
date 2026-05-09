// ============================================================
//  Chaos RPG Bot — Initiative Store
//  Persiste order/round/current dentro da sessão RPG ativa.
// ============================================================

const rpgStore = require('./rpgSessionStore');

const EMPTY = { active: false, round: 0, current: 0, order: [] };

async function _resolve(guildId, channelId) {
  const resolved = await rpgStore.resolveSession(guildId, channelId);
  return resolved ?? null;
}

async function load(guildId, channelId) {
  const resolved = await _resolve(guildId, channelId);
  if (!resolved) return { ...EMPTY };
  return resolved.session.combat ?? { ...EMPTY };
}

async function save(guildId, channelId, combat) {
  const resolved = await _resolve(guildId, channelId);
  if (!resolved) return;
  const { session, sessionId } = resolved;
  session.combat = combat;
  await rpgStore.saveSession(guildId, sessionId, session);
}

async function clear(guildId, channelId) {
  await save(guildId, channelId, { ...EMPTY });
}

module.exports = { load, save, clear };
