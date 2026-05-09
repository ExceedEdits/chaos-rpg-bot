// ============================================================
//  Chaos RPG Bot — Dice Formatter
//  Formata resultados do parser em strings para o Discord.
// ============================================================

const { formatTagResult }           = require('./tagEngine');
const { parseExpression, buildExprLabel } = require('./diceParser');

const MAX_CRITICAL_ATTEMPTS = 20;

// ── Formatadores base ─────────────────────────────────────────

function formatExpression(parsed) {
  const r        = parsed.results[0];
  const freeText = parsed.freeText ? ` — *${parsed.freeText}*` : '';

  const parts = parsed.exprData?.displayParts ?? [];
  // Expressão simples: um único dado, sem operadores
  if (parts.length === 1 && parts[0]?.type === 'dice') {
    return `\`${r.notation}\` → ${r.label} = **${r.total}**${freeText}`;
  }

  const exprLabel = parsed.exprData ? buildExprLabel(parsed.exprData) : r.label;
  return `\`${r.notation}\` → ${exprLabel} = **${r.total}**${freeText}`;
}

function formatRepeat(parsed) {
  const freeText = parsed.freeText ? ` — *${parsed.freeText}*` : '';
  const header   = `\`${parsed.raw.split(/\s/)[0]}\`${freeText}`;
  const lines    = parsed.results.map((r, i) =>
    `\`${i + 1}.\` ${r.label} = **${r.total}**`
  );
  return [header, ...lines].join('\n');
}

function formatMath(parsed) {
  const r        = parsed.results[0];
  const freeText = parsed.freeText ? ` — *${parsed.freeText}*` : '';
  return `\`${r.notation}\` = **${r.total}**${freeText}`;
}

// ── Tag builtin: crítico ──────────────────────────────────────

function formatCritical(parsed, rollFn) {
  const attempts = [];
  let found      = false;

  const sides = parsed.results[0].sides;

  for (let i = 0; i < MAX_CRITICAL_ATTEMPTS; i++) {
    const attempt = rollFn();
    if (!attempt) break;

    const r          = attempt.results[0];
    const isCritical = r.rolls.some(v => v === 1 || (sides && v === sides));
    const marker     = isCritical ? ' ⚡' : '';
    attempts.push(`\`${i + 1}.\` ${r.label} = **${r.total}**${marker}`);

    if (isCritical) { found = true; break; }
  }

  const freeText = parsed.freeText ? ` — *${parsed.freeText}*` : '';
  const header   = `\`${parsed.results[0].notation}\` **[Crítico]**${freeText}`;
  const footer   = found
    ? `✅ Crítico encontrado em ${attempts.length} tentativa(s)!`
    : `⚠️ Nenhum crítico em ${MAX_CRITICAL_ATTEMPTS} tentativas.`;

  return [header, ...attempts, footer].join('\n');
}

// ── Ponto de entrada ──────────────────────────────────────────

function format(parsed, rollFn) {
  if (parsed.tag && parsed.tagDef) {
    const sides    = parsed.results[0].sides;
    const rerollFn = () => {
      const r = rollFn();
      return r ? r.results[0] : null;
    };
    return formatTagResult(parsed.results[0], parsed.tagDef, sides, rerollFn, parsed.freeText);
  }

  if (parsed.tag === 'crítico') {
    return formatCritical(parsed, rollFn);
  }

  switch (parsed.type) {
    case 'repeat': return formatRepeat(parsed);
    case 'math':   return formatMath(parsed);
    default:       return formatExpression(parsed);
  }
}

module.exports = { format };
