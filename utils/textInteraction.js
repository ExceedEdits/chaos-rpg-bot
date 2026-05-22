// ============================================================
//  Chaos RPG Bot — Text Interaction Adapter
//  Simula o objeto interaction do discord.js para que handlers
//  de slash commands possam ser chamados via mensagens de texto.
// ============================================================

/**
 * Adaptador de opções — imita interaction.options do discord.js.
 */
class TextOptions {
  constructor(opts, subcommand, group, message) {
    this._opts = opts;
    this._sub  = subcommand;
    this._grp  = group;
    this._msg  = message;
  }

  getSubcommand()         { return this._sub ?? null; }
  getSubcommandGroup()    { return this._grp ?? null; }

  _get(name) {
    // Tenta encontrar a chave ignorando maiúsculas
    const lower = name.toLowerCase();
    return this._opts[lower] ?? this._opts[name] ?? null;
  }

  getString(name)  { return this._get(name); }

  getInteger(name) {
    const v = this._get(name);
    if (v === null || v === undefined) return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  getNumber(name) {
    const v = this._get(name);
    if (v === null || v === undefined) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  getBoolean(name) {
    const v = this._get(name);
    if (v === null) return null;
    return v === 'true' || v === 'sim' || v === '1' || v === 'yes';
  }

  getChannel(name) {
    const v = this._get(name);
    if (!v) return null;
    // Mention: <#channelId>
    const mentionMatch = v.match(/^<#(\d+)>$/);
    if (mentionMatch) {
      return this._msg.client.channels.cache.get(mentionMatch[1]) ?? null;
    }
    // Hash + nome: #nome-do-canal
    const nameStr = v.startsWith('#') ? v.slice(1) : v;
    return this._msg.guild?.channels.cache.find(c => c.name === nameStr) ?? null;
  }

  getUser(name) {
    const v = this._get(name);
    if (!v) return null;
    const mentionMatch = v.match(/^<@!?(\d+)>$/);
    if (mentionMatch) {
      return this._msg.client.users.cache.get(mentionMatch[1]) ?? null;
    }
    return null;
  }
}

/**
 * Adaptador principal — imita o objeto interaction do discord.js.
 *
 * Uso:
 *   const ctx = new TextInteraction(message, { subcommand, group, options });
 *   await cmdHandler.execute(ctx, client);
 */
class TextInteraction {
  constructor(message, { subcommand = null, group = null, options = {} } = {}) {
    this.guildId   = message.guildId;
    this.channelId = message.channelId;
    this.channel   = message.channel;
    this.member    = message.member;
    this.user      = message.author;
    this.client    = message.client;
    this.guild     = message.guild;

    this._msg      = message;
    this._replyMsg = null;
    this.deferred  = false;
    this._replied  = false;

    this.options = new TextOptions(options, subcommand, group, message);
  }

  get replied() { return this._replied; }

  // deferReply é no-op: a resposta vai quando editReply for chamado
  async deferReply() {
    this.deferred = true;
  }

  _buildPayload(data) {
    if (typeof data === 'string') return { content: data };
    const { content = '', components, embeds, files } = data ?? {};
    const payload = {};
    if (content)    payload.content    = content;
    if (components) payload.components = components;
    if (embeds)     payload.embeds     = embeds;
    if (files)      payload.files      = files;
    return payload;
  }

  async reply(data) {
    if (this._replied) return;
    const payload = this._buildPayload(data);
    if (!Object.keys(payload).length) return;
    // Mensagens de texto não suportam ephemeral — ignoramos silenciosamente
    this._replyMsg = await this._msg.reply(payload);
    this._replied  = true;
    this.deferred  = false;
  }

  async editReply(data) {
    const payload = this._buildPayload(data);
    if (!Object.keys(payload).length) return;

    if (this._replyMsg) {
      try {
        await this._replyMsg.edit(payload);
        return;
      } catch { /* mensagem deletada — posta nova */ }
    }

    this._replyMsg = await this._msg.reply(payload);
    this._replied  = true;
    this.deferred  = false;
  }

  async followUp(data) {
    if (typeof data === 'string') {
      await this._msg.reply({ content: data });
      return;
    }
    const { content = '', components, embeds, files } = data ?? {};
    const payload = {};
    if (content)    payload.content    = content;
    if (components) payload.components = components;
    if (embeds)     payload.embeds     = embeds;
    if (files)      payload.files      = files;
    if (!Object.keys(payload).length) return;
    await this._msg.reply(payload);
  }

  // isChatInputCommand é verificado por alguns lugares — retorna true
  isChatInputCommand() { return true; }
}

module.exports = { TextInteraction };
