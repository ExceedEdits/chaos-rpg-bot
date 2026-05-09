// ============================================================
//  Chaos RPG Bot — Dice Parser
//  Suporta: XdY, df, n#XdY, expressões matemáticas, texto livre, tags
// ============================================================

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollFate() {
  return randInt(-1, 1);
}

const FATE_LABEL = { '-1': '[-]', '0': '[0]', '1': '[+]' };

// ── Roladores base ────────────────────────────────────────────

function parseStandardDice(expr) {
  const m = expr.match(/^(\d*)d(\d+)$/i);
  if (!m) return null;
  const qty   = parseInt(m[1] || '1', 10);
  const sides = parseInt(m[2], 10);
  if (qty < 1 || qty > 100 || sides < 1 || sides > 10000) return null;

  const rolls  = Array.from({ length: qty }, () => randInt(1, sides));
  const sorted = [...rolls].sort((a, b) => b - a);

  const labelParts = sorted.map(v =>
    (v === sides || v === 1) ? `**${v}**` : String(v)
  );

  return {
    rolls:    sorted,
    total:    rolls.reduce((a, b) => a + b, 0),
    label:    `[${labelParts.join(', ')}]`,
    notation: `${qty}d${sides}`,
    sides,
  };
}

function parseFateDice(expr) {
  const m = expr.match(/^(\d*)df$/i);
  if (!m) return null;
  const qty = parseInt(m[1] || '1', 10);
  if (qty < 1 || qty > 20) return null;

  const rolls  = Array.from({ length: qty }, () => rollFate());
  const sorted = [...rolls].sort((a, b) => b - a);

  const labelParts = sorted.map(v =>
    (v === 1 || v === -1) ? `**${FATE_LABEL[v]}**` : FATE_LABEL[v]
  );

  return {
    rolls:    sorted,
    total:    sorted.reduce((a, b) => a + b, 0),
    label:    labelParts.join(' '),
    notation: `${qty}df`,
    sides:    null,
  };
}

// parseSingleRoll — usado internamente por parseRepeatDice e rollFn de tags
function parseSingleRoll(expr) {
  const m = expr.match(/^(\d*d(?:f|\d+))([+-]\d+)?$/i);
  if (!m) return null;

  const baseExpr   = m[1].trim();
  const mod        = parseInt(m[2] || '0', 10);
  const diceResult = parseStandardDice(baseExpr) ?? parseFateDice(baseExpr);
  if (!diceResult) return null;

  const total    = diceResult.total + mod;
  const modLabel = mod !== 0 ? `${mod > 0 ? '+' : ''}${mod}` : '';

  return {
    rolls:    diceResult.rolls,
    total,
    label:    `${diceResult.label}${modLabel ? ` ${modLabel}` : ''}`,
    notation: `${diceResult.notation}${modLabel}`,
    sides:    diceResult.sides,
  };
}

// ── Repetição N#XdY ───────────────────────────────────────────

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

// ── Matemática pura ───────────────────────────────────────────

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

// ── Parser de expressão (dados + operadores matemáticos) ──────

const DICE_RE = /^\d*d(?:f|\d+)$/i;

function tokenizeExpr(expr) {
  const re = /\d*d(?:f|\d+)|\d+|[+\-*/()]/gi;
  const tokens = [];
  let pos = 0;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(expr)) !== null) {
    if (m.index !== pos) return null; // caractere não reconhecido
    tokens.push(m[0]);
    pos = re.lastIndex;
  }
  if (pos !== expr.length) return null;
  return tokens;
}

function parseExpression(expr) {
  const tokens = tokenizeExpr(expr);
  if (!tokens || tokens.length === 0) return null;

  const diceResults  = [];
  const displayParts = [];
  const mathTokens   = [];

  for (const token of tokens) {
    if (DICE_RE.test(token)) {
      const result = parseStandardDice(token) ?? parseFateDice(token);
      if (!result) return null;
      diceResults.push(result);
      displayParts.push({ type: 'dice', result });
      mathTokens.push(String(result.total));
    } else if (/^[+\-*/()]$/.test(token)) {
      displayParts.push({ type: 'op', value: token });
      mathTokens.push(token);
    } else {
      displayParts.push({ type: 'num', value: token });
      mathTokens.push(token);
    }
  }

  if (diceResults.length === 0) return null; // exige ao menos um dado

  const evalResult = parseMath(mathTokens.join(''));
  if (!evalResult) return null;

  return {
    rolls:        diceResults.flatMap(d => d.rolls),
    total:        Math.round(evalResult.total),
    diceResults,
    displayParts,
    notation:     expr,
    sides:        diceResults[0]?.sides ?? null,
  };
}

