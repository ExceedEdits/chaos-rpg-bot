// ============================================================
//  Chaos RPG Bot — Dice Formatter
//  Formata resultados do parser em strings para o Discord.
//  Tags customizadas são delegadas ao tagEngine.
// ============================================================

const { formatTagResult } = require('./tagEngine');

const MAX_CRITICAL_ATTEMPTS = 20;

// ── Formatadores base ─────────────────────────────────────────

function formatSingle(parsed) {
  const r        = parsed.results[0];
  const freeText = parsed.freeText ? ` — *${parsed.freeText}*` : '';
  return `🎲 \`${r.notation}\` → ${r.label} = **${r.total}**${freeText}`;
}

function formatRepeat(parsed) {
  const freeText = parsed.freeText ? ` — *${parsed.freeText}*` : '';
  const header   = `🎲 \`${parsed.raw.split(/\s/)[0]}\`${freeText}`;
  const lines    = parsed.results.map((r, i) =>
    `\`${i + 1}.\` ${r.label} = **${r.total}**`
  );
  return [header, ...lines].join('\n');
}

function formatMath(parsed) {
  const r        = parsed.results[0];
  const freeText = parsed.freeText ? ` — *${parsed.freeText}*` : '';
  return `🧮 \`${r.notation}\` = **${r.total}**${freeText}`;
}

// ── Tag builtin: crítico ──────────────────────────────────────

function formatCritical(parsed, rollFn) {
  const attempts = [];
  let found      = false;

  const notationMatch = parsed.results[0].notation.match(/d(\d+)/i);
  const sides         = notationMatch ? parseInt(notationMatch[1], 10) : null;

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
  const header   = `🎲 \`${parsed.results[0].notation}\` **[Crítico]**${freeText}`;
  const footer   = found
    ? `✅ Crítico encontrado em ${attempts.length} tentativa(s)!`
    : `⚠️ Nenhum crítico em ${MAX_CRITICAL_ATTEMPTS} tentativas.`;

  return [header, ...attempts, footer].join('\n');
}

// ── Ponto de entrada ──────────────────────────────────────────

/**
 * Recebe um ParsedLine e retorna a string formatada.
 * rollFn: () => ParsedLine — usado para reolar em loops de tag.
 */
function format(parsed, rollFn) {
  // Tag customizada → delega ao tagEngine
  if (parsed.tag && parsed.tagDef) {
    const notationMatch = parsed.results[0].notation.match(/d(\d+)/i);
    const sides         = notationMatch ? parseInt(notationMatch[1], 10) : 6;

    // rerollFn para o engine: retorna apenas o RollResult, não o ParsedLine completo
    const rerollFn = () => {
      const r = rollFn();
      return r ? r.results[0] : null;
    };

    return formatTagResult(parsed.results[0], parsed.tagDef, sides, rerollFn, parsed.freeText);
  }

  // Tag builtin: crítico
  if (parsed.tag === 'crítico') {
    return formatCritical(parsed, rollFn);
  }

  switch (parsed.type) {
    case 'repeat': return formatRepeat(parsed);
    case 'math':   return formatMath(parsed);
    default:       return formatSingle(parsed);
  }
}

module.exports = { format };
