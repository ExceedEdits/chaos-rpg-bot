// ============================================================
//  Chaos RPG Bot — Character Store
//  Produção: MongoDB (coleção "characters", separada por guildId)
//  Teste local: data/characters.json
//
//  Estrutura de um personagem:
//  {
//    id:            string        — slug único (nome lowercase sem espaços)
//    name:          string        — nome de exibição
//    emoji:         string|null   — emoji associado (totalmente opcional)
//    discordId:     string|null   — ID do jogador no Discord
//    team:          string|null   — emoji/cor do time (ex: 🟢, 🔴)
//    hp:            number        — HP atual
//    hpMax:         number        — HP máximo
//    shield:        number        — escudo atual (começa em 0)
//    shieldMax:     number        — escudo máximo configurável pelo Mestre
//    salvaguarda:   boolean       — true = escudo bloqueia excedente
//    critThreshold: number        — aviso quando hp <= N
//    overheal:      'cap'|'shield'
//    statuses:      Status[]
//  }
//
//  Personagem ativo por sessão:
//  Armazenado em rpg_sessions[sessionId].activeChars[discordId] = charId
// ============================================================

const fs   = require('fs');
const path = require('path');

const USE_LOCAL  = process.env.USE_LOCAL_DATA === 'true';
const LOCAL_PATH = path.join(__dirname, '../data/characters.json');

function toId(name) {
  return name.toLowerCase().replace(/\s+/g, '_');
}

// ── Local ─────────────────────────────────────────────────────

function readLocal() {
  if (!fs.existsSync(LOCAL_PATH)) {
    fs.writeFileSync(LOCAL_PATH, JSON.stringify({ characters: [] }, null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')).characters ?? [];
}

function writeLocal(list) {
  fs.writeFileSync(LOCAL_PATH, JSON.stringify({ characters: list }, null, 2), 'utf8');
}

// ── MongoDB ───────────────────────────────────────────────────

async function col() {
  const { collections } = require('./db');
  return (await collections()).characters;
}

// ── Interface principal ───────────────────────────────────────

/** Lista todos os personagens de uma guild */
async function getAll(guildId) {
  if (USE_LOCAL) return readLocal();
  return (await col()).find({ guildId }).toArray()
    .then(docs => docs.map(({ _id, guildId: _g, ...rest }) => ({ id: _id, ...rest })));
}

/** Lista todos os personagens de um jogador específico */
async function getByPlayer(guildId, discordId) {
  const all = await getAll(guildId);
  return all.filter(c => c.discordId === discordId);
}

/**
 * Busca por id, nome parcial, emoji ou discordId.
 * Se discordId bater e o jogador tiver personagem ativo na sessão,
 * retorna o ativo em vez do primeiro encontrado.
 */
async function find(guildId, query, activeChars = {}) {
  const all = await getAll(guildId);
  const q   = query.trim().toLowerCase().replace(/^<@!?/, '').replace(/>$/, '');

  // Busca por discordId (mention ou id numérico puro)
  if (/^\d+$/.test(q)) {
    const activeId = activeChars[q];
    if (activeId) {
      const active = all.find(c => c.id === activeId);
      if (active) return active;
    }
    return all.find(c => c.discordId === q) ?? null;
  }

  return all.find(c =>
    c.id === toId(q) ||
    c.name.toLowerCase().includes(q) ||
    c.emoji === query.trim()
  ) ?? null;
}

/** Cria ou substitui um personagem */
async function upsert(guildId, char) {
  char.id = toId(char.name);
  if (USE_LOCAL) {
    const list = readLocal();
    const idx  = list.findIndex(c => c.id === char.id);
    if (idx >= 0) list[idx] = char; else list.push(char);
    writeLocal(list);
    return char;
  }
  const { _id, ...rest } = char;
  await (await col()).replaceOne(
    { _id: char.id, guildId },
    { _id: char.id, guildId, ...rest },
    { upsert: true },
  );
  return char;
}

/** Remove um personagem pelo id */
async function remove(guildId, id) {
  if (USE_LOCAL) {
    const list = readLocal();
    const next = list.filter(c => c.id !== id);
    if (next.length === list.length) return false;
    writeLocal(next);
    return true;
  }
  const res = await (await col()).deleteOne({ _id: id, guildId });
  return res.deletedCount > 0;
}

// ── Personagem ativo por sessão ───────────────────────────────
//
// activeChars fica dentro da sessão RPG:
//   session.activeChars[discordId] = charId

/**
 * Retorna o personagem ativo de um jogador na sessão.
 * Se não tiver ativo definido, retorna o primeiro personagem do jogador.
 */
async function getActive(guildId, discordId, activeChars = {}) {
  const activeId = activeChars[discordId];
  const all      = await getByPlayer(guildId, discordId);
  if (!all.length) return null;
  if (activeId) return all.find(c => c.id === activeId) ?? all[0];
  return all[0];
}

/**
 * Define o personagem ativo de um jogador na sessão.
 * Retorna o activeChars atualizado (para salvar na sessão).
 */
function setActive(activeChars, discordId, charId) {
  return { ...activeChars, [discordId]: charId };
}

module.exports = { getAll, getByPlayer, find, upsert, remove, toId, getActive, setActive };
