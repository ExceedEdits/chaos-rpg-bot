// ============================================================
//  Chaos RPG Bot — Status Engine
//  Processa status ativos de um personagem a cada rodada.
// ============================================================

const { applyDamage, applyHeal, applyShield,
        formatEvents, hpBar } = require('./combatEngine');

// ── Estrutura de um status ────────────────────────────────────
//
// {
//   id:        string   — slug único por personagem (ex: "veneno")
//   label:     string   — nome de exibição (ex: "Veneno")
//   duration:  number|null — rodadas restantes (null = permanente)
//   effect: {
//     type:    'dano'|'cura'|'escudo'|null
//     value:   number
//   } | null
// }

/**
 * Aplica os efeitos de todos os status ativos de um personagem
 * para uma rodada. Decrementa duração e remove expirados.
 *
 * @param {object}   char     — personagem completo
 * @param {Function} saveFn   — async (char) => void, persiste após cada efeito
 * @returns {{ char, logs: string[], expired: string[] }}
 */
async function processRound(char, saveFn) {
  const logs    = [];
  const expired = [];

  if (!char.statuses || char.statuses.length === 0) {
    return { char, logs, expired };
  }

  const remaining = [];

  for (const status of char.statuses) {
    // Aplica efeito por rodada, se existir
    if (status.effect && status.effect.type && status.effect.value > 0) {
      let result;
      switch (status.effect.type) {
        case 'dano':   result = applyDamage(char, status.effect.value); break;
        case 'cura':   result = applyHeal(char, status.effect.value);   break;
        case 'escudo': result = applyShield(char, status.effect.value); break;
      }
      if (result) {
        char = result.char;
        const evts = formatEvents(char, result.events);
        const effectIcon = status.effect.type === 'dano' ? '⚔️'
                         : status.effect.type === 'cura' ? '💚' : '🛡️';
        logs.push(`  ${effectIcon} **${status.label}**: ${result.log}${evts.length ? '\n  ' + evts.join('\n  ') : ''}`);
        await saveFn(char);
      }
    }

    // Decrementa duração
    if (status.duration === null) {
      remaining.push(status); // permanente
    } else if (status.duration > 1) {
      remaining.push({ ...status, duration: status.duration - 1 });
    } else {
      expired.push(status.label); // duração chegou a 0
    }
  }

  char.statuses = remaining;
  return { char, logs, expired };
}

/**
 * Formata a lista de status ativos de um personagem.
 */
function formatStatuses(char) {
  if (!char.statuses || char.statuses.length === 0) return null;

  return char.statuses.map(s => {
    const dur = s.duration === null ? '∞' : `${s.duration} rodada(s)`;
    let line  = `• **${s.label}** — ${dur}`;
    if (s.effect && s.effect.type) {
      const icon = s.effect.type === 'dano' ? '⚔️'
                 : s.effect.type === 'cura' ? '💚' : '🛡️';
      line += ` · ${icon} ${s.effect.value} ${s.effect.type}/rodada`;
    }
    return line;
  }).join('\n');
}

/**
 * Formata o status completo de um personagem incluindo status ativos.
 */
function formatFullStatus(char) {
  const name   = char.emoji ? `${char.emoji} **${char.name}**` : `**${char.name}**`;
  const hp     = hpBar(char.hp, char.hpMax);
  const shieldStr = char.shield > 0
    ? `\n🛡️ Escudo: **${char.shield}**/${char.shieldMax ?? '∞'}`
    : char.shieldMax > 0 ? `\n🛡️ Escudo: 0/${char.shieldMax}` : '';
  const salvag = `Salvaguarda: ${char.salvaguarda ? '✅ bloqueia excedente' : '❌ excedente no HP'}`;
  const ovh    = `Overheal: ${char.overheal === 'shield' ? '→ escudo' : 'limitado'}`;
  const statusBlock = formatStatuses(char);
  const statusStr = statusBlock ? `\n\n**Status ativos:**\n${statusBlock}` : '';
  return `${name}\n${hp}${shieldStr}\n*${salvag} · ${ovh}*${statusStr}`;
}

// Alias para compatibilidade
const processRoundForChar = processRound;

module.exports = { processRound, processRoundForChar, formatStatuses, formatFullStatus };
