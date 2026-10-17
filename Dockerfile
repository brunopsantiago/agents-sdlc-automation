FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Dependências
COPY package*.json ./
RUN npm ci --only=production

# Código fonte
COPY . .

# Build TypeScript
RUN npm run build

# Diretório de saída como volume
VOLUME ["/app/output"]

# Variáveis obrigatórias (fornecer em runtime)
ENV ANTHROPIC_API_KEY=""
ENV AZURE_ORG=""
ENV AZURE_PROJECT=""
ENV AZURE_PAT=""

CMD ["node", "dist/orchestrator.js"]
