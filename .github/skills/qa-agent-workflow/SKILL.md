---
name: qa-agent-workflow
description: "Use when explaining, running, debugging, or changing this repository's Azure DevOps, BDD/Gherkin, Claude, or Playwright workflow. Keep answers and edits focused."
---

# QA Agent Workflow

## Projeto

TypeScript app: lê PBIs/User Stories do sprint e casos de um Azure Test Plan; usa Claude para gerar Gherkin, comparar cobertura e gerar specs Playwright com Page Objects. Salva artefatos em `output/` e pode publicar novos casos no Azure.

## Mapa rápido

- `src/orchestrator.ts`: fluxo, modos e `DRY_RUN`.
- `src/tools/azure-devops.ts`: leitura e escrita via REST.
- `src/agents/` e `src/prompts/`: chamadas Claude e formatos gerados.
- `.env.example`: configuração; nunca exponha nem registre tokens.

## Comandos

- `npm install`: dependências.
- `npm run build`: TypeScript.
- `npm test`: testes Playwright.
- `npm start`: fluxo completo; `npm run start:bdd`: BDD; `npm run start:playwright`: Playwright.

## Regras de trabalho

- Antes de afirmar comportamento, confira o código; trate README como documentação, não como prova.
- No código, siga o menor caminho até a lógica responsável e rode uma validação focada.
- Responda no idioma do usuário. Comece pela resposta ou ação; não repita a pergunta, não narre passos óbvios e explique detalhes só quando mudarem uma decisão.
- Diferencie tokens desta conversa do custo de chamadas Anthropic do app. Esta skill reduz contexto carregado sob demanda; não reduz tokens das chamadas em runtime.
- Confirme mudanças externas ao Azure antes de executar; use `DRY_RUN=true` para evitar publicação.
- Atualmente `--mode playwright` não gera BDD e, portanto, não chega a gerar specs no fluxo do orquestrador. Não prometa esse modo como funcional sem validar/corrigir o código.