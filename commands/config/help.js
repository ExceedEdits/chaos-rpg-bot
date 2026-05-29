// ============================================================
//  Chaos RPG Bot — /help
//  Exibe link do site + select menu interativo por comando.
// ============================================================

const {
  SlashCommandBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} = require('discord.js');

const SITE_URL = 'https://exceededits.github.io/chaos-rpg-site/';

const CATEGORIES = {
  '🎲 Dados':   ['rolar', 'tag'],
  '⚔️ Combate': ['turno', 'iniciativa', 'status', 'dano', 'curar', 'escudo', 'vida', 'personagem', 'npc'],
  '🗺️ Mapa':    ['mapa'],
  '🎵 Música':  ['play', 'pause', 'resume', 'skip', 'back', 'restart', 'stop', 'queue', 'remove', 'shuffle', 'clear', 'loop', 'move'],
  '⚙️ Config':  ['config', 'rpg'],
};

// ── Descrições ricas com exemplos ────────────────────────────
// Cada entrada tem: desc (descrição geral) e uso (lista de exemplos)
const COMMAND_DETAILS = {
  // ── Dados ─────────────────────────────────────────────────
  rolar: {
    desc: 'Rola dados com suporte a expressões aritméticas, múltiplos dados e tags de combate. Você também pode digitar a expressão diretamente no chat (sem o comando) se o listener estiver ativo.',
    uso: [
      '`/rolar expressao:2d6+5` — rola 2d6 e soma 5',
      '`/rolar expressao:1d20 iniciativa Ada` — rola e registra na iniciativa de Ada',
      '`/rolar expressao:3d8 dano Goblin` — aplica dano ao NPC Goblin',
      '`/rolar expressao:1d6 curar Thorin` — cura o personagem Thorin',
      'No chat: `2d6+5`, `1d20 crítico`, `4d6 drop lowest`',
    ],
  },
  tag: {
    desc: 'Cria tags customizadas que modificam o comportamento das rolagens — rola repetindo até atingir uma condição (mínimo, máximo, valor específico, etc.). Requer cargo de Mestre para criar/deletar.',
    uso: [
      '`/tag criar nome:foco condicoes:max exibicao:Todas as tentativas` — rola até tirar o máximo',
      '`/tag criar nome:explode condicoes:gatilho:6:1d6 exibicao:Todas + destacar o melhor` — ao tirar 6, rola 1d6 extra',
      '`/tag criar nome:sorte condicoes:valor:20,tentativas:3 exibicao:Todas as tentativas` — para ao tirar 20 ou após 3 tentativas',
      '`/tag listar` — mostra todas as tags do servidor',
      '`/tag deletar nome:foco` — remove a tag',
      'Usando: `1d20 foco Ada` — rola com a tag "foco" para Ada',
    ],
  },

  // ── Combate ───────────────────────────────────────────────
  turno: {
    desc: 'Gerencia o sistema de turnos de combate. Exibe um tracker com personagens, NPCs, HP, escudo e status ativos. O Mestre controla o fluxo dos turnos.',
    uso: [
      '`/turno iniciar` — inicia o combate com os personagens da iniciativa',
      '`/turno avancar` — avança para o próximo turno na ordem',
      '`/turno ver` — exibe o tracker de turno atual',
      '`/turno adicionar nome:Goblin` — adiciona participante ao combate em andamento',
      '`/turno remover nome:Goblin` — remove participante do combate',
      '`/turno encerrar` — encerra o combate e limpa o tracker',
    ],
  },
  iniciativa: {
    desc: 'Gerencia a ordem de iniciativa do combate. Os jogadores podem rolar sua iniciativa diretamente no chat (ex: `1d20 iniciativa NomeDoPersonagem`) ou o Mestre pode adicionar manualmente.',
    uso: [
      '`/iniciativa adicionar nome:Goblin valor:14` — adiciona com valor fixo',
      '`/iniciativa adicionar nome:Goblin valor:14 turnos:2` — NPC com 2 turnos por rodada',
      '`/iniciativa ver` — exibe a ordem atual',
      '`/iniciativa remover nome:Goblin` — remove da iniciativa',
      '`/iniciativa limpar` — apaga toda a ordem de iniciativa',
      'No chat: `1d20 iniciativa Ada` — rola e insere Ada automaticamente',
    ],
  },
  status: {
    desc: 'Aplica, remove e lista status em personagens e NPCs. Status podem ter duração em rodadas e efeitos automáticos (dano, cura ou escudo por rodada) processados no tracker de turno.',
    uso: [
      '`/status aplicar personagem:Ada nome:Veneno duracao:3 efeito:⚔️ Dano valor:5` — envenena Ada por 3 rodadas (5 dano/rodada)',
      '`/status aplicar personagem:Thorin nome:Bênção duracao:2 efeito:💚 Cura valor:3` — cura 3 HP por rodada',
      '`/status aplicar personagem:Ada nome:Atordoado` — status sem duração (permanente até remover)',
      '`/status aplicar personagem:Ada nome:Bênção fonte:"Sacerdotisa"` — registra a origem do status',
      '`/status remover personagem:Ada nome:Veneno` — remove o status',
      '`/status ver personagem:Ada` — lista todos os status ativos',
    ],
  },
  dano: {
    desc: 'Aplica dano a um personagem ou NPC. O escudo absorve dano primeiro. Exibe o HP atual e eventos especiais (morte, crítico).',
    uso: [
      '`/dano personagem:Ada valor:15` — aplica 15 de dano em Ada',
      '`/dano personagem:Goblin valor:8` — aplica 8 de dano no NPC Goblin',
      '`/dano personagem:🗡️ valor:10` — identifica pelo emoji do personagem',
    ],
  },
  curar: {
    desc: 'Cura um personagem ou NPC, restaurando HP até o máximo definido.',
    uso: [
      '`/curar personagem:Thorin valor:12` — cura 12 HP de Thorin',
      '`/curar personagem:@jogador valor:20` — cura pelo @menção do jogador',
    ],
  },
  escudo: {
    desc: 'Define o valor do escudo de um personagem. O escudo absorve dano antes do HP.',
    uso: [
      '`/escudo personagem:Ada valor:10` — define escudo de Ada como 10',
      '`/escudo personagem:Ada valor:0` — remove o escudo',
    ],
  },
  vida: {
    desc: 'Define o HP atual de um personagem diretamente (sem calcular dano/cura).',
    uso: [
      '`/vida personagem:Ada valor:50` — seta HP de Ada para 50',
      '`/vida personagem:Goblin valor:0` — marca como morto',
    ],
  },
  personagem: {
    desc: 'Criação e gerenciamento de fichas de personagem. Cada jogador pode criar seus personagens e ativá-los por sessão.',
    uso: [
      '`/personagem criar nome:Ada hp:60 emoji:🗡️` — cria personagem com HP máximo 60',
      '`/personagem criar nome:Thorin hp:80 crit:20` — cria com limiar crítico em 20',
      '`/personagem editar nome:Ada campo:hp valor:70` — edita HP máximo para 70',
      '`/personagem ativar nome:Ada` — ativa Ada na sessão deste canal',
      '`/personagem ver nome:Ada` — exibe ficha completa',
      '`/personagem meus` — lista seus personagens',
      '`/personagem listar` — lista todos os personagens do servidor (Mestre)',
      '`/personagem remover nome:Ada` — deleta o personagem',
    ],
  },
  npc: {
    desc: 'Criação e gerenciamento de NPCs pelo Mestre. NPCs têm HP, escudo, emoji e podem ser replicados com sufixos.',
    uso: [
      '`/npc criar nome:Goblin hp:30 emoji:👺` — cria NPC',
      '`/npc criar nome:Ogro hp:80 crit:25` — com limiar crítico',
      '`/npc ver nome:Goblin` — exibe ficha do NPC',
      '`/npc editar nome:Goblin campo:hp valor:40` — edita campo',
      '`/npc replicar nome:Goblin quantidade:3` — cria Goblin-1, Goblin-2, Goblin-3',
      '`/npc resetar nome:Goblin` — restaura HP e escudo ao máximo',
      '`/npc listar` — lista todos os NPCs',
      '`/npc remover nome:Goblin` — deleta o NPC',
    ],
  },

  // ── Mapa ──────────────────────────────────────────────────
  mapa: {
    desc: 'Sistema completo de mapa de combate em grid. Suporta terrenos, personagens, NPCs, inimigos, itens, efeitos de área, cobertura e submatrizes. O mapa é renderizado como imagem diretamente no canal.',
    uso: [
      '`/mapa criar nome:Floresta linhas:10 colunas:10` — cria novo mapa 10×10',
      '`/mapa mostrar` — exibe o mapa atual da sessão',
      '`/mapa carregar nome:Floresta` — carrega um mapa salvo',
      '`/mapa personagem adicionar nome:Ada posicao:A1` — posiciona personagem em A1',
      '`/mapa npc adicionar nome:Goblin posicao:C5` — posiciona NPC',
      '`/mapa item adicionar nome:Tocha posicao:B3 emoji:🕯️` — adiciona item no mapa',
      '`/mapa terreno atualizar posicao:D4 tipo:parede` — define célula como parede',
      '`/mapa efeito adicionar posicao:A1 raio:2 emoji:🔥 nome:Chamas` — efeito de área',
      '`/mapa mover nome:Ada destino:B2` — move personagem para B2',
      '`/mapa cobertura adicionar de:Ada para:Goblin` — marca linha de cobertura',
      '`/mapa listar` — lista todos os mapas salvos',
      '`/mapa config` — configura exibição do mapa',
    ],
  },

  // ── Música ────────────────────────────────────────────────
  play: {
    desc: 'Toca músicas do YouTube ou Spotify. Aceita links diretos, playlists, álbuns ou busca por nome. Se o YouTube bloquear, usa o SoundCloud automaticamente como fallback.',
    uso: [
      '`/play query:Never Gonna Give You Up` — busca no YouTube',
      '`/play query:https://youtu.be/dQw4w9WgXcQ` — link direto do YouTube',
      '`/play query:https://open.spotify.com/track/...` — faixa do Spotify',
      '`/play query:https://open.spotify.com/playlist/...` — playlist do Spotify',
      '`/play query:https://www.youtube.com/playlist?list=...` — playlist do YouTube',
      '`/play query:https://open.spotify.com/album/...` — álbum do Spotify',
    ],
  },
  pause: {
    desc: 'Pausa a reprodução atual sem remover da fila.',
    uso: ['`/pause` — pausa a música'],
  },
  resume: {
    desc: 'Retoma a reprodução se estiver pausada.',
    uso: ['`/resume` — continua a música de onde parou'],
  },
  skip: {
    desc: 'Pula para a próxima música da fila.',
    uso: ['`/skip` — avança para a próxima faixa'],
  },
  back: {
    desc: 'Volta para a música anterior (do histórico).',
    uso: ['`/back` — retorna à faixa anterior'],
  },
  restart: {
    desc: 'Reinicia a música atual do início.',
    uso: ['`/restart` — recomeça a faixa atual'],
  },
  stop: {
    desc: 'Para a reprodução, limpa a fila e desconecta o bot do canal de voz.',
    uso: ['`/stop` — para tudo e sai do canal'],
  },
  queue: {
    desc: 'Exibe a fila de músicas com paginação (10 por página). Mostra a faixa atual e as próximas.',
    uso: [
      '`/queue` — exibe a primeira página',
      '`/queue pagina:3` — exibe a terceira página',
    ],
  },
  remove: {
    desc: 'Remove uma música específica da fila pelo número de posição.',
    uso: [
      '`/remove posicao:3` — remove a 3ª música da fila',
    ],
  },
  shuffle: {
    desc: 'Embaralha aleatoriamente a ordem das músicas na fila (algoritmo Fisher-Yates). A música atual continua tocando.',
    uso: ['`/shuffle` — embaralha a fila'],
  },
  clear: {
    desc: 'Limpa toda a fila sem parar a música que está tocando.',
    uso: ['`/clear` — esvazia a fila, mantém a música atual'],
  },
  loop: {
    desc: 'Ativa ou desativa o modo de repetição.',
    uso: [
      '`/loop track` — 🔂 repete a música atual indefinidamente',
      '`/loop queue` — 🔁 repete a fila inteira em loop contínuo',
      '`/loop disable` — desativa o loop e volta ao modo normal',
    ],
  },
  move: {
    desc: 'Move uma música de uma posição para outra dentro da fila.',
    uso: [
      '`/move posicao:35 destino:1` — move a 35ª música para o topo da fila',
      '`/move posicao:2 destino:10` — move a 2ª para a posição 10',
    ],
  },

  // ── Config ────────────────────────────────────────────────
  config: {
    desc: 'Configurações gerais do bot para este servidor. Requer permissão de administrador ou Mestre.',
    uso: [
      '`/config ver` — exibe todas as configurações atuais',
      '`/config cargo-mestre cargo:@Mestre` — define o cargo que concede permissões de Mestre',
      '`/config canal canal:#música` — define o canal padrão de anúncios de música',
      '`/config prefixo prefixo:!` — muda o prefixo dos comandos de texto (padrão: `!`)',
      '`/config listener-dado estado:Inativo` — desativa o listener de dado (bot para de responder a rolagens no chat)',
      '`/config tracker canal:#combate` — define o canal onde o tracker de turno é exibido',
    ],
  },
  rpg: {
    desc: 'Gerencia sessões de RPG. Uma sessão conecta personagens, NPCs, mapas e turnos a um canal específico. O Mestre cria e administra sessões.',
    uso: [
      '`/rpg criar id:campanha-principal` — cria nova sessão e vincula ao canal atual',
      '`/rpg listar` — lista todas as sessões do servidor',
      '`/rpg entrar id:campanha-principal` — vincula este canal a uma sessão existente',
      '`/rpg encerrar` — desvincula o canal da sessão',
      '`/rpg status estado:🟢 Ativa` — marca a sessão como ativa ou offline',
      '`/rpg deletar id:campanha-principal` — deleta a sessão permanentemente',
      '`/rpg configurar status_tracker:Mostrar decremento:Por rodada` — ajusta exibição do tracker',
    ],
  },
};

