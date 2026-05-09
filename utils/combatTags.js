// ============================================================
//  Chaos RPG Bot — Combat Tags
//  Detecta e processa tags inline de combate:
//  "2d6 dano Ada", "10 cura 💀", "&15 escudo @jogador"
// ============================================================

const characterStore = require('./characterStore');
const { applyDamage, applyHeal, applyShield,
        formatEvents } = require('./combatEngine');
const { formatFullStatus } = require('./statusEngine');

const COMBAT_TAGS = ['dano', 'cura', 'escudo'];

/**
 * Tenta extrair uma tag de combate do texto livre.
 * Retorna { combatTag, target, cleanText } ou null.
 *
 * Formatos aceitos (tag pode aparecer antes ou depois do alvo):
 *   "dano Ada"      → tag=dano, target="Ada"
 *   "Ada dano"      → tag=dano, target="Ada"
 *   "dano 💀"       → tag=dano, target="💀"
 *   "dano @Discord" → tag=dano, target="<@123>"
 */
function extractCombatTag(text) {
  if (!text) return null;

  for (const tag of COMBAT_TAGS) {
    const re = new RegExp(`\\b${tag}\\b`, 'i');
    if (!re.test(text)) continue;

    const rest   = text.replace(re, '').trim();
    const target = rest || null;
    return { combatTag: tag, target, cleanText: '' };
  }
  return null;
}

/**
 * Executa a operação de combate inline e retorna a mensagem formatada.
 *
 * @param {string}  guildId
 * @param {string}  combatTag  — 'dano' | 'cura' | 'escudo'
 * @param {string}  target     — identificador do personagem
 * @param {number}  value      — valor calculado da rolagem/expressão
 * @param {string}  rollLabel  — texto da rolagem para exibir (ex: "[3,4] +2 = 9")
 * @returns {Promise<string>}
 */
async function executeCombatTag(guildId, combatTag, target, value, rollLabel, activeChars = {}) {
  if (!target) return `❌ Informe o personagem após a tag. Ex: \`2d6 dano Ada\``;

  const char = await characterStore.find(guildId, target, activeChars);
  if (!char)  return `❌ Personagem \`${target}\` não encontrado.`;

  let result;
  switch (combatTag) {
    case 'dano':   result = applyDamage(char, value); break;
    case 'cura':   result = applyHeal(char, value);   break;
    case 'escudo': result = applyShield(char, value);  break;
    default:       return `❌ Tag de combate desconhecida: ${combatTag}`;
  }

  await characterStore.upsert(guildId, result.char);

  const name      = result.char.emoji
    ? `${result.char.emoji} **${result.char.name}**`
    : `**${result.char.name}**`;
  const tagLabel  = combatTag === 'dano' ? '⚔️ Dano'
                  : combatTag === 'cura' ? '💚 Cura'
                  : '🛡️ Escudo';
  const eventMsgs = formatEvents(result.char, result.events);

  const lines = [
    `🎲 ${rollLabel} = **${value}** → ${tagLabel} em ${name}`,
    result.log,
    '',
    formatFullStatus(result.char),
  ];
  if (eventMsgs.length) lines.push('', ...eventMsgs);

  return lines.join('\n');
}

module.exports = { extractCombatTag, executeCombatTag, COMBAT_TAGS };
