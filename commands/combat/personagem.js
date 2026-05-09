// ============================================================
//  Chaos RPG Bot — /personagem
//  Criação, edição e gerenciamento de personagens.
//  Personagem ativo é por sessão.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const characterStore          = require('../../utils/characterStore');
const rpgStore                = require('../../utils/rpgSessionStore');
const { resolveOrReply }      = require('../../utils/sessionResolver');
const { formatFullStatus }    = require('../../utils/statusEngine');

function isMaster(member) {
  const cargo = process.env.MASTER_ROLE ?? 'Mestre';
  return member.roles.cache.some(r => r.name === cargo);
}

// ── Opções reutilizáveis ──────────────────────────────────────

function addCombatOptions(sub) {
  return sub
    .addIntegerOption(o => o.setName('hp').setDescription('HP máximo').setMinValue(1))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji do personagem (opcional)'))
    .addStringOption(o => o.setName('time').setDescription('Emoji/cor do time (ex: 🟢, 🔴)'))
    .addUserOption(o => o.setName('jogador').setDescription('Jogador associado'))
    .addIntegerOption(o => o.setName('escudo').setDescription('Escudo máximo').setMinValue(0))
    .addBooleanOption(o => o.setName('salvaguarda').setDescription('true = escudo bloqueia excedente; false = excedente vai pro HP'))
    .addIntegerOption(o => o.setName('crit_threshold').setDescription('Aviso de HP crítico quando HP ≤ N').setMinValue(0))
    .addStringOption(o => o.setName('overheal').setDescription('Comportamento da cura além do HP máximo')
      .addChoices(
        { name: 'Limitar ao HP máximo',   value: 'cap'    },
        { name: 'Excedente vira escudo',   value: 'shield' },
      ));
}

const data = new SlashCommandBuilder()
  .setName('personagem')
  .setDescription('Gerencia personagens de combate')

  .addSubcommand(s => addCombatOptions(s
    .setName('criar')
    .setDescription('Cria um novo personagem')
    .addStringOption(o => o.setName('nome').setDescription('Nome do personagem').setRequired(true))
    .addIntegerOption(o => o.setName('hp').setDescription('HP máximo').setRequired(true).setMinValue(1))))

  .addSubcommand(s => addCombatOptions(s
    .setName('editar')
    .setDescription('Edita atributos de um personagem')
    .addStringOption(o => o.setName('nome').setDescription('Nome do personagem a editar').setRequired(true)))
    // remove hp obrigatório que veio do addCombatOptions — hp é opcional no editar
  )

  .addSubcommand(s => s
    .setName('remover')
    .setDescription('Remove um personagem')
    .addStringOption(o => o.setName('nome').setDescription('Nome do personagem').setRequired(true)))

  .addSubcommand(s => s
    .setName('ativar')
    .setDescription('Define seu personagem ativo nesta sessão')
    .addStringOption(o => o.setName('nome').setDescription('Nome ou emoji do personagem').setRequired(true))
    .addUserOption(o => o.setName('jogador').setDescription('Jogador alvo (apenas Mestre)')))

  .addSubcommand(s => s
    .setName('ver')
    .setDescription('Exibe o status de um personagem')
    .addStringOption(o => o.setName('nome').setDescription('Nome, emoji ou @jogador').setRequired(true)))

  .addSubcommand(s => s
    .setName('meus')
    .setDescription('Lista todos os seus personagens'))

  .addSubcommand(s => s
    .setName('listar')
    .setDescription('Lista todos os personagens da sessão'));

// ── Executor ──────────────────────────────────────────────────

