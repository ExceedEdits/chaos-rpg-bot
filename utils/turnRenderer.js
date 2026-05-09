// ============================================================
//  Chaos RPG Bot — Turn Renderer
//  Formata o tracker de turno respeitando as settings da sessão.
// ============================================================

const { formatStatuses } = require('./statusEngine');

function renderOrder(order, currentIdx) {
  return order.map((p, i) => {
    const team  = p.team  ? `${p.team}`  : '';
    const emoji = p.emoji ? `${p.emoji}` : '';
    const name  = i === currentIdx ? `**${p.name}**` : p.name;
    return `${team}${emoji}${name}`;
  }).join(' | ');
}

function renderActiveBlock(active, allChars, settings = {}) {
  const showStatus  = settings.showStatusInTracker  !== false;
  const showEffects = settings.showEffectsApplying  !== false;

  const char = allChars.find(c => c.id === active.charId);
  if (!char) return '';

  const lines = [];

  if (showStatus) {
    const receiving = formatStatuses(char);
    if (receiving) {
      lines.push('📋 **Status ativos:**');
      lines.push(receiving);
    }
  }

  if (showEffects) {
    const causing = [];
    for (const other of allChars) {
      if (!other.statuses || other.id === char.id) continue;
      for (const s of other.statuses) {
        if (s.sourceId === char.id) {
          const icon = s.effect?.type === 'dano'   ? '⚔️'
                     : s.effect?.type === 'cura'   ? '💚'
                     : s.effect?.type === 'escudo' ? '🛡️' : '✨';
          causing.push(`  ${icon} **${s.label}** em ${other.emoji ?? ''}**${other.name}**`);
        }
      }
    }
    if (causing.length > 0) {
      lines.push('🎯 **Efeitos aplicando:**');
      lines.push(causing.join('\n'));
    }
  }

  return lines.length > 0 ? '\n' + lines.join('\n') : '';
}

/**
 * @param {object} combat    — estado de combate
 * @param {object[]} allChars — personagens carregados
 * @param {object} settings  — settings da sessão (showStatusInTracker, showEffectsApplying)
 */
function renderTracker(combat, allChars, settings = {}) {
  if (!combat.active || combat.order.length === 0) return null;

  const active      = combat.order[combat.current];
  const orderLine   = renderOrder(combat.order, combat.current);
  const activeBlock = renderActiveBlock(active, allChars, settings);
  const mention     = active.discordId ? ` <@${active.discordId}>` : '';

  return [
    `⚔️ **Rodada ${combat.round}**`,
    '',
    orderLine,
    '',
    `🎲 Vez de ${active.emoji ?? ''}**${active.name}**${mention}`,
    activeBlock,
  ].filter(l => l !== null).join('\n');
}

module.exports = { renderTracker, renderOrder };
