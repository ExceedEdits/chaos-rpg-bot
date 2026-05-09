// ============================================================
//  Chaos RPG Bot — Tag Engine
//  Executa tags customizadas criadas pelo Mestre
// ============================================================

const MAX_ATTEMPTS = 30; // teto de segurança anti-loop

// ── Condições de parada ───────────────────────────────────────
//
// Cada condição recebe (roll, tag, sides) e retorna true se deve parar.
//
// Tipos:
//   min          → para quando sair o valor mínimo do dado (1)
//   max          → para quando sair o valor máximo do dado (sides)
//   minOrMax     → para quando sair 1 ou sides
//   value        → para quando sair tag.stopValue
//   attempts     → para após tag.stopAttempts tentativas
//   explode      → ao sair tag.explodeOn, rola dado extra e continua (sem parada, acumula)
//
// Um tag pode combinar condições — a engine testa todas a cada rolagem.

/**
 * Testa se a rolagem atingiu uma condição de parada.
 * @param {number[]} rolls   - dados individuais da tentativa atual
 * @param {number}   sides   - lados do dado
 * @param {object}   tag     - definição da tag
 * @param {number}   attempt - número da tentativa atual (1-based)
 * @returns {boolean}
 */
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

/**
 * Verifica se alguma condição de parada usa "attempts"
 * para limitar naturalmente o loop.
 */
function maxAttemptsFromTag(tag) {
  for (const cond of tag.stopConditions) {
    if (cond.type === 'attempts') return Math.min(cond.value, MAX_ATTEMPTS);
  }
  return MAX_ATTEMPTS;
}

// ── Motor de rolagem com tag ──────────────────────────────────

/**
 * Executa uma rolagem completa com a tag aplicada.
 *
 * @param {object}   parsedBase  - resultado de diceParser.parseSingleRoll() da expressão base
 * @param {number}   sides       - lados do dado base
 * @param {object}   tag         - definição completa da tag (de tags.json)
 * @param {Function} rerollFn    - função () => RollResult para gerar novas tentativas
 * @returns {{ attempts: AttemptResult[], stopped: boolean, stoppedAt: number|null }}
 */
function executeTag(parsedBase, sides, tag, rerollFn) {
  const attempts    = [];
  const maxAttempts = maxAttemptsFromTag(tag);
  let stopped       = false;
  let stoppedAt     = null;

  // Primeira tentativa usa o resultado já gerado
  let current = parsedBase;

  for (let i = 1; i <= maxAttempts; i++) {
    let rolls = [...current.rolls];
    let total = current.total;
    let extra = null; // resultado de dado explodido, se houver

    // ── Explosão de dado ───────────────────────────────────────
    const explodeCond = tag.stopConditions.find(c => c.type === 'explode');
    if (explodeCond && rolls.some(v => v === explodeCond.value)) {
      const extraRoll = rerollFn();
      if (extraRoll) {
        extra = extraRoll;
        total += extraRoll.total;
        rolls = [...rolls, ...extraRoll.rolls];
      }
    }

    attempts.push({ rolls, total, extra, attempt: i });

    // ── Testa parada (exceto "explode", que não para) ──────────
    const stopCondsWithoutExplode = {
      ...tag,
      stopConditions: tag.stopConditions.filter(c => c.type !== 'explode'),
    };
    if (stopCondsWithoutExplode.stopConditions.length > 0
        && shouldStop(rolls, sides, stopCondsWithoutExplode, i)) {
      stopped   = true;
      stoppedAt = i;
      break;
    }

    // Próxima tentativa
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

function rollsLabel(rolls) {
  return `[${rolls.map(v => FATE_LABEL[String(v)] ?? v).join(', ')}]`;
}

/**
 * Formata o resultado completo de uma tag para exibição no Discord.
 *
 * display modes:
 *   'all'         → mostra todas as tentativas
 *   'allBest'     → mostra todas + destaca o melhor resultado
 */
function formatTagResult(parsed, tag, sides, rerollFn, freeText) {
  const { attempts, stopped, stoppedAt } = executeTag(parsed, sides, tag, rerollFn);

  const tagLabel = `**[${tag.name}]**`;
  const freeLabel = freeText ? ` — *${freeText}*` : '';
  const header = `🎲 \`${parsed.notation}\` ${tagLabel}${freeLabel}`;

  const lines = [header];

  // Encontra o índice do melhor total (para allBest)
  const bestTotal = Math.max(...attempts.map(a => a.total));
  const bestIdx   = attempts.findIndex(a => a.total === bestTotal);

  for (let i = 0; i < attempts.length; i++) {
    const a       = attempts[i];
    const isBest  = tag.display === 'allBest' && i === bestIdx;
    const isStop  = stopped && i === (stoppedAt - 1);

    let line = `\`${i + 1}.\` ${rollsLabel(a.rolls)}`;

    // Dado explodido
    if (a.extra) {
      line += ` 💥 +${rollsLabel(a.extra.rolls)}`;
    }

    line += ` = **${a.total}**`;

    if (isBest)  line += ' ⭐';
    if (isStop)  line += ' 🛑';
  }

  // Reconstrói as linhas com marcadores
  lines.length = 1; // reseta para só o header
  for (let i = 0; i < attempts.length; i++) {
    const a      = attempts[i];
    const isBest = tag.display === 'allBest' && i === bestIdx;
    const isStop = stopped && i === (stoppedAt - 1);

    let line = `\`${i + 1}.\` ${rollsLabel(a.rolls)}`;
    if (a.extra) line += ` 💥 +${rollsLabel(a.extra.rolls)}`;
    line += ` = **${a.total}**`;
    if (isBest)  line += ' ⭐';
    if (isStop)  line += ' 🛑';

    lines.push(line);
  }

  // Rodapé
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