// ── Helper: reconstrói label legível de uma expressão ─────────

const OP_DISPLAY = { '*': '×', '/': '÷' };

function buildExprLabel(expr) {
  let label = '';
  for (const part of expr.displayParts) {
    if (part.type === 'dice') {
      label += part.result.label;
    } else if (part.type === 'op') {
      label += ` ${OP_DISPLAY[part.value] || part.value} `;
    } else {
      label += part.value;
    }
  }
  return label;
}

// ── Detecção de tags ──────────────────────────────────────────

const BUILTIN_TAGS = ['crítico', 'critico'];
const { COMBAT_TAGS } = require('./combatTags');

function extractBuiltinTag(text) {
  {
    const re = /\biniciativa\b/i;
    if (re.test(text)) {
      const rest = text.replace(re, '').trim();
      return {
        tag: 'iniciativa', tagDef: null, cleanText: '',
        combatTag: null, combatTarget: null,
        initiativeTag: true, initiativeTarget: rest || null,
      };
    }
  }
  for (const ctag of COMBAT_TAGS) {
    const re = new RegExp(`\\b${ctag}\\b`, 'i');
    if (re.test(text)) {
      const rest = text.replace(re, '').trim();
      return {
        tag: ctag, tagDef: null, cleanText: '',
        combatTag: ctag, combatTarget: rest || null,
      };
    }
  }
  for (const name of BUILTIN_TAGS) {
    const re = new RegExp(`\\b${name}\\b`, 'i');
    if (re.test(text)) {
      return { tag: 'crítico', tagDef: null, cleanText: text.replace(re, '').trim() };
    }
  }
  return null;
}

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

function parse(raw, customTags = {}) {
  raw = raw.trim();

  // Modo matemático puro (&expr)
  if (raw.startsWith('&')) {
    const parts    = raw.slice(1).trim().split(/\s+/);
    const mathExpr = parts[0];
    const freeText = parts.slice(1).join(' ') || null;
    const result   = parseMath(mathExpr);
    if (!result) return null;
    return { type: 'math', results: [result], freeText, tag: null, tagDef: null, raw };
  }

  // Separa expressão de dado do texto livre
  const spaceIdx  = raw.search(/\s/);
  const diceExpr  = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx);
  const afterDice = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1).trim();

  // Detecta tags no texto livre
  const tagMatch = extractBuiltinTag(afterDice)
                ?? extractCustomTag(afterDice, customTags)
                ?? { tag: null, tagDef: null, cleanText: afterDice };

  const {
    tag, tagDef, cleanText,
    combatTag = null, combatTarget = null,
    initiativeTag = false, initiativeTarget = null,
  } = tagMatch;
  const freeText = cleanText || null;

  // Repetição N#XdY
  const repeated = parseRepeatDice(diceExpr);
  if (repeated) {
    return {
      type: 'repeat', results: repeated, freeText,
      tag, tagDef, combatTag, combatTarget, initiativeTag, initiativeTarget, raw,
    };
  }

  // Expressão com dados e/ou operadores matemáticos
  const expr = parseExpression(diceExpr);
  if (expr) {
    const compat = {
      rolls:    expr.rolls,
      total:    expr.total,
      label:    buildExprLabel(expr),
      notation: expr.notation,
      sides:    expr.sides,
    };
    return {
      type: 'expr', results: [compat], exprData: expr, freeText,
      tag, tagDef, combatTag, combatTarget, initiativeTag, initiativeTarget, raw,
    };
  }

  return null;
}

module.exports = { parse, parseSingleRoll, parseExpression, buildExprLabel, randInt };
