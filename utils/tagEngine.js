// ============================================================
//  Chaos RPG Bot — Tag Engine
//  Executa tags customizadas criadas pelo Mestre
// ============================================================

const MAX_ATTEMPTS = 30;

// ── Condições de parada ───────────────────────────────────────

function shouldStop(rolls, sides, tag, attempt) {
  for (const cond of tag.stopConditions) {
    switch (cond.type) {
      case 'min':
        if (rolls.some(v => v === 1)) return true;
        break;
      case 'max':
        if (rolls.some(v => v === sides)) return true;
        break;
      case 'minOrMax':
        if (rolls.some(v => v === 1 || v === sides)) return true;
        break;
      case 'value':
        if (rolls.some(v => v === cond.value)) return true;
        break;
      case 'attempts':
        if (attempt >= cond.value) return true;
        break;
    }
  }
  return false;
}

function maxAttemptsFromTag(tag) {
  for (const cond of tag.stopConditions) {
    if (cond.type === 'attempts') return Math.min(cond.value, MAX_ATTEMPTS);
  }
  return MAX_ATTEMPTS;
}

// ── Motor de rolagem com tag ──────────────────────────────────

function executeTag(parsedBase, sides, tag, rerollFn) {
  const attempts    = [];
  const maxAttempts = maxAttemptsFromTag(tag);
  let stopped       = false;
  let stoppedAt     = null;

  let current = parsedBase;

  for (let i = 1; i <= maxAttempts; i++) {
    let rolls = [...current.rolls];
    let total = current.total;
    let extra = null;

    const gatilhoCond = tag.stopConditions.find(c => c.type === 'gatilho');
    if (gatilhoCond && rolls.some(v => v === gatilhoCond.value)) {
      const { parseSingleRoll } = require('./diceParser');
      const extraRoll = parseSingleRoll(gatilhoCond.dice);
      if (extraRoll) {
        extra = extraRoll;
        total += extraRoll.total;
        rolls  = [...rolls, ...extraRoll.rolls];
      }
    }

    // Coleta todas as mensagens de texto cujo valor foi rolado nesta tentativa
    const textos = tag.stopConditions
      .filter(c => c.type === 'texto' && rolls.some(v => v === c.value))
      .map(c => c.message);

    attempts.push({ rolls, total, extra, textos, attempt: i });

    const stopCondsWithoutGatilho = {
      ...tag,
      stopConditions: tag.stopConditions.filter(c => c.type !== 'gatilho'),
    };
    if (stopCondsWithoutGatilho.stopConditions.length > 0
        && shouldStop(rolls, sides, stopCondsWithoutGatilho, i)) {
      stopped   = true;
      stoppedAt = i;
      break;
    }

    if (i < maxAttempts) {
      const next = rerollFn();
      if (!next) break;
      current = next;
    }
  }

  return { attempts, stopped, stoppedAt };
}

// ── Formatação ────────────────────────────────────────────────

const FATE_LABEL = { '-1': '[-]', '0': '[0]', '1': '[+]' };

function rollsLabel(rolls, sides) {
  const sorted = [...rolls].sort((a, b) => b - a);
  if (!sides) {
    // dado Fate: bold em extremos (+ e -)
    return `[${sorted.map(v => {
      const label = FATE_LABEL[String(v)] ?? String(v);
      return (v === 1 || v === -1) ? `**${label}**` : label;
    }).join(', ')}]`;
  }
  return `[${sorted.map(v =>
    (v === sides || v === 1) ? `**${v}**` : String(v)
  ).join(', ')}]`;
}

function formatTagResult(parsed, tag, sides, rerollFn, freeText) {
  const { attempts, stopped, stoppedAt } = executeTag(parsed, sides, tag, rerollFn);

  const tagLabel  = `**[${tag.name}]**`;
  const freeLabel = freeText ? ` — *${freeText}*` : '';
  const header    = `\`${parsed.notation}\` ${tagLabel}${freeLabel}`;

  const bestTotal = Math.max(...attempts.map(a => a.total));
  const bestIdx   = attempts.findIndex(a => a.total === bestTotal);

  const lines = [header];
  for (let i = 0; i < attempts.length; i++) {
    const a      = attempts[i];
    const isBest = tag.display === 'allBest' && i === bestIdx;
    const isStop = stopped && i === (stoppedAt - 1);

    let line = `\`${i + 1}.\` ${rollsLabel(a.rolls, sides)}`;
    if (a.extra) line += ` ⚡ ${a.extra.notation}→${rollsLabel(a.extra.rolls, a.extra.sides)}`;
    line += ` = **${a.total}**`;
    if (isBest) line += ' ⭐';
    if (isStop) line += ' 🛑';

    lines.push(line);
    for (const txt of a.textos ?? []) lines.push(`> ✨ ${txt}`);
  }

  if (stopped) {
    lines.push(`✅ Condição atingida na tentativa ${stoppedAt}.`);
  } else {
    lines.push(`⚠️ Limite de ${attempts.length} tentativa(s) atingido.`);
  }

  if (tag.display === 'allBest') {
    lines.push(`⭐ Melhor resultado: **${bestTotal}**`);
  }

  return lines.join('\n');
}

module.exports = { executeTag, formatTagResult };
