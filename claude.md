# CLAUDE.md — RFC-QA-001

## 1. Contexto do projeto
Este projeto lê [Test Plan / work items] do Azure DevOps e gera:
- Cenários BDD/Gherkin
- Testes Playwright

Objetivo: substituir validações manuais de [descreva o processo manual atual] por automação, acelerando entregas.

## 2. Stack e comandos essenciais
- Linguagem/framework: [Node.js/TypeScript — confirmar versão]
- Instalar dependências: `[comando]`
- Rodar testes: `[comando]`
- Rodar lint: `[comando]`
- Variáveis de ambiente necessárias: `[.env.example ou lista]`

## 3. Como ler o Azure DevOps
- Fonte dos dados: [PBIs / Test Plan / work items — qual exatamente, e via qual API/SDK]
- Formato esperado dos campos relevantes: [ex: campo "Acceptance Criteria" precisa estar preenchido]
- Quando a informação estiver incompleta ou ambígua, o agente deve: [descreva a regra que você aplica hoje na mão — ex: pedir confirmação, pular o item, usar valor padrão]

## 4. Padrão de saída esperado

### Exemplo de cenário Gherkin "bem feito":
```gherkin
[cole aqui um exemplo real que você considera correto]
```

### Exemplo de teste Playwright "bem feito":
```typescript
[cole aqui um exemplo real que você considera correto]
```

## 5. Regras e restrições (do's and don'ts)
- [ ] [Regra 1 — ex: nomear cenários sempre como "Feature: <nome do work item>"]
- [ ] [Regra 2 — ex: nunca gerar testes duplicados para o mesmo PBI]
- [ ] [Regra 3 — ex: sempre validar campo X antes de gerar o teste]
- [ ] [Adicione aqui cada correção manual que você já fez — cada uma vira uma regra]

## 6. Estrutura de pastas
- Testes gerados ficam em: `[caminho]`
- Specs/PBIs de referência ficam em: `[caminho]`
- NÃO mexer em: `[ex: configs de CI/CD, arquivos de credenciais, pasta X]`