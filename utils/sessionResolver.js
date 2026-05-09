// ============================================================
//  Chaos RPG Bot — Session Resolver
//  Helper usado por todos os comandos para obter a sessão ativa
//  do canal e retornar erro padronizado se não houver nenhuma.
// ============================================================

const rpgStore = require('./rpgSessionStore');

/**
 * Resolve a sessão ativa para uma interação.
 * Se não houver sessão vinculada ao canal, envia uma reply de erro
 * e retorna null — o comando deve retornar imediatamente.
 *
 * Uso:
 *   const resolved = await resolveOrReply(interaction);
 *   if (!resolved) return;
 *   const { session, sessionId } = resolved;
 *
 * @returns {{ session, sessionId } | null}
 */
async function resolveOrReply(interaction) {
  const resolved = await rpgStore.resolveSession(
    interaction.guildId,
    interaction.channelId
  );

  if (!resolved) {
    const msg = {
      content: '❌ Nenhuma sessão RPG ativa neste canal.\nUse `/rpg criar` para criar uma ou `/rpg entrar` para vincular uma existente.',
      ephemeral: true,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply(msg);
    }
    return null;
  }

  return resolved;
}

module.exports = { resolveOrReply };
