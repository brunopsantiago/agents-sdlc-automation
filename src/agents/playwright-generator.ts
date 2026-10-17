// ============================================================
// agents/playwright-generator.ts — Gera scripts Playwright a
//   partir dos cenários BDD gerados pelo BDD Agent
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { BDDFeature, PlaywrightSpec, PageObject } from '../types';
import { PLAYWRIGHT_SYSTEM_PROMPT } from '../prompts/playwright-prompt';
import * as fs from 'fs';
import * as path from 'path';

export class PlaywrightGeneratorAgent {
  private client: Anthropic;
  private model = 'claude-sonnet-4-20250514';
  private outputDir: string;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
    this.outputDir = process.env.OUTPUT_DIR ?? './output';
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.mkdirSync(path.join(this.outputDir, 'pages'), { recursive: true });
  }

  /**
   * Gera o script Playwright (.spec.ts) para uma feature BDD
   */
  async generate(feature: BDDFeature): Promise<PlaywrightSpec> {
    console.log(
      `\n🟢 [Playwright Agent] Gerando spec para: "${feature.featureTitle}"`
    );

    const tools: Anthropic.Tool[] = [
      {
        name: 'output_playwright_spec',
        description: 'Salva o script Playwright gerado e o Page Object correspondente',
        input_schema: {
          type: 'object' as const,
          properties: {
            spec_file_name: {
              type: 'string',
              description:
                'Nome do arquivo spec, ex: login.spec.ts (kebab-case, sem espaços)',
            },
            spec_content: {
              type: 'string',
              description:
                'Conteúdo completo do arquivo .spec.ts com todos os testes',
            },
            page_object_file_name: {
              type: 'string',
              description:
                'Nome do Page Object, ex: LoginPage.ts (PascalCase)',
            },
            page_object_content: {
              type: 'string',
              description:
                'Conteúdo completo do Page Object com seletores e métodos',
            },
            test_count: {
              type: 'number',
              description: 'Quantidade de testes (it/test) no arquivo spec',
            },
          },
          required: [
            'spec_file_name',
            'spec_content',
            'page_object_file_name',
            'page_object_content',
            'test_count',
          ],
        },
      },
    ];

    const userPrompt = `
## Feature BDD para implementar em Playwright

**Work Item ID:** ${feature.workItemId}

### Gherkin completo
\`\`\`gherkin
${feature.gherkinRaw}
\`\`\`

---

Gere:
1. Um arquivo \`.spec.ts\` Playwright que implementa TODOS os cenários acima
2. Um Page Object correspondente com seletores e métodos reutilizáveis

Use a tool \`output_playwright_spec\` para retornar o código.
    `.trim();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 6000,
      system: PLAYWRIGHT_SYSTEM_PROMPT,
      tools,
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error(
        `[Playwright Agent] Claude não retornou tool_use para feature "${feature.featureTitle}"`
      );
    }

    const output = toolUse.input as any;

    // Salva os arquivos gerados
    const specPath = path.join(this.outputDir, output.spec_file_name);
    const pagePath = path.join(this.outputDir, 'pages', output.page_object_file_name);

    fs.writeFileSync(specPath, output.spec_content, 'utf8');
    fs.writeFileSync(pagePath, output.page_object_content, 'utf8');

    console.log(`✅ [Playwright Agent] Gerado: ${specPath}`);
    console.log(`✅ [Playwright Agent] Page Object: ${pagePath}`);

    const spec: PlaywrightSpec = {
      fileName: output.spec_file_name,
      content: output.spec_content,
      featureTitle: feature.featureTitle,
      workItemId: feature.workItemId,
      scenarioCount: output.test_count,
    };

    return spec;
  }

  /**
   * Gera o playwright.config.ts base para o projeto
   */
  generateConfig(): void {
    const configPath = path.join(this.outputDir, 'playwright.config.ts');

    const config = `
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html'],
    ['junit', { outputFile: 'results/junit.xml' }], // Para Azure DevOps
    ['list'],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
    `.trim();

    fs.writeFileSync(configPath, config, 'utf8');
    console.log(`📄 [Playwright Agent] Config gerado: ${configPath}`);
  }
}
