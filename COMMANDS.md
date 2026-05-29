# Chaos RPG Bot — Documentação Completa de Comandos

> Bot de Discord para mesas de RPG de mesa (TTRPG). Gerencia sessões, combate, personagens, mapas e reprodução de músicas.
> Prefixo padrão de texto: `!` (configurável por servidor)

---

## Índice
- [🎲 Dados](#-dados)
- [⚔️ Combate](#️-combate)
- [🗺️ Mapa](#️-mapa)
- [🎵 Música](#-música)
- [⚙️ Configuração](#️-configuração)
- [🔧 Comandos de Texto](#-comandos-de-texto)

---

## 🎲 Dados

### `/rolar`
Rola dados com suporte a expressões aritméticas, múltiplos dados e tags de combate.
Você também pode digitar a expressão **diretamente no chat** (sem `/rolar`) se o listener de dados estiver ativo.

**Parâmetros:**
| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| `expressao` | ✅ | Expressão de dados (ex: `2d6+5`) |

**Exemplos:**
```
/rolar expressao:2d6+5
/rolar expressao:1d20+3
/rolar expressao:4d6
/rolar expressao:1d20 iniciativa Ada       → rola e registra na iniciativa de Ada
/rolar expressao:3d8 dano Goblin           → aplica dano ao NPC Goblin
/rolar expressao:1d6 curar Thorin          → cura Thorin pelo valor rolado
```

**No chat (sem o comando):**
```
2d6+5
1d20 crítico
3d8 dano Goblin
1d6 curar Ada
1d20 iniciativa Personagem
```

---

### `/tag`
Cria tags customizadas que modificam o comportamento das rolagens. A rolagem é repetida automaticamente até atingir a condição definida (mínimo, máximo, valor específico, etc.).
Criar e deletar requer cargo de **Mestre**.

**Subcomandos:**

#### `/tag criar`
| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| `nome` | ✅ | Nome da tag (ex: `foco`, `explosão`) |
| `condicoes` | ✅ | Condições separadas por vírgula |
| `exibicao` | ✅ | `Todas as tentativas` ou `Todas + destacar o melhor` |

**Condições disponíveis:**
| Condição | Comportamento |
|---|---|
| `min` | Para ao rolar o mínimo possível (1) |
| `max` | Para ao rolar o máximo possível |
| `minoumax` | Para ao rolar mínimo ou máximo |
| `valor:N` | Para ao rolar exatamente N |
| `tentativas:N` | Para após N tentativas |
| `gatilho:N:XdY` | Ao rolar N, dispara uma rolagem extra de XdY |
| `texto:N:Mensagem` | Ao rolar N, exibe a mensagem personalizada |

**Exemplos:**
```
/tag criar nome:foco condicoes:max exibicao:Todas as tentativas
/tag criar nome:explode condicoes:gatilho:6:1d6 exibicao:Todas + destacar o melhor
/tag criar nome:sorte condicoes:valor:20,tentativas:3 exibicao:Todas as tentativas
/tag criar nome:critico condicoes:max,texto:20:Crítico devastador! exibicao:Todas + destacar o melhor
/tag listar
/tag deletar nome:foco
```

**Usando uma tag:**
```
1d20 foco Ada
2d8+2 explode Goblin dano
```

---

## ⚔️ Combate

### `/turno`
Gerencia o sistema de turnos de combate. Exibe um tracker visual com todos os participantes, HP, escudo e status ativos. Aplica automaticamente efeitos de status (dano/cura/escudo por rodada) na virada do turno.

**Subcomandos:**

| Subcomando | Descrição |
|---|---|
| `iniciar` | Inicia o combate com os personagens da iniciativa |
| `avancar` | Avança para o próximo turno |
| `ver` | Exibe o tracker de turno atual |
| `adicionar nome:X` | Adiciona participante ao combate em andamento |
| `remover nome:X` | Remove participante do combate |
| `encerrar` | Encerra o combate e limpa o tracker |

**Exemplos:**
```
/turno iniciar
/turno avancar
/turno ver
/turno adicionar nome:Goblin
/turno remover nome:Goblin
/turno encerrar
```

---

### `/iniciativa`
Gerencia a ordem de iniciativa do combate. Os jogadores podem rolar sua iniciativa direto no chat usando `1d20 iniciativa NomeDoPersonagem`.

**Subcomandos:**

| Subcomando | Parâmetros | Descrição |
|---|---|---|
| `adicionar` | `nome` ✅, `valor` ✅, `turnos` | Adiciona à iniciativa com valor fixo |
| `ver` | — | Exibe a ordem atual |
| `remover` | `nome` ✅ | Remove da iniciativa |
| `limpar` | — | Apaga toda a ordem |

**Exemplos:**
```
/iniciativa adicionar nome:Goblin valor:14
/iniciativa adicionar nome:Goblin valor:14 turnos:2    → 2 turnos por rodada
/iniciativa ver
/iniciativa remover nome:Goblin
/iniciativa limpar

No chat: 1d20 iniciativa Ada   → rola e insere automaticamente na iniciativa
```

---

### `/status`
Aplica, remove e lista status em personagens e NPCs. Status podem ter duração definida em rodadas e efeitos automáticos processados a cada turno.

**Subcomandos:**

#### `/status aplicar`
| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| `personagem` | ✅ | Nome, emoji ou @jogador |
| `nome` | ✅ | Nome do status (ex: `Veneno`, `Bênção`) |
| `duracao` | | Duração em rodadas (omita para permanente) |
| `efeito` | | Tipo: `⚔️ Dano`, `💚 Cura` ou `🛡️ Escudo` por rodada |
| `valor` | | Valor do efeito (obrigatório se efeito definido) |
| `fonte` | | Origem do status (ex: `Aranha Venenosa`, nome de personagem) |

**Exemplos:**
```
/status aplicar personagem:Ada nome:Veneno duracao:3 efeito:⚔️ Dano valor:5
/status aplicar personagem:Thorin nome:Bênção duracao:2 efeito:💚 Cura valor:3
/status aplicar personagem:Ada nome:Bênção duracao:2 efeito:🛡️ Escudo valor:4
/status aplicar personagem:Ada nome:Atordoado                       → sem duração (permanente)
/status aplicar personagem:Ada nome:Fraqueza fonte:"Aranha Venenosa"
/status remover personagem:Ada nome:Veneno
/status ver personagem:Ada
```

---

### `/dano`
Aplica dano a um personagem ou NPC. O escudo absorve dano primeiro. Exibe eventos especiais (morte, HP crítico).

**Parâmetros:** `personagem` ✅ (nome/emoji/@jogador) · `valor` ✅ (mínimo 1)

```
/dano personagem:Ada valor:15
/dano personagem:👺 valor:8
/dano personagem:@jogador valor:10
```

---

### `/curar`
Cura um personagem, restaurando HP até o máximo.

**Parâmetros:** `personagem` ✅ · `valor` ✅

```
/curar personagem:Thorin valor:12
/curar personagem:@jogador valor:20
```

---

### `/escudo`
Define o valor do escudo. O escudo absorve dano antes do HP.

**Parâmetros:** `personagem` ✅ · `valor` ✅ (0 para remover)

```
/escudo personagem:Ada valor:10
/escudo personagem:Ada valor:0    → remove o escudo
```

---

### `/vida`
Define o HP atual diretamente, sem calcular dano ou cura.

**Parâmetros:** `personagem` ✅ · `valor` ✅

```
/vida personagem:Ada valor:50
/vida personagem:Goblin valor:0    → marca como morto
```

---

### `/personagem`
Criação e gerenciamento de fichas de personagem. Cada jogador pode ter múltiplos personagens e ativá-los por sessão.

**Subcomandos:**

| Subcomando | Parâmetros | Descrição |
|---|---|---|
| `criar` | `nome` ✅, `hp` ✅, `emoji`, `crit` | Cria novo personagem |
| `editar` | `nome` ✅, `campo` ✅, `valor` ✅ | Edita um campo da ficha |
| `ativar` | `nome` ✅ | Ativa o personagem neste canal/sessão |
| `ver` | `nome` ✅ | Exibe ficha completa |
| `meus` | — | Lista seus personagens |
| `listar` | — | Lista todos os personagens do servidor (Mestre) |
| `remover` | `nome` ✅ | Deleta o personagem |

**Exemplos:**
```
/personagem criar nome:Ada hp:60 emoji:🗡️
/personagem criar nome:Thorin hp:80 crit:20    → limiar crítico em 20 HP
/personagem editar nome:Ada campo:hp valor:70
/personagem editar nome:Ada campo:emoji valor:⚔️
/personagem ativar nome:Ada
/personagem ver nome:Ada
/personagem meus
/personagem listar
/personagem remover nome:Ada
```

---

### `/npc`
Criação e gerenciamento de NPCs pelo Mestre. NPCs podem ser replicados em série para criar grupos.

**Subcomandos:**

| Subcomando | Parâmetros | Descrição |
|---|---|---|
| `criar` | `nome` ✅, `hp` ✅, `emoji`, `crit` | Cria novo NPC |
| `ver` | `nome` ✅ | Exibe ficha do NPC |
| `editar` | `nome` ✅, `campo` ✅, `valor` ✅ | Edita campo |
| `replicar` | `nome` ✅, `quantidade` ✅ | Gera cópias com sufixo numerado |
| `resetar` | `nome` ✅ | Restaura HP e escudo ao máximo |
| `listar` | — | Lista todos os NPCs |
| `remover` | `nome` ✅ | Deleta o NPC |

**Exemplos:**
```
/npc criar nome:Goblin hp:30 emoji:👺
/npc criar nome:Ogro hp:80 crit:25
/npc ver nome:Goblin
/npc editar nome:Goblin campo:hp valor:40
/npc replicar nome:Goblin quantidade:3    → cria Goblin-1, Goblin-2, Goblin-3
/npc resetar nome:Goblin
/npc listar
/npc remover nome:Goblin
```

---

## 🗺️ Mapa

### `/mapa`
Sistema completo de mapa de combate em grid. Suporta terrenos, tokens de personagens/NPCs/inimigos, itens, efeitos de área e cobertura. O mapa é renderizado e exibido como imagem.

**Subcomandos principais:**

| Subcomando | Descrição |
|---|---|
| `criar` | Cria novo mapa com nome, linhas e colunas |
| `mostrar` | Exibe o mapa atual da sessão como imagem |
| `carregar` | Carrega um mapa salvo na sessão |
| `listar` | Lista todos os mapas salvos |
| `atualizar` | Redesenha e atualiza a imagem do mapa |
| `config` | Configura exibição (tamanho de célula, grade, etc.) |

**Tokens:**

| Subgrupo | Ações | Descrição |
|---|---|---|
| `personagem` | `adicionar`, `mover`, `remover` | Personagens dos jogadores |
| `npc` | `adicionar`, `mover`, `remover` | NPCs amigos |
| `inimigo` | `adicionar`, `mover`, `remover` | Inimigos |
| `item` | `adicionar`, `mover`, `remover` | Itens e objetos |

**Terreno e estrutura:**

| Subgrupo | Ações | Descrição |
|---|---|---|
| `terreno` | `atualizar`, `remover` | Define tipo de célula (parede, água, etc.) |
| `cobertura` | `adicionar`, `remover`, `listar` | Linhas de cobertura entre tokens |
| `efeito` | `adicionar`, `remover` | Efeitos de área com raio |
| `celula` | `ver` | Inspeciona conteúdo de uma célula |
| `linha` | `adicionar`, `remover` | Operações em linha inteira |
| `coluna` | `adicionar`, `remover` | Operações em coluna inteira |
| `submatriz` | `definir`, `remover` | Define região retangular |

**Exemplos:**
```
/mapa criar nome:Floresta linhas:10 colunas:10
/mapa mostrar
/mapa carregar nome:Floresta
/mapa personagem adicionar nome:Ada posicao:A1
/mapa npc adicionar nome:Goblin posicao:C5
/mapa inimigo adicionar nome:Dragão posicao:E8 emoji:🐉
/mapa item adicionar nome:Tocha posicao:B3 emoji:🕯️
/mapa mover nome:Ada destino:B2
/mapa terreno atualizar posicao:D4 tipo:parede
/mapa efeito adicionar posicao:A1 raio:2 emoji:🔥 nome:Chamas
/mapa cobertura adicionar de:Ada para:Goblin
/mapa listar
/mapa config
```

---

## 🎵 Música

### `/play`
Toca músicas no canal de voz. Aceita links do YouTube, Spotify ou busca por texto. Adiciona à fila se já houver música tocando. Usa SoundCloud automaticamente como fallback quando o YouTube bloquear.

**Parâmetros:** `query` ✅ (texto de busca ou URL)

```
/play query:Never Gonna Give You Up            → busca no YouTube
/play query:https://youtu.be/dQw4w9WgXcQ       → link do YouTube
/play query:https://open.spotify.com/track/…   → faixa do Spotify
/play query:https://open.spotify.com/playlist/… → playlist do Spotify
/play query:https://open.spotify.com/album/…   → álbum do Spotify
/play query:https://youtube.com/playlist?list=… → playlist do YouTube
```

---

### `/pause` · `/resume`
Pausa e retoma a reprodução.
```
/pause    → pausa
/resume   → continua
```

---

### `/skip` · `/back` · `/restart`
Controles de navegação entre faixas.
```
/skip     → próxima música
/back     → música anterior (histórico)
/restart  → reinicia a música atual do início
```

---

### `/stop`
Para a reprodução, limpa a fila e desconecta o bot.
```
/stop
```

---

### `/queue`
Exibe a fila de músicas com paginação (10 por página).

**Parâmetros:** `pagina` (opcional, padrão: 1)

```
/queue              → primeira página
/queue pagina:3     → terceira página
```

---

### `/remove`
Remove uma música da fila pelo número de posição.

**Parâmetros:** `posicao` ✅

```
/remove posicao:3    → remove a 3ª música da fila
```

---

### `/shuffle`
Embaralha aleatoriamente a fila (Fisher-Yates). A música atual continua tocando.
```
/shuffle
```

---

### `/clear`
Limpa todas as músicas da fila sem parar a que está tocando.
```
/clear
```

---

### `/loop`
Ativa ou desativa modos de repetição.

| Subcomando | Comportamento |
|---|---|
| `track` | 🔂 Repete a música atual indefinidamente |
| `queue` | 🔁 Repete a fila inteira em loop contínuo |
| `disable` | ➡️ Desativa o loop |

```
/loop track     → repete a música atual
/loop queue     → loop da fila inteira
/loop disable   → reprodução normal
```

---

### `/move`
Move uma música para outra posição na fila.

**Parâmetros:** `posicao` ✅ · `destino` ✅

```
/move posicao:35 destino:1     → move a 35ª para o topo
/move posicao:2 destino:10     → move a 2ª para a posição 10
```

---

## ⚙️ Configuração

### `/config`
Configurações gerais do bot para este servidor.

| Subcomando | Parâmetros | Descrição |
|---|---|---|
| `ver` | — | Exibe todas as configurações atuais |
| `cargo-mestre` | `cargo` | Define o cargo com permissões de Mestre |
| `canal` | `canal` | Canal padrão de anúncios de música |
| `prefixo` | `prefixo` | Prefixo dos comandos de texto (padrão: `!`) |
| `listener-dado` | `estado` | Ativa/desativa o listener de dados no chat |
| `tracker` | `canal` | Canal onde o tracker de turno é exibido |

```
/config ver
/config cargo-mestre cargo:@Mestre
/config canal canal:#música
/config prefixo prefixo:!
/config listener-dado estado:Inativo
/config tracker canal:#combate
```

---

### `/rpg`
Gerencia sessões de RPG. Uma sessão conecta personagens, NPCs, mapas e turnos a canais do servidor.

| Subcomando | Parâmetros | Quem pode usar |
|---|---|---|
| `criar` | `id` ✅ | Mestre |
| `listar` | — | Todos |
| `entrar` | `id` ✅ | Mestre |
| `encerrar` | — | Mestre |
| `status` | `estado` ✅ | Dono da sessão |
| `deletar` | `id` ✅ | Dono da sessão |
| `configurar` | `status_tracker`, `efeitos_tracker`, `decremento` | Dono da sessão |

```
/rpg criar id:campanha-principal
/rpg listar
/rpg entrar id:campanha-principal
/rpg encerrar
/rpg status estado:🟢 Ativa
/rpg status estado:🔴 Offline
/rpg deletar id:campanha-principal
/rpg configurar status_tracker:Mostrar decremento:Por rodada (volta completa)
/rpg configurar efeitos_tracker:Ocultar decremento:Por turno (vez de cada jogador)
```

---

## 🔧 Comandos de Texto

Além dos slash commands, o bot aceita comandos via prefixo de texto (padrão: `!`). Use `!help` para ver a lista completa.

| Comando | Descrição |
|---|---|
| `!setprefix <p>` | Muda o prefixo do servidor (requer cargo de Mestre) |
| `!help` | Exibe a lista de comandos de texto |
| `!play <query>` | Igual ao `/play` |
| `!skip`, `!stop`, `!pause`, etc. | Todos os comandos de música |
| `!rolar <expressão>` | Igual ao `/rolar` |
| `!move de:<n> para:<m>` | Move faixa na fila |

**Rolagem direta no chat:**
Se o listener de dados estiver ativo (`/config listener-dado estado:Ativo`), qualquer mensagem com formato de dado é reconhecida:
```
2d6+5
1d20 iniciativa Ada
3d8 dano Goblin
```

---

## Permissões

| Ação | Quem pode |
|---|---|
| Comandos de música | Qualquer membro no canal de voz |
| Rolagem de dados | Qualquer membro |
| Gerenciar personagens próprios | Qualquer membro |
| Gerenciar NPCs, iniciativa, turno | Cargo de **Mestre** |
| Criar/deletar tags | Cargo de **Mestre** |
| Criar/configurar sessões | Cargo de **Mestre** |
| Deletar sessão | Dono da sessão ou Administrador |
| Configurar o bot | Administrador do servidor |

> O cargo de Mestre é definido com `/config cargo-mestre cargo:@NomeDoCarco`.

---

*Documentação gerada automaticamente pelo Chaos RPG Bot.*
*Site: https://exceededits.github.io/chaos-rpg-site/*
