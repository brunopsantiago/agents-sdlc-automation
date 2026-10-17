# QA Agent — Azure DevOps + Claude + Playwright

Sistema de agentes de IA para automação de QA:
lê PBIs do Azure DevOps → gera BDD → gera scripts Playwright.

## Arquitetura

```
Azure DevOps                Claude API                 Output
─────────────               ──────────                 ──────
PBIs / Stories  ──→  BDD Generator Agent  ──→  .feature (Gherkin)
Test Plans      ──→  Playwright Agent     ──→  .spec.ts + PageObjects
                                          ──→  Azure Test Plans (publicação)
```

## Pré-requisitos

- Node.js 20+
- Conta Azure DevOps com PAT Token
- Chave da API Anthropic (claude.ai/settings)

## Setup rápido

```bash
# 1. Clone e instale dependências
npm install
npx playwright install chromium

# 2. Configure as variáveis de ambiente
cp .env.example .env
# edite .env com seus tokens

# 3. Execute
npm start                    # modo completo (BDD + Playwright)
npm run start:bdd            # só geração de BDD
npm run start:playwright     # só geração de specs
```

## Variáveis de ambiente

| Variável              | Obrigatória | Descrição                                  |
|-----------------------|-------------|--------------------------------------------|
| `ANTHROPIC_API_KEY`   | ✅          | Chave da API Anthropic                     |
| `AZURE_ORG`           | ✅          | Nome da organização Azure DevOps           |
| `AZURE_PROJECT`       | ✅          | Nome do projeto                            |
| `AZURE_PAT`           | ✅          | Personal Access Token                      |
| `SPRINT_NAME`         | ❌          | Nome do sprint (padrão: sprint ativo)      |
| `REGRESSION_PLAN_ID`  | ❌          | ID do Test Plan de regressão (padrão: 1)   |
| `OUTPUT_DIR`          | ❌          | Diretório de saída (padrão: ./output)      |
| `DRY_RUN`             | ❌          | `true` = não publica no Azure              |

## Configurar o PAT Token no Azure DevOps

1. Acesse **Azure DevOps → User Settings → Personal Access Tokens**
2. Clique em **New Token**
3. Configure:
   - **Name:** qa-agent
   - **Expiration:** 90 dias (renovar via pipeline)
   - **Scopes:**
     - Work Items: **Read & Write**
     - Test Management: **Read & Write**
     - Code: **Read**
4. Copie o token e coloque em `AZURE_PAT` no `.env`

## Estrutura de saída

```
output/
├── features/
│   ├── pbi-123-nome-da-feature.feature
│   └── pbi-456-outra-feature.feature
├── pages/
│   ├── LoginPage.ts
│   └── DashboardPage.ts
├── nome-feature.spec.ts
├── playwright.config.ts
└── run-summary.json
```

## Deploy via Docker

```bash
docker build -t qa-agent .

docker run \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e AZURE_ORG=sua-org \
  -e AZURE_PROJECT=seu-projeto \
  -e AZURE_PAT=seu-pat \
  -v $(pwd)/output:/app/output \
  qa-agent
```

## Executando os specs gerados

```bash
# Revisar e ajustar seletores nos Page Objects, depois:
cd output
npx playwright test

# Ver relatório HTML
npx playwright show-report
```

## Segurança

- **Nunca** commite o arquivo `.env`
- Use **Azure Key Vault** ou **GitHub Secrets** em produção
- PAT Token com escopo mínimo necessário
- Rotacione o PAT a cada 90 dias