// ── Helpers exportados (usados também em index.js) ────────────

function buildSelectMenu(commands) {
  const options = [];
  for (const [cat, names] of Object.entries(CATEGORIES)) {
    for (const name of names) {
      const cmd = commands.get(name);
      if (!cmd) continue;
      const json = cmd.data.toJSON();
      const desc = `${cat} — ${json.description}`.slice(0, 100);
      options.push(
        new StringSelectMenuOptionBuilder()
          .setValue(name)
          .setLabel(`/${name}`)
          .setDescription(desc),
      );
    }
  }
  return new StringSelectMenuBuilder()
    .setCustomId('help:select')
    .setPlaceholder('Selecione um comando para ver detalhes...')
    .addOptions(options);
}

function buildCommandDetail(commands, name) {
  const cmd = commands.get(name);
  if (!cmd) return `❌ Comando \`/${name}\` não encontrado.`;

  const json    = cmd.data.toJSON();
  const details = COMMAND_DETAILS[name];
  const lines   = [`### \`/${json.name}\``, json.description];

  if (details) {
    lines.push('', details.desc);
    if (details.uso?.length) {
      lines.push('', '**Exemplos:**');
      for (const ex of details.uso) lines.push(`  ${ex}`);
    }
  } else {
    // Fallback: subcomandos do schema
    const subcmds = (json.options ?? []).filter(o => o.type === 1);
    const groups  = (json.options ?? []).filter(o => o.type === 2);
    const params  = (json.options ?? []).filter(o => o.type !== 1 && o.type !== 2);

    if (params.length > 0) {
      lines.push('', '**Parâmetros:**');
      for (const p of params) {
        const req = p.required ? ' \\*' : '';
        lines.push(`  \`${p.name}${req}\` — ${p.description}`);
      }
    }
    if (subcmds.length > 0) {
      lines.push('', '**Subcomandos:**');
      for (const sub of subcmds)
        lines.push(`  • \`/${json.name} ${sub.name}\` — ${sub.description}`);
    }
    for (const grp of groups) {
      lines.push('', `**\`/${json.name} ${grp.name}:\`**`);
      for (const sub of (grp.options ?? []).filter(o => o.type === 1))
        lines.push(`  • \`/${json.name} ${grp.name} ${sub.name}\` — ${sub.description}`);
    }
  }

  lines.push('', `📖 Documentação completa: <${SITE_URL}>`);
  return lines.join('\n');
}

function baseContent() {
  return `📖 **Chaos RPG Bot** — Documentação: <${SITE_URL}>\n\nSelecione um comando abaixo para ver seus detalhes:`;
}

// ── Comando ───────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Lista todos os comandos disponíveis do bot');

async function execute(interaction, client) {
  const select = buildSelectMenu(client.commands);
  const row    = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content:    baseContent(),
    components: [row],
    flags:      MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute, buildSelectMenu, buildCommandDetail, baseContent };
