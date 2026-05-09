// ============================================================
//  Chaos RPG Bot — Dice Parser
//  Suporta: XdY, df, n#XdY, modificadores, texto livre, tags
// ============================================================

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollFate() {
  return randInt(-1, 1);
}

const FATE_LABEL = { '-1': '[-]', '0': '[0]', '1': '[+]' };

// ── Roladores individuais ─────────────────────────────────────

function parseStandardDice(expr) {
  const m = expr.match(/^(\d*)d(\d+)$/i);
  if (!m) return null;
  const qty   = parseInt(m[1] || '1', 10);
  const sides = parseInt(m[2], 10);
  if (qty < 1 || qty > 100 || sides < 1 || sides > 10000) return null;

  const rolls = Array.from({ length: qty }, () => randInt(1, sides));
  return {
    rolls,
    total:    rolls.reduce((a, b) => a + b, 0),
    label:    `[${rolls.join(', ')}]`,
    notation: `${qty}d${sides}`,
  };
}

function parseFateDice(expr) {
  const m = expr.match(/^(\d*)df$/i);
  if (!m) return null;
  const qty = parseInt(m[1] || '1', 10);
  if (qty < 1 || qty > 20) return null;

  const rolls = Array.from({ length: qty }, () => rollFate());
  return {
    rolls,
    total:    rolls.reduce((a, b) => a + b, 0),
    label:    rolls.map(r => FATE_LABEL[r]).join(' '),
    notation: `${qty}df`,
  };
}

/**
 * Parseia XdY ou Xdf com modificador opcional (+N/-N).
 * Ex: "2d6", "4df-1", "d20+3"
 */
function parseSingleRoll(expr) {
  const m = expr.match(/^(\d*d(?:f|\d+))([+-]\d+)?$/i);
  if (!m) return null;

  const baseExpr = m[1].trim();
  const mod      = parseInt(m[2] || '0', 10);

  const diceResult = parseStandardDice(baseExpr) ?? parseFateDice(baseExpr);
  if (!diceResult) return null;

  const total    = diceResult.total + mod;
  const modLabel = mod !== 0 ? ` ${mod > 0 ? '+' : ''}${mod}` : '';

  return {
    rolls:    diceResult.rolls,
    total,
    label:    `${diceResult.label}${modLabel}`,
    notation: `${diceResult.notation}${modLabel}`,
  };
}

/**
 * N#XdY — repete a rolagem N vezes sem somar.
 * Retorna array de RollResult ou null.
 */
function parseRepeatDice(expr) {
  const m = expr.match(/^(\d+)#(.+)$/i);
  if (!m) return null;
  const times   = parseInt(m[1], 10);
  const subExpr = m[2].trim();
  if (times < 1 || times > 20) return null;

  const results = [];
  for (let i = 0; i < times; i++) {
    const r = parseSingleRoll(subExpr);
    if (!r) return null;
    results.push(r);
  }
  return results;
}

function parseMath(expr) {
  if (!/^[\d\s+\-*/().%]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')();
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return { total: result, label: String(result), notation: expr };
  } catch {
    return null;
  }
}

// ── Detecção de tags ──────────────────────────────────────────

const BUILTIN_TAGS = ['crítico', 'critico'];
const { COMBAT_TAGS } = require('./combatTags');

/**
 * Detecta tags builtin no texto.
 * Retorna { tag, tagDef, cleanText, combatTag?, combatTarget? } ou null.
 */
function extractBuiltinTag(text) {
  // Tag de iniciativa
  {
    const re = /\biniciativa\b/i;
    if (re.test(text)) {
      const rest   = text.replace(re, '').trim();
      return {
        tag:            'iniciativa',
        tagDef:         null,
        cleanText:      '',
        combatTag:      null,
        combatTarget:   null,
        initiativeTag:  true,
        initiativeTarget: rest || null,
      };
    }
  }

  // Tags de combate (dano, cura, escudo) — têm prioridade
  for (const ctag of COMBAT_TAGS) {
    const re = new RegExp(`\\b${ctag}\\b`, 'i');
    if (re.test(text)) {
      const rest   = text.replace(re, '').trim();
      return {
        tag:          ctag,
        tagDef:       null,
        cleanText:    '',
        combatTag:    ctag,
        combatTarget: rest || null,
      };
    }
  }
  // Tags de rolagem builtin
  for (const name of BUILTIN_TAGS) {
    const re = new RegExp(`\\b${name}\\b`, 'i');
    if (re.test(text)) {
      return { tag: 'crítico', tagDef: null, cleanText: text.replace(re, '').trim() };
    }
  }
  return null;
}

/**
 * Detecta tags customizadas (já carregadas como objeto { nome: tagDef }).
 * Retorna { tag, tagDef, cleanText } ou null.
 */
function extractCustomTag(text, customTags) {
  for (const key of Object.keys(customTags)) {
    const re = new RegExp(`\\b${key}\\b`, 'i');
    if (re.test(text)) {
      return { tag: key, tagDef: customTags[key], cleanText: text.replace(re, '').trim() };
    }
  }
  return null;
}

// ── Parser principal ──────────────────────────────────────────

/**
 * Parseia uma expressão de dados.
 *
 * @param {string} raw         - texto bruto da mensagem/comando
 * @param {object} customTags  - tags customizadas já carregadas do banco { nome: tagDef }
 * @returns {object|null}
 */
function parse(raw, customTags = {}) {
  raw = raw.trim();

  // Modo matemático
  if (raw.startsWith('&')) {
    const parts    = raw.slice(1).trim().split(/\s+/);
    const mathExpr = parts[0];
    const freeText = parts.slice(1).join(' ') || null;
    const result   = parseMath(mathExpr);
    if (!result) return null;
    return { type: 'math', results: [result], freeText, tag: null, tagDef: null, raw };
  }

  // Separa expressão de dados do texto livre
  const spaceIdx  = raw.search(/\s/);
  const diceExpr  = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx);
  const afterDice = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1).trim();

  // Detecta tag (builtin tem prioridade sobre customizada)
  const tagMatch = extractBuiltinTag(afterDice)
                ?? extractCustomTag(afterDice, customTags)
                ?? { tag: null, tagDef: null, cleanText: afterDice };

  const { tag, tagDef, cleanText,
          combatTag = null, combatTarget = null,
          initiativeTag = false, initiativeTarget = null } = tagMatch;
  const freeText = cleanText || null;

  // Repetição N#XdY
  const repeated = parseRepeatDice(diceExpr);
  if (repeated) {
    return { type: 'repeat', results: repeated, freeText, tag, tagDef,
             combatTag, combatTarget, initiativeTag, initiativeTarget, raw };
  }

  // Dado padrão ou Fate
  const single = parseSingleRoll(diceExpr);
  if (single) {
    return { type: 'roll', results: [single], freeText, tag, tagDef,
             combatTag, combatTarget, initiativeTag, initiativeTarget, raw };
  }

  return null;
}

module.exports = { parse, parseSingleRoll, randInt };
