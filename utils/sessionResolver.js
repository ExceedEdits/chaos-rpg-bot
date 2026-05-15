// ============================================================
//  Chaos RPG Bot — Session Resolver + Permission Helpers
// ============================================================

const rpgStore = require('./rpgSessionStore');

// ── Permissões ────────────────────────────────────────────────

/**
 * Verifica se o member tem o cargo de Mestre (ou é admin).
 */
function isMaster(member) {
  return member.permissions.has('Administrator')
      || member.roles.cache.some(r => r.name === (process.env.MASTER_ROLE ?? 'Mestre'));
}

/**
 * Verifica se o member é o Mestre dono da sessão.
 * Admins do servidor passam sempre.
 * Mestres só passam se forem o criador da sessão (session.masterId).
 */
function isSessionMaster(member, session) {
  if (member.permissions.has('Administrator')) return true;
  if (!isMaster(member)) return false;
  return session.masterId === member.id;
}

/**
 * Envia reply de "sem permissão de dono da sessão" e retorna false.
 * Retorna true se o member for o dono (ou admin) — o comando pode prosseguir.
 */
async function requireSessionMaster(interaction, session) {
  if (isSessionMaster(interaction.member, session)) return true;
  const msg = { content: '❌ Apenas o Mestre que criou esta sessão (ou um administrador) pode fazer isso.', ephemeral: true };
  if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
  else await interaction.reply(msg);
  return false;
}

// ── Resolver ──────────────────────────────────────────────────

/**
 * Resolve a sessão ativa para uma interação.
 * Se não houver sessão vinculada ao canal, envia reply de erro e retorna null.
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

module.exports = { isMaster, isSessionMaster, requireSessionMaster, resolveOrReply };
