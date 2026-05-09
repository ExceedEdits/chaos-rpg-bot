// ============================================================
//  Chaos RPG Bot — Initiative Tag Handler
//  Processa "XdY iniciativa Ada" / "XdY iniciativa"
// ============================================================

const characterStore  = require('./characterStore');
const initiativeStore = require('./initiativeStore');

/**
 * Registra uma rolagem de iniciativa.
 *
 * Resolução do alvo (em ordem de prioridade):
 *  1. Nome/emoji explícito após a tag  → busca personagem por nome/emoji
 *  2. @mention do autor                → busca personagem pelo discordId
 *  3. Sem alvo                         → usa o nome do Discord como label
 *
 * @param {string}  guildId
 * @param {number}  value           — resultado da rolagem
 * @param {string}  rollLabel       — texto formatado da rolagem
 * @param {string|null} target      — texto após "iniciativa" (pode ser null)
 * @param {object}  discordMember   — member do Discord que executou
 * @returns {Promise<string>}       — mensagem formatada para o chat
 */
async function handleInitiative(guildId, channelId, value, rollLabel, target, discordMember) {
  const combat = await initiativeStore.load(guildId, channelId);

  let charId    = null;
  let name      = null;
  let emoji     = null;
  let team      = null;
  let discordId = discordMember.id;

  // Tenta resolver o alvo
  if (target) {
    const char = await characterStore.find(guildId, target);
    if (char) {
      charId = char.id;
      name   = char.name;
      emoji  = char.emoji ?? null;
      team   = char.team  ?? null;
    } else {
      // Alvo não encontrado como personagem — usa o texto como label livre
      name = target;
    }
  } else {
    // Sem alvo — tenta achar o personagem associado ao jogador
    const allChars = await characterStore.getAll(guildId);
    const myChar   = allChars.find(c => c.discordId === discordMember.id);
    if (myChar) {
      charId = myChar.id;
      name   = myChar.name;
      emoji  = myChar.emoji ?? null;
      team   = myChar.team  ?? null;
    } else {
      // Usa o apelido/nome do Discord como fallback
      name      = discordMember.displayName ?? discordMember.user?.username ?? 'Desconhecido';
      discordId = discordMember.id;
    }
  }

  // Remove entrada anterior do mesmo personagem/jogador
  combat.order = combat.order.filter(e =>
    (charId ? e.charId !== charId : e.discordId !== discordId)
  );

  combat.order.push({ charId, name, emoji, team, initiative: value, discordId });

  await initiativeStore.save(guildId, channelId, combat);

  const nameLabel = emoji ? `${emoji} **${name}**` : `**${name}**`;
  const teamLabel = team ? ` [${team}]` : '';
  return `🎲 ${rollLabel} = **${value}** → Iniciativa de ${nameLabel}${teamLabel} registrada!`;
}

module.exports = { handleInitiative };