async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const master  = isMaster(interaction.member);

  await interaction.deferReply({ ephemeral: true });

  // ── meus — sem precisar de sessão ─────────────────────────
  if (sub === 'meus') {
    const meus = await characterStore.getByPlayer(guildId, interaction.user.id);
    if (meus.length === 0) {
      await interaction.editReply('📭 Você não tem personagens criados.\nUse `/personagem criar` para começar.');
      return;
    }
    const lines = [`👤 **Seus personagens (${meus.length}):**`, ''];
    for (const c of meus) {
      const emoji = c.emoji ? `${c.emoji} ` : '';
      const team  = c.team  ? ` ${c.team}`  : '';
      lines.push(`${emoji}**${c.name}**${team} — ❤️ ${c.hp}/${c.hpMax}`);
    }
    await interaction.editReply(lines.join('\n'));
    return;
  }

  // ── criar — sem precisar de sessão ────────────────────────
  if (sub === 'criar') {
    const nome  = interaction.options.getString('nome');
    const hpMax = interaction.options.getInteger('hp');

    const exists = await characterStore.find(guildId, nome);
    if (exists) {
      await interaction.editReply(`❌ Já existe um personagem chamado **${nome}**. Use \`/personagem editar\`.`);
      return;
    }

    // Jogador associado: o próprio autor, a menos que o Mestre especifique outro
    const jogadorOpt = interaction.options.getUser('jogador');
    const discordId  = jogadorOpt
      ? (master ? jogadorOpt.id : interaction.user.id)
      : interaction.user.id;

    const char = {
      name:          nome,
      emoji:         interaction.options.getString('emoji')          ?? null,
      team:          interaction.options.getString('time')           ?? null,
      discordId,
      hp:            hpMax,
      hpMax,
      shield:        0,
      shieldMax:     interaction.options.getInteger('escudo')         ?? 0,
      salvaguarda:   interaction.options.getBoolean('salvaguarda')    ?? false,
      critThreshold: interaction.options.getInteger('crit_threshold') ?? 0,
      overheal:      interaction.options.getString('overheal')        ?? 'cap',
      statuses:      [],
    };

    await characterStore.upsert(guildId, char);
    await interaction.editReply(`✅ **${char.name}** criado!\n\n${formatFullStatus(char)}`);
    return;
  }

  // ── editar ─────────────────────────────────────────────────
  if (sub === 'editar') {
    const nome = interaction.options.getString('nome');
    const char = await characterStore.find(guildId, nome);
    if (!char) { await interaction.editReply(`❌ Personagem \`${nome}\` não encontrado.`); return; }

    // Só o dono ou Mestre pode editar
    if (char.discordId !== interaction.user.id && !master) {
      await interaction.editReply(`❌ Você só pode editar seus próprios personagens.`);
      return;
    }

    const hpMax    = interaction.options.getInteger('hp');
    const emoji    = interaction.options.getString('emoji');
    const time     = interaction.options.getString('time');
    const jogador  = interaction.options.getUser('jogador');
    const escudo   = interaction.options.getInteger('escudo');
    const salvag   = interaction.options.getBoolean('salvaguarda');
    const crit     = interaction.options.getInteger('crit_threshold');
    const overheal = interaction.options.getString('overheal');

    if (hpMax   !== null) { char.hpMax = hpMax; char.hp = Math.min(char.hp, hpMax); }
    if (emoji   !== null) char.emoji         = emoji;
    if (time    !== null) char.team          = time;
    if (jogador !== null && master) char.discordId = jogador.id;
    if (escudo  !== null) char.shieldMax     = escudo;
    if (salvag  !== null) char.salvaguarda   = salvag;
    if (crit    !== null) char.critThreshold = crit;
    if (overheal!== null) char.overheal      = overheal;

    await characterStore.upsert(guildId, char);
    await interaction.editReply(`✅ **${char.name}** atualizado!\n\n${formatFullStatus(char)}`);
    return;
  }

  // ── remover ────────────────────────────────────────────────
  if (sub === 'remover') {
    const nome = interaction.options.getString('nome');
    const char = await characterStore.find(guildId, nome);
    if (!char) { await interaction.editReply(`❌ Personagem \`${nome}\` não encontrado.`); return; }

    if (char.discordId !== interaction.user.id && !master) {
      await interaction.editReply(`❌ Você só pode remover seus próprios personagens.`);
      return;
    }

    await characterStore.remove(guildId, char.id);
    await interaction.editReply(`🗑️ **${char.name}** removido.`);
    return;
  }

  // ── ativar — precisa de sessão ─────────────────────────────
  if (sub === 'ativar') {
    const resolved = await resolveOrReply(interaction);
    if (!resolved) return;
    const { session, sessionId } = resolved;

    const nome       = interaction.options.getString('nome');
    const jogadorOpt = interaction.options.getUser('jogador');

    // Mestre pode ativar para outro jogador; jogador só para si
    const targetId = jogadorOpt && master
      ? jogadorOpt.id
      : interaction.user.id;

    const char = await characterStore.find(guildId, nome);
    if (!char) { await interaction.editReply(`❌ Personagem \`${nome}\` não encontrado.`); return; }

    // NPCs (sem jogador atrelado) não podem ser ativados
    if (!char.discordId) {
      await interaction.editReply(
        `❌ **${char.name}** é um NPC e não pode ser ativado.\n` +
        `Vincule um jogador via \`/personagem editar nome:${char.name} jogador:@alguém\` antes de ativar.`
      );
      return;
    }

    // Valida propriedade: jogador só pode ativar seu próprio personagem
    if (char.discordId !== targetId && !master) {
      await interaction.editReply(`❌ Você só pode ativar seus próprios personagens.`);
      return;
    }

    if (!session.activeChars) session.activeChars = {};
    session.activeChars = characterStore.setActive(session.activeChars, targetId, char.id);
    await rpgStore.saveSession(guildId, sessionId, session);

    const nameLabel = char.emoji ? `${char.emoji} **${char.name}**` : `**${char.name}**`;
    const forLabel  = jogadorOpt && master ? ` para <@${targetId}>` : '';
    await interaction.editReply(
      `✅ Personagem ativo${forLabel} definido como ${nameLabel} nesta sessão.\n\n${formatFullStatus(char)}`
    );
    return;
  }

  // ── ver ────────────────────────────────────────────────────
  if (sub === 'ver') {
    const query = interaction.options.getString('nome');

    // Tenta resolver sessão para usar activeChars, mas não bloqueia se não houver
    let activeChars = {};
    const resolved = await rpgStore.resolveSession(guildId, interaction.channelId);
    if (resolved) activeChars = resolved.session.activeChars ?? {};

    const char = await characterStore.find(guildId, query, activeChars);
    if (!char) { await interaction.editReply(`❌ Personagem \`${query}\` não encontrado.`); return; }

    await interaction.editReply(formatFullStatus(char));
    return;
  }

  // ── listar ─────────────────────────────────────────────────
  if (sub === 'listar') {
    const all = await characterStore.getAll(guildId);
    if (all.length === 0) {
      await interaction.editReply('📭 Nenhum personagem criado. Use `/personagem criar`.');
      return;
    }

    // Tenta pegar activeChars da sessão atual
    let activeChars = {};
    const resolved = await rpgStore.resolveSession(guildId, interaction.channelId);
    if (resolved) activeChars = resolved.session.activeChars ?? {};

    const lines = [`👥 **Personagens (${all.length}):**`, ''];
    for (const c of all) {
      const emoji     = c.emoji ? `${c.emoji} ` : '';
      const team      = c.team  ? ` ${c.team}`  : '';
      const owner     = c.discordId ? ` <@${c.discordId}>` : '';
      const isActive  = Object.values(activeChars).includes(c.id);
      const activeTag = isActive ? ' ⚡' : '';
      lines.push(`${emoji}**${c.name}**${team}${owner}${activeTag} — ❤️ ${c.hp}/${c.hpMax}`);
    }

    lines.push('', '*⚡ = personagem ativo nesta sessão*');
    await interaction.editReply(lines.join('\n'));
  }
}

module.exports = { data, execute };
