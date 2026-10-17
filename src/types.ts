// ============================================================
// types.ts — Interfaces compartilhadas do sistema de agentes
// ============================================================

// ─── Azure DevOps ────────────────────────────────────────────

export interface WorkItem {
  id: number;
  title: string;
  description: string;
  acceptanceCriteria: string;
  state: string;
  tags: string[];
  iterationPath: string;
  assignedTo: string;
  workItemType: 'Product Backlog Item' | 'User Story' | 'Bug' | 'Task';
}

export interface TestCase {
  id: number;
  title: string;
  steps: TestStep[];
  automationStatus: 'Automated' | 'Not Automated' | 'Planned';
  state: string;
  linkedWorkItemIds: number[];
}

export interface TestStep {
  action: string;
  expectedResult: string;
}

export interface TestSuite {
  id: number;
  name: string;
  planId: number;
  testCases: TestCase[];
}

export interface TestPlan {
  id: number;
  name: string;
  suites: TestSuite[];
}

// ─── BDD ─────────────────────────────────────────────────────

export interface BDDScenario {
  title: string;
  tags: string[];
  steps: {
    given: string[];
    when: string[];
    then: string[];
    and?: string[];
  };
  isOutline?: boolean;
  examples?: Record<string, string>[];
}

export interface BDDFeature {
  featureTitle: string;
  description: string;
  workItemId: number;
  scenarios: BDDScenario[];
  gherkinRaw: string;
}

// ─── Playwright ──────────────────────────────────────────────

export interface PlaywrightSpec {
  fileName: string;
  content: string;
  featureTitle: string;
  workItemId: number;
  scenarioCount: number;
}

export interface PageObject {
  className: string;
  fileName: string;
  content: string;
}

// ─── Orchestrator ────────────────────────────────────────────

export type AgentMode = 'bdd' | 'playwright' | 'full';

export interface AgentConfig {
  mode: AgentMode;
  sprintName?: string;
  regressionPlanId: number;
  outputDir: string;
  dryRun?: boolean;
}

export interface AgentResult {
  workItemId: number;
  workItemTitle: string;
  bddFeature?: BDDFeature;
  playwrightSpec?: PlaywrightSpec;
  gapReport?: GapReport;
  status: 'success' | 'partial' | 'error';
  error?: string;
}

export interface GapReport {
  workItemId: number;
  existingCoverage: number;   // nº de test cases já existentes
  newScenariosGenerated: number;
  coverageGap: string[];      // cenários sem cobertura identificados
}

export interface RunSummary {
  totalWorkItems: number;
  successCount: number;
  errorCount: number;
  totalBDDScenarios: number;
  totalPlaywrightSpecs: number;
  results: AgentResult[];
  durationMs: number;
}
