// ============================================================
// orchestrator.ts — Orquestrador principal do sistema de agentes
// ============================================================

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { AzureDevOpsClient } from './tools/azure-devops';
import { BDDGeneratorAgent } from './agents/bdd-generator';
import { PlaywrightGeneratorAgent } from './agents/playwright-generator';
import {
  AgentConfig, AgentResult, RunSummary, WorkItem, TestCase
} from './types';

// ─── Config ─────────────────────────────────────────────────

function loadConfig(): AgentConfig {
  const args = process.argv.slice(2);
  const modeArg = args.find((a) => a.startsWith('--mode='))?.split('=')[1]
    ?? args[args.indexOf('--mode') + 1]
    ?? 'full';

  return {
    mode: (modeArg as AgentConfig['mode']) ?? 'full',
    sprintName: process.env.SPRINT_NAME || undefined,
    regressionPlanId: parseInt(process.env.REGRESSION_PLAN_ID ?? '1', 10),
    outputDir: process.env.OUTPUT_DIR ?? './output',
    dryRun: process.env.DRY_RUN === 'true',
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function findExistingCoverage(
  workItemId: number,
  allTestCases: TestCase[]
): TestCase[] {
  return allTestCases.filter((tc) =>
    tc.linkedWorkItemIds.includes(workItemId)
  );
}

async function saveGherkinFile(
  outputDir: string,
  gherkin: string,
  workItemId: number,
  featureTitle: string
): Promise<void> {
  const featuresDir = path.join(outputDir, 'features');
  fs.mkdirSync(featuresDir, { recursive: true });

  const slug = featureTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const filePath = path.join(featuresDir, `pbi-${workItemId}-${slug}.feature`);
  fs.writeFileSync(filePath, gherkin, 'utf8');
  console.log(`📄 Feature salva: ${filePath}`);
}

function saveSummary(outputDir: string, summary: RunSummary): void {
  const summaryPath = path.join(outputDir, 'run-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMO DA EXECUÇÃO');
  console.log('═'.repeat(60));
  console.log(`  Work Items processados : ${summary.totalWorkItems}`);
  console.log(`  Sucesso                : ${summary.successCount}`);
  console.log(`  Erros                  : ${summary.errorCount}`);
  console.log(`  Cenários BDD gerados   : ${summary.totalBDDScenarios}`);
  console.log(`  Specs Playwright       : ${summary.totalPlaywrightSpecs}`);
  console.log(`  Duração                : ${(summary.durationMs / 1000).toFixed(1)}s`);
  console.log('═'.repeat(60));
  console.log(`\n📁 Artefatos salvos em: ${path.resolve(outputDir)}`);
}

// ─── Orchestrator Principal ──────────────────────────────────

async function run(): Promise<void> {
  const config = loadConfig();
  const startTime = Date.now();

  console.log('\n' + '═'.repeat(60));
  console.log('🚀 QA AGENT — Azure DevOps + Claude + Playwright');
  console.log('═'.repeat(60));
  console.log(`  Modo       : ${config.mode.toUpperCase()}`);
  console.log(`  Sprint     : ${config.sprintName ?? 'sprint ativo'}`);
  console.log(`  Plan ID    : ${config.regressionPlanId}`);
  console.log(`  Output Dir : ${config.outputDir}`);
  console.log(`  Dry Run    : ${config.dryRun ? 'SIM (não publica no Azure)' : 'não'}`);
  console.log('═'.repeat(60) + '\n');

  // ── Inicializa clientes ──────────────────────────────────────
  const azureClient = new AzureDevOpsClient();
  const bddAgent = new BDDGeneratorAgent();
  const playwrightAgent = new PlaywrightGeneratorAgent();

  // ── Fase 1: Leitura do Azure DevOps ─────────────────────────
  console.log('📥 FASE 1: Leitura do Azure DevOps\n');

  const [workItems, testPlan] = await Promise.all([
    azureClient.getWorkItemsBySprint(config.sprintName),
    azureClient.getTestPlan(config.regressionPlanId),
  ]);

  if (workItems.length === 0) {
    console.log('⚠️  Nenhum PBI encontrado. Encerrando.');
    return;
  }

  // Flatten de todos os test cases da suite de regressão
  const allTestCases: TestCase[] = testPlan.suites.flatMap((s) => s.testCases);

  console.log(`\n✅ Leitura concluída:`);
  console.log(`   ${workItems.length} PBIs encontrados`);
  console.log(`   ${allTestCases.length} test cases na suite de regressão\n`);

  // ── Fase 2: Processamento por PBI ───────────────────────────
  console.log('⚙️  FASE 2: Geração de BDD e Playwright\n');

  const results: AgentResult[] = [];
  let totalBDDScenarios = 0;
  let totalPlaywrightSpecs = 0;

  for (const workItem of workItems) {
    const result: AgentResult = {
      workItemId: workItem.id,
      workItemTitle: workItem.title,
      status: 'success',
    };

    try {
      const existingCoverage = findExistingCoverage(workItem.id, allTestCases);

      // ── BDD ──────────────────────────────────────────────────
      if (config.mode === 'bdd' || config.mode === 'full') {
        const { feature, gapReport } = await bddAgent.generate({
          workItem,
          existingTestCases: existingCoverage,
        });

        result.bddFeature = feature;
        result.gapReport = gapReport;
        totalBDDScenarios += feature.scenarios.length;

        // Salva o .feature
        await saveGherkinFile(
          config.outputDir,
          feature.gherkinRaw,
          workItem.id,
          feature.featureTitle
        );

        // Publica como Test Cases no Azure (se não for dry run)
        if (!config.dryRun && gapReport.coverageGap.length > 0) {
          // Encontra a suite principal da regressão
          const targetSuite = testPlan.suites[0];
          if (targetSuite) {
            for (const scenario of feature.scenarios) {
              const steps = scenario.steps.given
                .concat(scenario.steps.when, scenario.steps.then)
                .map((s) => ({ action: s, expectedResult: '' }));

              await azureClient.createTestCase(
                targetSuite.id,
                config.regressionPlanId,
                scenario.title,
                steps,
                workItem.id
              );
            }
            console.log(
              `📤 [Azure] ${feature.scenarios.length} test cases publicados no Plan #${config.regressionPlanId}`
            );
          }
        }
      }

      // ── Playwright ───────────────────────────────────────────
      if (config.mode === 'playwright' || config.mode === 'full') {
        if (result.bddFeature) {
          const spec = await playwrightAgent.generate(result.bddFeature);
          result.playwrightSpec = spec;
          totalPlaywrightSpecs++;
        }
      }

    } catch (err: any) {
      console.error(`❌ Erro ao processar PBI #${workItem.id}: ${err.message}`);
      result.status = 'error';
      result.error = err.message;
    }

    results.push(result);
  }

  // ── Fase 3: Gera config Playwright e sumário ─────────────────
  if (config.mode === 'playwright' || config.mode === 'full') {
    playwrightAgent.generateConfig();
  }

  const summary: RunSummary = {
    totalWorkItems: workItems.length,
    successCount: results.filter((r) => r.status === 'success').length,
    errorCount: results.filter((r) => r.status === 'error').length,
    totalBDDScenarios,
    totalPlaywrightSpecs,
    results,
    durationMs: Date.now() - startTime,
  };

  saveSummary(config.outputDir, summary);
}

// ─── Entry Point ─────────────────────────────────────────────
run().catch((err) => {
  console.error('\n💥 Erro fatal:', err.message);
  process.exit(1);
});
