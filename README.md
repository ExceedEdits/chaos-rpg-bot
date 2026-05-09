# Chaos RPG Bot

Bot de RPG para sessões de TTRPG no Discord. Gerencia dados, mapas em emoji, iniciativa, turnos, status de combate e personagens — tudo pelo Discord, com ou sem slash commands.

---

## Setup

### Pré-requisitos
- Node.js v18+
- Conta no [Discord Developer Portal](https://discord.com/developers/applications)

### 1. Criar o bot
1. Developer Portal → **New Application**
2. **Bot** → **Add Bot** → copie o **Token**
3. **Bot** → **Privileged Gateway Intents** → ative **Message Content Intent** e **Server Members Intent**
4. **OAuth2 → URL Generator** → marque: `bot`, `applications.commands`
5. Bot Permissions: `Send Messages`, `Read Messages`, `Manage Messages`
6. Convide o bot para o servidor com o link gerado

### 2. Instalar e configurar
```bash
npm install
```

Crie um arquivo `.env` na raiz do projeto:

```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=id_do_bot_aqui
GUILD_ID=id_do_servidor_aqui
USE_LOCAL_DATA=true
```

> Para produção com MongoDB, substitua `USE_LOCAL_DATA=true` por `MONGODB_URI=sua_uri`.

### 3. Iniciar
```bash
node index.js
```

---

## Sistema de Prefixo

Todos os slash commands podem ser usados via mensagem de texto com o prefixo configurado (padrão: `!`).

**Formato geral:**
```
!comando subcomando chave:valor chave:"valor com espaço"
!comando grupo subcomando chave:valor ...
```

| Comando | Descrição |
|---|---|
| `!help` / `!ajuda` | Lista todos os comandos disponíveis |
| `!setprefix <p>` | Muda o prefixo do servidor (Mestre) |

---

## Rolagem de Dados

O bot detecta automaticamente expressões de dados em mensagens normais do chat, sem necessidade de prefixo ou slash command.

### Formatos suportados

| Expressão | O que faz |
|---|---|
| `2d6` | Rola 2 dados de 6 lados |
| `d20` | Rola 1 dado de 20 lados |
| `2d6+5` | Rola e soma modificador |
| `1d6*1d4` | Operação entre dados |
| `(d20+5)*2` | Expressão com parênteses |
| `4df` | Dado Fate (-, 0, +) |
| `3#d6` | Repete 3 vezes sem somar |
| `&15+3` | Expressão matemática pura |
| `2d6+5 Ataque` | Rola com rótulo livre |
| `1d20 iniciativa Ada` | Registra iniciativa de Ada |

Resultados são exibidos em ordem decrescente. Valores máximos e mínimos ficam em **negrito**.

### Via comando
```
/rolar expressao:2d6+5
!rolar 2d6+5
```

---

## Tags de Rolagem

Tags são palavras escritas após a expressão de dados que alteram o comportamento da rolagem.

### Tag embutida

| Tag | Comportamento |
|---|---|
| `crítico` | Rerola até sair o mínimo ou máximo do dado, exibindo todas as tentativas |

### Gerenciar tags customizadas

| Comando | O que faz |
|---|---|
| `/tag criar` | Cria ou atualiza uma tag (Mestre) |
| `/tag deletar nome` | Remove uma tag (Mestre) |
| `/tag listar` | Lista todas as tags ativas |

### Condições disponíveis

| Condição | Sintaxe | Comportamento |
|---|---|---|
| Mínimo | `min` | Para ao sair 1 |
| Máximo | `max` | Para ao sair o valor máximo |
| Mínimo ou Máximo | `minoumax` | Para ao sair 1 ou o máximo |
| Valor específico | `valor:N` | Para ao sair N |
| Tentativas | `tentativas:N` | Para após N rolagens |
| Gatilho | `gatilho:N:XdY` | Ao sair N, rola XdY como bônus |
| Texto especial | `texto:N:Mensagem` | Ao sair N, exibe a mensagem |

Múltiplas condições separadas por vírgula: `max, tentativas:5, gatilho:6:1d8`

### Modos de exibição

| Modo | Comportamento |
|---|---|
| `all` — Todas as tentativas | Exibe cada rolagem |
| `allBest` — Todas + destacar o melhor | Idem, com destaque no maior resultado |

### Exemplo
```
/tag criar nome:explodir condicoes:max,tentativas:5,gatilho:6:1d8,texto:6:Acerto crítico! exibicao:Todas as tentativas
2d6 explodir Ada
```

---

## Personagens

| Comando | O que faz |
|---|---|
| `/personagem criar` | Cria um PC ou NPC base |
| `/personagem ver personagem` | Exibe HP, escudo e status |
| `/personagem listar` | Lista todos os personagens |
| `/personagem editar` | Atualiza atributos |
| `/personagem remover` | Remove o personagem |

Busca por nome, emoji ou @menção do jogador.

---

## HP e Combate Direto

| Comando | O que faz |
|---|---|
| `/dano personagem valor` | Aplica dano (processa escudo antes do HP) |
| `/curar personagem valor` | Cura o personagem |
| `/escudo personagem valor` | Define o valor do escudo |
| `/vida personagem valor` | Define HP diretamente |

```
/dano personagem:Ada valor:10
!dano personagem:Ada valor:10
```

---

## NPCs

| Comando | O que faz |
|---|---|
| `/npc replicar nome quantidade` | Cria cópias independentes de um NPC base |
| `/npc resetar nome` | Restaura HP máximo e zera status |
| `/npc listar` | Lista todos os NPCs |
| `/npc remover nome` | Remove um ou mais NPCs |

`resetar` e `remover` aceitam nome exato, prefixo de grupo (ex: `Goblin` afeta todos que começam com "Goblin") ou `todos`.

```
/npc replicar nome:Goblin quantidade:3 sufixos:A,B,C
```

---

## Status

### Aplicar
```
/status aplicar personagem:Ada nome:Veneno duracao:3 efeito:dano valor:5
/status aplicar personagem:Baruk nome:"Escudo Arcano" efeito:escudo valor:10
/status aplicar personagem:Ada nome:Amaldiçoado
```

Parâmetros:
- `duracao` — em rodadas (omitir = permanente)
- `efeito` — `dano`, `cura` ou `escudo` por rodada
- `valor` — obrigatório se efeito definido

### Remover e ver
```
/status remover personagem:Ada nome:Veneno
/status ver personagem:Ada
```

Os efeitos são processados automaticamente a cada rodada ao avançar o turno.

---

## Iniciativa

### Registro por mensagem (jogadores)
```
1d20 iniciativa Ada
2d6 iniciativa
```

### Gerenciamento pelo Mestre

| Comando | O que faz |
|---|---|
| `/iniciativa adicionar nome valor` | Adiciona NPC/inimigo com valor fixo |
| `/iniciativa remover nome` | Remove todas as entradas com esse nome |
| `/iniciativa limpar` | Reseta toda a ordem |
| `/iniciativa ver` | Exibe a ordem atual |

O parâmetro `slots` em `adicionar` permite que um NPC tenha múltiplos turnos por rodada:
```
/iniciativa adicionar nome:Dracolich valor:20 tipo:inimigo slots:2
```

---

## Turnos

| Comando | O que faz |
|---|---|
| `/turno iniciar` | Ordena por iniciativa e inicia o combate |
| `/turno avancar` | Avança para o próximo participante |
| `/turno ver` | Exibe o tracker atual (privado) |
| `/turno adicionar nome valor` | Adiciona participante ao combate em andamento (Mestre) |
| `/turno remover nome` | Remove participante do combate (Mestre) |
| `/turno encerrar` | Encerra o combate e limpa a ordem |

O tracker exibe: número da rodada, ordem completa com o turno atual em **negrito**, status ativos do personagem que está jogando, e efeitos que ele está causando em outros.

Ao virar a rodada, os efeitos de status (dano/cura/escudo por rodada) são processados automaticamente e os expirados são anunciados.

---

## Mapa

### Criar e editar

| Comando | O que faz |
|---|---|
| `/mapa criar id nome colunas linhas` | Cria um novo mapa vazio |
| `/mapa linha numero tipos` | Preenche uma linha inteira |
| `/mapa coluna letra tipos` | Preenche uma coluna inteira |
| `/mapa submatriz de ate tipos` | Preenche uma região retangular |
| `/mapa celula pos tipo` | Altera uma célula individual |
| `/mapa legenda emoji descricao` | Adiciona entrada na legenda |
| `/mapa carregar id` | Troca o mapa ativo da sessão |

```
/mapa criar id:arena nome:Arena colunas:6 linhas:5 padrao:⬜
/mapa linha numero:1 tipos:⬛,⬜,⬜,⬜,⬜,⬛
/mapa submatriz de:B2 ate:D4 tipos:🟥,🟥,🟥,🟥,🟥,🟥,🟥,🟥,🟥
```

### Exibição

| Comando | O que faz |
|---|---|
| `/mapa mostrar` | Posta o mapa no canal |
| `/mapa atualizar` | Força re-renderização da mensagem |
| `/mapa config emojis` | Personagens no grid ou apenas no texto |

### Movimentação

| Comando | O que faz |
|---|---|
| `/mapa mover emoji celula` | Move personagem para uma célula |
| `/mapa cobertura emoji [nota]` | Alterna cobertura do personagem |
| `/mapa inimigo nome pos` | Move inimigo menor ou marca como "fora" |
| `/mapa efeito id valor` | Atualiza efeito de turno (ex: nível da água) |

### Painel de personagens

| Comando | O que faz |
|---|---|
| `/mapa personagem adicionar emoji nome [local]` | Adiciona ao painel de texto |
| `/mapa personagem remover emoji` | Remove do painel |
| `/mapa personagem posicao emoji local` | Atualiza posição no texto |

---

## Sessão RPG

| Comando | O que faz |
|---|---|
| `/rpg criar id` | Cria uma sessão e vincula ao canal |
| `/rpg entrar id` | Vincula o canal a uma sessão existente |
| `/rpg encerrar` | Desvincula o canal da sessão |
| `/rpg listar` | Lista todas as sessões do servidor |
| `/rpg configurar` | Ajusta configurações de exibição |

---

## Configurações

| Comando | O que faz |
|---|---|
| `/config ver` | Exibe todas as configurações atuais |
| `/config canal destino canal` | Define canal de saída para mapa ou tracker |
| `/config tracker fixo decremento` | Configura modo do tracker e decremento de status |

### Canal de saída
Permite separar as mensagens do bot do canal de rolagens:
```
/config canal destino:mapa canal:#canal-mapa
/config canal destino:tracker canal:#canal-combate
```

### Tracker fixo
```
/config tracker fixo:Sim
```
Com tracker fixo ativo, o bot edita sempre a mesma mensagem ao invés de postar uma nova a cada turno.

### Decremento de status
```
/config tracker decremento:Por rodada
/config tracker decremento:Por turno
```
- **Por rodada** — todos os status decrementam juntos ao virar a rodada
- **Por turno** — cada personagem decrementa seus status ao fim do próprio turno

---

## Estrutura de Arquivos

```
chaos-rpg-bot/
├── index.js
├── .env
├── package.json
├── commands/
│   ├── combat/       ← turno, iniciativa, status, vida, personagem, npc
│   ├── config/       ← config
│   ├── dice/         ← rolar, tag
│   ├── map/          ← mapa
│   └── rpg/          ← rpg
├── listeners/
│   ├── messageRoll.js     ← detector de dados em mensagens
│   └── prefixListener.js  ← comandos com prefixo de texto
├── utils/
│   ├── diceParser.js      ← parser de expressões de dados
│   ├── diceFormatter.js   ← formatação dos resultados
│   ├── tagEngine.js       ← motor de tags customizadas
│   ├── mapRenderer.js     ← renderizador JSON → emojis Discord
│   ├── statusEngine.js    ← processamento de status por rodada
│   ├── turnRenderer.js    ← formatação do tracker de turno
│   ├── prefixStore.js     ← prefixo por servidor
│   ├── textInteraction.js ← adapter mensagem → slash command
│   └── ...
└── data/                  ← arquivos JSON (modo local)
    ├── session.json
    ├── rpg_sessions.json
    └── maps/
```
