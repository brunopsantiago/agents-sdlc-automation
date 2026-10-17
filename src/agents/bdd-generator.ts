// ============================================================
// agents/bdd-generator.ts — Agente gerador de BDD via Claude
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { WorkItem, TestCase, BDDFeature, BDDScenario, GapReport } from '../types';
import { BDD_SYSTEM_PROMPT } from '../prompts/bdd-prompt';

interface BDDInput {
  workItem: WorkItem;
  existingTestCases: TestCase[];
}

interface BDDRawOutput {
  feature: BDDFeature;
  gapReport: GapReport;
}

export class BDDGeneratorAgent {
  private client: Anthropic;
  private model = 'claude-sonnet-4-20250514';

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }

  /**
   * Gera cenários BDD para um PBI, cruzando com os test cases existentes
   */
  async generate(input: BDDInput): Promise<BDDRawOutput> {
    const { workItem, existingTestCases } = input;

    console.log(`\n🟠 [BDD Agent] Processando PBI #${workItem.id}: "${workItem.title}"`);

    const userPrompt = this.buildUserPrompt(workItem, existingTestCases);

    // Usa Tool Use para forçar saída estruturada
    const tools: Anthropic.Tool[] = [
      {
        name: 'output_bdd_result',
        description:
          'Salva o resultado gerado: feature Gherkin + relatório de gaps',
        input_schema: {
          type: 'object' as const,
          properties: {
            feature_title: {
              type: 'string',
              description: 'Título da feature (sem o prefixo "Feature:")',
            },
            feature_description: {
              type: 'string',
              description: 'Descrição da feature (2-3 linhas contextuais)',
            },
            scenarios: {
              type: 'array',
              description: 'Lista de cenários BDD gerados',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  given: { type: 'array', items: { type: 'string' } },
                  when: { type: 'array', items: { type: 'string' } },
                  then: { type: 'array', items: { type: 'string' } },
                  and: { type: 'array', items: { type: 'string' } },
                  is_outline: { type: 'boolean' },
                },
                required: ['title', 'tags', 'given', 'when', 'then'],
              },
            },
            coverage_gaps: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Cenários identificados como não cobertos pelos test cases existentes',
            },
            reasoning: {
              type: 'string',
              description: 'Explicação das decisões de cobertura tomadas',
            },
          },
          required: [
            'feature_title',
            'feature_description',
            'scenarios',
            'coverage_gaps',
            'reasoning',
          ],
        },
      },
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: BDD_SYSTEM_PROMPT,
      tools,
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Extrai o tool_use do response
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error(`[BDD Agent] Claude não retornou tool_use para PBI #${workItem.id}`);
    }

    const output = toolUse.input as any;

    // Monta BDDFeature
    const scenarios: BDDScenario[] = (output.scenarios ?? []).map((s: any) => ({
      title: s.title,
      tags: s.tags ?? [],
      steps: {
        given: s.given ?? [],
        when: s.when ?? [],
        then: s.then ?? [],
        and: s.and ?? [],
      },
      isOutline: s.is_outline ?? false,
    }));

    const gherkinRaw = this.renderGherkin(
      output.feature_title,
      output.feature_description,
      scenarios
    );

    const feature: BDDFeature = {
      featureTitle: output.feature_title,
      description: output.feature_description,
      workItemId: workItem.id,
      scenarios,
      gherkinRaw,
    };

    const gapReport: GapReport = {
      workItemId: workItem.id,
      existingCoverage: existingTestCases.length,
      newScenariosGenerated: scenarios.length,
      coverageGap: output.coverage_gaps ?? [],
    };

    console.log(
      `✅ [BDD Agent] PBI #${workItem.id}: ${scenarios.length} cenários gerados, ` +
      `${gapReport.coverageGap.length} gaps identificados`
    );

    return { feature, gapReport };
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private buildUserPrompt(workItem: WorkItem, existingTestCases: TestCase[]): string {
    const existingCoverage =
      existingTestCases.length > 0
        ? existingTestCases
            .map((tc) => `  - [TC-${tc.id}] ${tc.title} (${tc.automationStatus})`)
            .join('\n')
        : '  (nenhum test case existente para este PBI)';

    return `
## PBI para análise

**ID:** ${workItem.id}
**Título:** ${workItem.title}
**Tipo:** ${workItem.workItemType}
**Estado:** ${workItem.state}
**Tags:** ${workItem.tags.join(', ') || 'nenhuma'}

### Descrição
${workItem.description || '(sem descrição)'}

### Critérios de Aceite
${workItem.acceptanceCriteria || '(sem critérios de aceite definidos)'}

---

## Test Cases Existentes na Suite de Regressão
${existingCoverage}

---

Por favor, gere os cenários BDD para este PBI usando a tool \`output_bdd_result\`.
Identifique os gaps em relação aos test cases existentes.
    `.trim();
  }

  private renderGherkin(
    title: string,
    description: string,
    scenarios: BDDScenario[]
  ): string {
    const lines: string[] = [
      `Feature: ${title}`,
      `  ${description.replace(/\n/g, '\n  ')}`,
      '',
    ];

    for (const scenario of scenarios) {
      if (scenario.tags.length > 0) {
        lines.push(`  @${scenario.tags.join(' @')}`);
      }

      const keyword = scenario.isOutline ? 'Scenario Outline' : 'Scenario';
      lines.push(`  ${keyword}: ${scenario.title}`);

      for (const given of scenario.steps.given) {
        lines.push(`    Given ${given}`);
      }
      for (const when of scenario.steps.when) {
        lines.push(`    When ${when}`);
      }
      for (const then of scenario.steps.then) {
        lines.push(`    Then ${then}`);
      }
      for (const and of scenario.steps.and ?? []) {
        lines.push(`    And ${and}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }
}
