# Chaos RPG Bot

Bot de Discord para sessões de TTRPG — gerencia combate, mapas, iniciativa, personagens, NPCs e música. Suporta múltiplos servidores simultaneamente com dados isolados por servidor.

📖 **Documentação completa:** https://exceededits.github.io/chaos-rpg-site/

---

## Sumário

- [Stack](#stack)
- [Setup local](#setup-local)
- [Deploy no Railway](#deploy-no-railway)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Comandos](#comandos)
  - [Dados](#-dados)
  - [Combate](#️-combate)
  - [Mapa](#️-mapa)
  - [Música](#-música)
  - [Sessão RPG](#️-sessão-rpg)
  - [Configurações](#️-configurações)
- [Comandos de texto (prefixo)](#comandos-de-texto-prefixo)
- [Rolagem em mensagens](#rolagem-em-mensagens)
- [Estrutura de arquivos](#estrutura-de-arquivos)

---

## Stack

| Componente | Tecnologia |
|---|---|
| Runtime | Node.js 20 |
| Discord | discord.js v14 |
| Banco de dados | MongoDB Atlas (ou JSON local em dev) |
| Áudio | yt-dlp + ffmpeg |
| Hospedagem | Railway (Dockerfile) |

---

## Setup local

### Pré-requisitos
- Node.js v18+
- Conta no [Discord Developer Portal](https://discord.com/developers/applications)

### 1. Criar o bot

1. Developer Portal → **New Application**
2. **Bot** → copie o **Token**
3. **Bot → Privileged Gateway Intents** → ative **Message Content Intent**
4. **OAuth2 → URL Generator** → marque `bot` e `applications.commands`
5. Permissões: `Send Messages`, `Read Messages`, `Manage Messages`, `Connect`, `Speak`, `Use External Emojis`

### 2. Instalar e configurar

```bash
git clone https://github.com/ExceedEdits/chaos-rpg-bot.git
cd chaos-rpg-bot
npm install
cp .env.example .env
# edite .env com suas credenciais
```

Para dev local sem MongoDB, use `USE_LOCAL_DATA=true` — os dados ficam em `data/*.json`.

### 3. Spotify (opcional)

Para suporte a playlists e álbuns do Spotify:

1. Crie um app em [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Em **Redirect URIs**, adicione: `https://exceededits.github.io/chaos-rpg-site/spotify-callback.html`
3. Adicione `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` e `SPOTIFY_REDIRECT_URI` ao `.env`
4. Gere o refresh token:
   ```bash
   node scripts/spotify-auth.js
   ```
5. Adicione o token gerado como `SPOTIFY_REFRESH_TOKEN` no `.env`

### 4. Iniciar

```bash
npm start
# modo dev com reload automático:
npm run dev
```

---

## Deploy no Railway

O projeto inclui um `Dockerfile` que instala automaticamente todas as dependências do sistema (python3, ffmpeg, libopus, ca-certificates). O Railway detecta o arquivo e usa Docker diretamente.

**Passos:**

1. Crie um novo serviço no Railway e conecte o repositório GitHub
2. Configure as variáveis de ambiente em **Settings → Variables**
3. O deploy é acionado automaticamente a cada push

> **Importante:** Não defina `GUILD_ID` em produção — os slash commands serão registrados globalmente em todos os servidores.

**MongoDB Atlas:** Vá em **Security → Network Access** e adicione `0.0.0.0/0` para permitir conexões do Railway (IPs dinâmicos).

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha os valores. No Railway, configure em **Settings → Variables**.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Token do bot |
| `CLIENT_ID` | ✅ | Application ID do bot |
| `MONGODB_URI` | ✅* | URI do MongoDB Atlas (`mongodb+srv://...`) |
| `USE_LOCAL_DATA` | — | `true` = JSON local (dev); `false` = MongoDB |
| `GUILD_ID` | — | ID do servidor para registro instantâneo (dev only) |
| `SPOTIFY_CLIENT_ID` | — | Client ID do app Spotify |
| `SPOTIFY_CLIENT_SECRET` | — | Client Secret do app Spotify |
| `SPOTIFY_REDIRECT_URI` | — | URI de redirecionamento OAuth |
| `SPOTIFY_REFRESH_TOKEN` | — | Refresh token do Spotify |
| `MASTER_ROLE` | — | Nome do cargo Mestre como fallback (padrão: `Mestre`) |

*Não obrigatória com `USE_LOCAL_DATA=true`.

---

## Comandos

> 🔒 Mestre ou Administrador · 👑 Dono da sessão ou Administrador · Todos isolados por servidor.

---

### 🎲 Dados

#### `/rolar expressao:`
Rola dados e expressões matemáticas.

| Exemplo | O que faz |
|---|---|
| `2d6` | Rola 2 dados de 6 lados |
| `1d20+5` | Rola com modificador |
| `(d20+5)*2` | Expressão com parênteses |
| `4df` | Dados Fate (−/0/+) |
| `3#d6` | 3 grupos independentes |
| `&15 dano Ada` | Aplica 15 de dano ao personagem Ada |
| `1d20 iniciativa Ada` | Adiciona Ada na iniciativa com o resultado |

Também funciona em mensagens normais — veja [Rolagem em mensagens](#rolagem-em-mensagens).

---

#### `/tag criar · deletar · listar`

Tags são atalhos para expressões de dados configuradas por servidor.

| Subcomando | Permissão | Descrição |
|---|---|---|
| `criar nome: expressao: condicoes: exibicao:` | 🔒 | Cria ou atualiza uma tag |
| `deletar nome:` | 🔒 | Remove uma tag |
| `listar` | — | Lista todas as tags do servidor |

**Condições disponíveis para tags:**

| Condição | Sintaxe | Comportamento |
|---|---|---|
| Mínimo | `min` | Para ao sair 1 |
| Máximo | `max` | Para ao sair o valor máximo |
| Min ou Max | `minoumax` | Para ao sair 1 ou o máximo |
| Valor | `valor:N` | Para ao sair N |
| Tentativas | `tentativas:N` | Para após N rolagens |
| Gatilho | `gatilho:N:XdY` | Ao sair N, rola XdY como bônus |
| Texto | `texto:N:Mensagem` | Ao sair N, exibe a mensagem |

Múltiplas condições separadas por vírgula: `max,tentativas:5,gatilho:6:1d8`

```
/tag criar nome:explodir expressao:1d6 condicoes:max,tentativas:5 exibicao:all
2d6 explodir Ada
```

---

### ⚔️ Combate

#### `/personagem criar · editar · remover · ativar · ver · meus · listar`

| Subcomando | Permissão | Descrição |
|---|---|---|
| `criar nome: hp:` | 🔒 | Cria um personagem |
| `editar nome:` | 🔒 | Edita atributos |
| `remover nome:` | 🔒 | Remove permanentemente |
| `ativar nome:` | — | Define seu personagem ativo na sessão |
| `ver nome:` | — | Exibe HP, escudo e status |
| `meus` | — | Lista seus personagens |
| `listar` | — | Lista todos os personagens da sessão |

**Opções extras de `criar` / `editar`:**

| Opção | Descrição |
|---|---|
| `emoji:` | Emoji representativo |
| `time:` | Emoji de time (ex: 🟢 aliado, 🔴 inimigo) |
| `jogador:` | @usuário associado |
| `escudo:` | Escudo máximo |
| `salvaguarda:` | Se o escudo bloqueia dano excedente |
| `crit_threshold:` | Aviso quando HP ≤ N |
| `overheal:` | O que fazer com cura além do HP máximo (`cap` ou `shield`) |

---

#### `/npc criar · ver · editar · replicar · resetar · listar · remover`

| Subcomando | Permissão | Descrição |
|---|---|---|
| `criar nome: hp:` | 👑 | Cria um NPC |
| `ver nome:` | — | Exibe status do NPC |
| `editar nome:` | 👑 | Edita atributos |
| `replicar nome: quantidade:` | 👑 | Cria N cópias independentes (Goblin A, B, C...) |
| `resetar nome:` | 👑 | Restaura HP e escudo ao máximo |
| `listar` | — | Lista todos com HP (🟢 >50% · 🟡 >25% · 🔴 ≤25%) |
| `remover nome:` | 👑 | Remove (aceita prefixo de grupo ou `todos`) |

```
/npc replicar nome:Goblin quantidade:3 sufixos:A,B,C
/npc resetar nome:Goblin   ← reseta todos que começam com "Goblin"
/npc remover nome:todos
```

---

#### `/dano · /curar · /escudo · /vida`

| Comando | Descrição |
|---|---|
| `/dano personagem: valor:` | Aplica dano (escudo absorve primeiro) |
| `/curar personagem: valor:` | Cura o personagem |
| `/escudo personagem: valor:` | Define o valor do escudo manualmente |
| `/vida personagem: valor:` | Define HP atual diretamente |

Busca por nome, emoji ou @menção do jogador.

---

#### `/status aplicar · remover · ver`

| Subcomando | Descrição |
|---|---|
| `aplicar personagem: nome: duracao: efeito: valor: fonte:` | Aplica efeito de status |
| `remover personagem: nome:` | Remove um status específico |
| `ver personagem:` | Lista os status ativos |

| Parâmetro | Descrição |
|---|---|
| `duracao:` | Duração em rodadas — omitir = permanente |
| `efeito:` | `dano`, `cura` ou `escudo` por rodada |
| `valor:` | Obrigatório se `efeito:` definido |
| `fonte:` | Nota sobre a origem |

```
/status aplicar personagem:Ada nome:Veneno duracao:3 efeito:dano valor:5
/status remover personagem:Ada nome:Veneno
```

---

#### `/iniciativa adicionar · remover · limpar · ver`

| Subcomando | Descrição |
|---|---|
| `adicionar nome: valor:` | Adiciona entrada na ordem (fixo para NPCs) |
| `remover nome:` | Remove entradas com esse nome |
| `limpar` | Reseta toda a ordem |
| `ver` | Exibe a ordem atual |

Jogadores podem registrar iniciativa diretamente em mensagens: `1d20 iniciativa Ada`

O parâmetro `slots:` permite múltiplos turnos por rodada para um mesmo NPC.

---

#### `/turno iniciar · avancar · encerrar · ver · adicionar · remover`

| Subcomando | Permissão | Descrição |
|---|---|---|
| `iniciar` | 🔒 | Ordena pela iniciativa e inicia o combate |
| `avancar` | 🔒 | Avança para o próximo turno e processa status |
| `encerrar` | 🔒 | Encerra o combate e limpa a ordem |
| `ver` | — | Exibe o tracker atual |
| `adicionar nome: valor:` | 🔒 | Adiciona participante ao combate em andamento |
| `remover nome:` | 🔒 | Remove participante do combate |

O tracker exibe a ordem completa, o participante atual em destaque, status ativos e efeitos aplicando. Ao virar a rodada, status com duração são decrementados e os expirados são anunciados.

Configure o canal e o comportamento do tracker em `/config canal` e `/config tracker`.

---

### 🗺️ Mapa

#### `/mapa mostrar · atualizar · listar · terreno · remover`

| Subcomando | Permissão | Descrição |
|---|---|---|
| `mostrar` | — | Exibe o mapa ativo no canal configurado |
| `atualizar` | 🔒 | Força re-renderização da mensagem do mapa |
| `listar` | — | Lista os mapas disponíveis na sessão |
| `terreno tipo: x: y:` | 👑 | Define o terreno de uma célula do grid |
| `remover nome:` | 👑 | Remove um elemento do mapa |

O mapa é um grid de até 10×10 células. Colunas usam emojis regionais (🇦–🇯) e linhas usam emojis numéricos (1️⃣–🔟).

---

### 🎵 Música

O bot entra no canal de voz do usuário ao usar `/play`. Todos os estados de fila e conexão são isolados por servidor.

#### Comandos de reprodução

| Comando | Descrição |
|---|---|
| `/play query:` | Toca música, playlist ou álbum (YouTube ou Spotify) |
| `/pause` | Pausa a reprodução |
| `/resume` | Retoma a reprodução pausada |
| `/skip` | Pula para a próxima faixa |
| `/back` | Volta para a faixa anterior |
| `/restart` | Reinicia a faixa atual do início |
| `/stop` | Para a música, limpa a fila e sai do canal de voz |

#### Fila

| Comando | Descrição |
|---|---|
| `/queue` | Exibe a fila paginada (10 faixas por página) |
| `/remove posicao:` | Remove uma faixa da fila pelo número |
| `/shuffle` | Embaralha a ordem da fila |
| `/clear` | Limpa a fila sem parar a faixa atual |

**Formatos aceitos pelo `/play`:**

| Entrada | Exemplo |
|---|---|
| Busca por texto | `lofi hip hop` |
| Vídeo do YouTube | `https://youtube.com/watch?v=...` |
| Playlist do YouTube | `https://youtube.com/playlist?list=...` |
| Faixa do Spotify | `https://open.spotify.com/track/...` |
| Playlist do Spotify | `https://open.spotify.com/playlist/...` |
| Álbum do Spotify | `https://open.spotify.com/album/...` |

Playlists com mais de 500 faixas exibem um botão **"Carregar mais músicas"** para continuar o carregamento em lotes. Faixas do Spotify são resolvidas via YouTube só quando chegam a vez de tocar (lazy resolution).

---

### 🗂️ Sessão RPG

#### `/rpg criar · entrar · encerrar · listar · status · deletar · configurar`

Um servidor pode ter múltiplas sessões. Cada canal é vinculado a uma por vez.

| Subcomando | Permissão | Descrição |
|---|---|---|
| `criar id:` | 🔒 | Cria uma sessão e vincula ao canal atual |
| `entrar id:` | 🔒 | Vincula o canal a uma sessão existente |
| `encerrar` | — | Desvincula o canal da sessão (sessão continua existindo) |
| `listar` | — | Lista todas as sessões do servidor |
| `status estado:` | 👑 | Altera o status da sessão (🟢 Ativa / 🔴 Offline) |
| `deletar id:` | 👑 | Deleta uma sessão permanentemente |
| `configurar` | 👑 | Exibição de status/efeitos no tracker e modo de decremento |

---

### ⚙️ Configurações

#### `/config ver · cargo-mestre · canal · prefixo · listener-dado · tracker`

| Subcomando | Permissão | Descrição |
|---|---|---|
| `ver` | 🔒 | Exibe todas as configurações atuais do servidor |
| `cargo-mestre cargo:` | Admin | Define o cargo com permissões de Mestre |
| `canal destino: canal:` | 🔒 | Define canal de saída para mapa ou tracker |
| `prefixo prefixo:` | 🔒 | Muda o prefixo de comandos de texto |
| `listener-dado estado:` | 🔒 | Ativa ou desativa a rolagem automática em mensagens |
| `tracker fixo: decremento:` | 🔒 | Configura modo fixo e decremento de status do tracker |

**`/config cargo-mestre`** — requer Administrador. Define qual cargo tem permissões de Mestre no servidor. Sem configuração, usa o fallback por nome via `MASTER_ROLE` no `.env`.

**`/config canal`** — permite separar o canal das mensagens do bot do canal de rolagens:
```
/config canal destino:mapa canal:#canal-mapa
/config canal destino:tracker canal:#canal-combate
```

**`/config tracker fixo:Sim`** — o bot edita sempre a mesma mensagem do tracker em vez de postar uma nova a cada turno.

**`/config tracker decremento:`**
- `Por rodada` — todos os status decrementam juntos ao virar a rodada
- `Por turno` — cada personagem decrementa seus status ao fim do próprio turno

**`/config listener-dado`** — controla se o bot responde a dados escritos em mensagens normais:
- `Ativo` — responde a `2d6`, `1d20+5` etc. em qualquer mensagem
- `Inativo` — ignora mensagens; use `/rolar` ou o prefixo de texto

A configuração é salva por servidor no MongoDB e persiste entre reinicializações.

---

#### `/help`

Exibe a lista completa de comandos disponíveis com link para a documentação.

---

## Comandos de texto (prefixo)

Todos os slash commands funcionam também via mensagem com o prefixo configurado (padrão `!`).

**Formato:**
```
!comando subcomando chave:valor chave:"valor com espaço"
```

**Exemplos:**
```
!play Bohemian Rhapsody
!rolar 2d6+3
!personagem criar nome:"Ada de Andrade" hp:30
!turno avancar
!config ver
!npc replicar nome:Goblin quantidade:3
```

**Comandos exclusivos de texto:**

| Comando | Permissão | Descrição |
|---|---|---|
| `!help` / `!ajuda` | — | Lista os comandos no formato de texto |
| `!setprefix <novo>` | 🔒 | Muda o prefixo do servidor |

O alias `!p` funciona como atalho para `!play`.

---

## Rolagem em mensagens

Quando o **listener de dados está ativo** (`/config listener-dado estado:Ativo`), o bot detecta expressões de dados em mensagens normais sem precisar de prefixo ou slash:

| Expressão | O que faz |
|---|---|
| `2d6` | Rola 2d6 e responde no chat |
| `1d20+5 Ataque` | Rola com rótulo |
| `4df` | Dados Fate |
| `2d6 dano Ada` | Aplica dano ao personagem Ada |
| `1d20 iniciativa Ada` | Adiciona Ada na iniciativa |

Mensagens que começam com o prefixo do servidor (`!`), com prefixos de outros bots (`/`, `?`, `.`, `-`) ou que sejam comandos de prefixo são ignoradas pelo listener para evitar resposta dupla.

Use `/config listener-dado estado:Inativo` para desativar servidor por servidor.

---

## Estrutura de arquivos

```
chaos-rpg-bot/
├── Dockerfile                     ← build para Railway (python3, ffmpeg, libopus)
├── nixpacks.toml                  ← configuração de build alternativa (legado)
├── index.js                       ← entry point, registro de comandos e eventos
├── deploy-commands.js             ← registro manual de slash commands (opcional)
├── .env.example                   ← template de variáveis de ambiente
├── package.json
│
├── commands/
│   ├── combat/                    ← turno, iniciativa, status, vida, personagem, npc
│   ├── config/                    ← config, help
│   ├── dice/                      ← rolar, tag
│   ├── map/                       ← mapa
│   ├── music/                     ← play, pause, resume, skip, back, restart,
│   │                                 stop, queue, remove, clear, shuffle
│   └── rpg/                       ← rpg
│
├── listeners/
│   ├── messageRoll.js             ← detector de dados em mensagens (togglável por guild)
│   └── prefixListener.js          ← comandos com prefixo de texto
│
├── utils/
│   ├── musicPlayer.js             ← player (yt-dlp + ffmpeg + Spotify API)
│   ├── rpgSessionStore.js         ← múltiplas sessões por servidor
│   ├── guildSettingsStore.js      ← settings por servidor (masterRole, diceListener...)
│   ├── characterStore.js          ← personagens e NPCs
│   ├── mapStore.js                ← mapas
│   ├── tagStore.js                ← tags customizadas
│   ├── prefixStore.js             ← prefixo por servidor
│   ├── sessionResolver.js         ← isMaster, isSessionMaster, resolveOrReply
│   ├── textInteraction.js         ← adapter mensagem → slash command
│   ├── diceParser.js              ← parser de expressões de dados
│   ├── diceFormatter.js           ← formatação dos resultados
│   ├── combatEngine.js            ← dano, cura, escudo, eventos
│   ├── statusEngine.js            ← processamento de status por turno/rodada
│   ├── turnRenderer.js            ← formatação do tracker de turno
│   ├── mapRenderer.js             ← renderização do grid de mapa
│   └── db.js                      ← conexão MongoDB
│
├── scripts/
│   ├── spotify-auth.js            ← gera o refresh token do Spotify (executar uma vez)
│   └── spotify-callback.html      ← página de callback para GitHub Pages
│
└── data/                          ← JSON local (USE_LOCAL_DATA=true, ignorado pelo git)
    ├── rpg_sessions.json
    ├── channel_sessions.json
    ├── tags.json
    ├── characters.json
    └── maps/
```
