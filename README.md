# 🎲 Chaos RPG Bot — Sistema de Mapa para Discord

Bot de RPG para sessões de TTRPG com mapas em emoji, efeitos de turno, controle de combate e música.

---

## ⚙️ Setup

### 1. Pré-requisitos
- Node.js v18+
- Conta no [Discord Developer Portal](https://discord.com/developers/applications)

### 2. Criar o bot
1. Developer Portal → **New Application**
2. **Bot** → **Add Bot** → copie o **Token**
3. **OAuth2 → URL Generator** → marque: `bot`, `applications.commands`
4. Bot Permissions: `Send Messages`, `Read Messages`, `Manage Messages`, `Connect`, `Speak`
5. Convide o bot para o servidor com o link gerado

### 3. Instalar e configurar
```bash
npm install
cp .env.example .env
# Preencha DISCORD_TOKEN, CLIENT_ID e GUILD_ID no .env
npm start
```

---

## 🗺️ Comandos de Mapa

| Comando | O que faz |
|---|---|
| `/mapa mostrar` | Posta o mapa no canal e começa a rastrear a mensagem |
| `/mapa atualizar` | Força atualização manual |
| `/mapa mover 💀 C4` | Move o personagem 💀 para C4 |
| `/mapa cobertura 🔥` | Alterna cobertura do personagem 🔥 |
| `/mapa cobertura 🔥 Sob a Rocha` | Ativa cobertura com nota personalizada |
| `/mapa inimigo Hati B4` | Move o inimigo Hati para B4 |
| `/mapa inimigo Husk fora` | Marca Husk como Fora do Mapa |
| `/mapa efeito nivel_mar 12` | Atualiza o Nível do Mar para 12 |
| `/mapa celula D3 🟥` | Altera a célula D3 para tipo Chefe |

---

## 📐 Estrutura do mapa

### Mapa base (`data/maps/*.json`)
Define o que é **fixo** na cena: layout da grid e caminhos entre células.
Chefes ficam marcados diretamente na grid com 🟥 — não aparecem na lista de inimigos.

### Sessão (`data/session.json`)
Define o que é **dinâmico** durante a sessão:

```
turnEffects   → efeitos de turno (Nível do Mar, veneno, etc.)
characters    → posições e cobertura dos jogadores
npcs          → NPCs com movimento opcional
enemies       → inimigos menores (nome + posição + quantidade)
items         → itens e criaturas no mapa com posição
```

### Efeitos de turno
Adicione quantos quiser em `session.json`:
```json
{
  "id": "nivel_mar",
  "label": "Nível do Mar",
  "value": 10,
  "display": "## Nv. do Mar `{value}`"
}
```
Use `/mapa efeito nivel_mar 12` para atualizar.

---

## 📁 Estrutura de arquivos

```
chaos-rpg-bot/
├── index.js
├── .env / .env.example
├── package.json
├── commands/map/
│   └── mapa.js           ← todos os subcomandos /mapa
├── utils/
│   └── mapRenderer.js    ← renderizador JSON → emojis Discord
└── data/
    ├── session.json      ← estado dinâmico da sessão
    └── maps/
        └── mar_profundo.json ← mapa base (grid + caminhos)
```

---

---

## 🎲 Rolagem de Dados

O bot detecta expressões de dados automaticamente em mensagens normais do chat, ou via `/rolar`.

### Formatos suportados

| Expressão | O que faz |
|---|---|
| `2d6` | Rola 2 dados de 6 lados e soma |
| `d20` | Rola 1 dado de 20 lados |
| `2d6+3` | Rola 2d6 e soma 3 |
| `4df` | Rola 4 dados Fate (-, 0 ou +) |
| `3#d6` | Rola 1d6 três vezes em linha, sem somar |
| `&2+3*5` | Calcula expressão matemática (sem dados) |
| `2d6 Ada` | Rola 2d6 e exibe \Ada\ ao lado |
| `1d6 crítico` | Rola até sair 1 ou 6, mostrando todas as tentativas |
| `1d6 crítico Ada` | Combina tag + texto livre |

### Tags especiais

Tags são palavras-chave escritas após a expressão de dados que alteram o comportamento da rolagem.
Podem ser combinadas com texto livre.

| Tag | Comportamento |
|---|---|
| `crítico` | Rerola automaticamente até sair o valor mínimo (1) ou máximo do dado, exibindo todas as tentativas |

### Acionamento

- **Mensagem normal**: basta digitar a expressão diretamente no chat (ex: `2d6+3`)
- **Slash command**: `/rolar expressao:2d6+3`

> Mensagens que começam com `/`, `!`, `?`, `.` ou `-` são ignoradas pelo detector automático.

---

---

## 🏷️ Tags de Rolagem

Tags são palavras-chave escritas após a expressão de dados que alteram o comportamento da rolagem. O bot vem com a tag `crítico` embutida, e o Mestre pode criar quantas quiser diretamente pelo Discord.

### Tag embutida

| Tag | Comportamento |
|---|---|
| `crítico` | Rerola até sair o mínimo (1) ou máximo do dado, exibindo todas as tentativas |

### Gerenciando tags customizadas

| Comando | O que faz |
|---|---|
| `/tag criar` | Cria ou atualiza uma tag |
| `/tag deletar` | Remove uma tag |
| `/tag listar` | Lista todas as tags ativas |

> Criar e deletar exige o cargo configurado em `MASTER_ROLE` no `.env` (padrão: `Mestre`).

### Condições de parada disponíveis

| Condição | Sintaxe | Comportamento |
|---|---|---|
| Mínimo | `min` | Para quando sair 1 |
| Máximo | `max` | Para quando sair o valor máximo do dado |
| Mínimo ou Máximo | `minoumax` | Para quando sair 1 ou o máximo |
| Valor específico | `valor:N` | Para quando sair N |
| Tentativas | `tentativas:N` | Para após N rolagens |
| Explodir | `explodir:N` | Ao sair N, rola dado extra e acumula |

Múltiplas condições separadas por vírgula: `minoumax, tentativas:10`

### Modos de exibição

| Modo | Comportamento |
|---|---|
| Todas as tentativas | Mostra cada rolagem |
| Todas + destacar o melhor | Idem, com ⭐ no maior resultado |

### Exemplo de uso

```
/tag criar nome:explosivo condicoes:explodir:6, tentativas:10 exibicao:Todas as tentativas
2d6 explosivo Ada
```

---

## 🚧 Próximas fases

- [x] `/rolar 2d6+3` — rolagem de dados com parser
- [ ] `/vida`, `/dano`, `/curar` — HP dos personagens
- [ ] `/turno`, `/iniciativa` — controle de ordem de combate
- [ ] `/tocar`, `/pausar`, `/pular` — música na call
