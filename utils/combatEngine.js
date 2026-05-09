// ============================================================
//  Chaos RPG Bot — Combat Engine
//  Aplica dano, cura e escudo a um personagem,
//  retorna o novo estado e eventos ocorridos.
// ============================================================

/**
 * @typedef {'death'|'critical'|'shieldBreak'|'shieldUp'|'heal'|'damage'} CombatEvent
 *
 * @typedef {{
 *   char:   object,        — personagem atualizado
 *   events: CombatEvent[], — lista de eventos para exibir
 *   log:    string         — resumo legível da operação
 * }} CombatResult
 */

// ── Dano ──────────────────────────────────────────────────────

/**
 * Aplica `amount` de dano ao personagem.
 * Regras:
 *   1. Dano abate escudo primeiro.
 *   2. Se salvaguarda=true e escudo quebrou, dano excedente é descartado.
 *   3. Se salvaguarda=false, dano excedente vai pro HP.
 *   4. HP não fica abaixo de 0.
 */
function applyDamage(char, amount) {
  const events  = [];
  let remaining = amount;
  let log       = '';

  const prevShield = char.shield;
  const prevHp     = char.hp;

  if (char.shield > 0) {
    if (remaining >= char.shield) {
      remaining   -= char.shield;
      char.shield  = 0;
      events.push('shieldBreak');

      if (char.salvaguarda) {
        remaining = 0; // dano excedente descartado
        log = `🛡️ Escudo quebrado! Dano excedente bloqueado (salvaguarda ativada).`;
      }
    } else {
      char.shield -= remaining;
      remaining    = 0;
      log = `🛡️ Escudo absorveu ${amount} de dano. (${prevShield} → ${char.shield})`;
    }
  }

  if (remaining > 0) {
    char.hp = Math.max(0, char.hp - remaining);
    const hpDelta = prevHp - char.hp;

    if (char.hp === 0) {
      events.push('death');
    } else if (char.hp <= char.critThreshold) {
      events.push('critical');
    }

    if (prevShield > 0 && char.shield === 0 && !log) {
      log = `🛡️ Escudo quebrado! ❤️ HP: ${prevHp} → **${char.hp}** (−${hpDelta})`;
    } else if (!log) {
      log = `❤️ HP: ${prevHp} → **${char.hp}** (−${hpDelta})`;
    } else {
      log += `\n❤️ HP: ${prevHp} → **${char.hp}** (−${hpDelta})`;
    }
  }

  if (!log) log = `Sem alteração.`;
  return { char, events, log };
}

// ── Cura ──────────────────────────────────────────────────────

/**
 * Aplica `amount` de cura ao personagem.
 * Regras:
 *   overheal='cap'    → HP fica limitado ao hpMax
 *   overheal='shield' → excedente vira escudo (acumula no escudo atual)
 */
function applyHeal(char, amount) {
  const events = [];
  const prevHp = char.hp;
  let log      = '';

  const healed    = Math.min(amount, char.hpMax - char.hp);
  char.hp        += healed;
  const overheal  = amount - healed;

  if (overheal > 0 && char.overheal === 'shield') {
    char.shield += overheal;
    log = `❤️ HP: ${prevHp} → **${char.hp}** (+${healed}) | 🛡️ Escudo +${overheal} → **${char.shield}**`;
    events.push('shieldUp');
  } else {
    log = `❤️ HP: ${prevHp} → **${char.hp}** (+${healed})`;
    if (overheal > 0) log += ` *(${overheal} de cura perdido — HP máximo)*`;
  }

  return { char, events, log };
}

// ── Escudo ────────────────────────────────────────────────────

/**
 * Define (substitui) o valor do escudo.
 */
function applyShield(char, amount) {
  const prev  = char.shield;
  char.shield = Math.max(0, amount);
  const log   = `🛡️ Escudo: ${prev} → **${char.shield}**`;
  const events = char.shield > prev ? ['shieldUp'] : [];
  return { char, events, log };
}

// ── Barra de HP ───────────────────────────────────────────────

/**
 * Gera uma barra visual de HP para o Discord.
 * Ex: ████████░░░░ 30/50
 */
function hpBar(hp, hpMax, length = 12) {
  const ratio  = Math.max(0, Math.min(1, hp / hpMax));
  const filled = Math.round(ratio * length);
  const bar    = '█'.repeat(filled) + '░'.repeat(length - filled);
  const color  = ratio > 0.5 ? '🟢' : ratio > 0.25 ? '🟡' : '🔴';
  return `${color} \`${bar}\` ${hp}/${hpMax}`;
}

/**
 * Formata o status completo de um personagem.
 */
function formatStatus(char) {
  const name    = char.emoji ? `${char.emoji} **${char.name}**` : `**${char.name}**`;
  const hp      = hpBar(char.hp, char.hpMax);
  const shieldStr = char.shield > 0
    ? `\n🛡️ Escudo: **${char.shield}**/${char.shieldMax ?? '∞'}`
    : char.shieldMax > 0 ? `\n🛡️ Escudo: 0/${char.shieldMax}` : '';
  const salvag  = `Salvaguarda: ${char.salvaguarda ? '✅ bloqueia excedente' : '❌ excedente no HP'}`;
  const ovh     = `Overheal: ${char.overheal === 'shield' ? '→ escudo' : 'limitado'}`;
  return `${name}\n${hp}${shieldStr}\n*${salvag} · ${ovh}*`;
}

/**
 * Formata mensagens de evento para o chat.
 */
function formatEvents(char, events) {
  const name = char.emoji ? `${char.emoji} ${char.name}` : char.name;
  return events.map(e => {
    switch (e) {
      case 'death':       return `💀 **${name} chegou a 0 HP!**`;
      case 'critical':    return `⚠️ **${name} está em HP crítico!** (${char.hp}/${char.hpMax})`;
      case 'shieldBreak': return `💥 Escudo de **${name}** foi destruído!`;
      case 'shieldUp':    return `🛡️ Escudo de **${name}** reforçado!`;
      default:            return '';
    }
  }).filter(Boolean);
}

module.exports = { applyDamage, applyHeal, applyShield, formatStatus, formatEvents, hpBar };
