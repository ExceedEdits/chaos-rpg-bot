FROM node:20-slim

# ── Dependências do sistema ───────────────────────────────────
# python3    → yt-dlp precisa de Python no runtime
# ffmpeg     → transcodificação de áudio (yt-dlp → ffmpeg → PCM)
# libopus-dev + pkg-config + build-essential → compila @discordjs/opus nativamente
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    libopus-dev \
    pkg-config \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências primeiro (camada cacheável separada do código)
COPY package*.json ./
RUN npm ci

# Copia o restante do projeto
COPY . .

CMD ["node", "index.js"]
