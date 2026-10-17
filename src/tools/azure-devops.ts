// ============================================================
// tools/azure-devops.ts — Cliente REST Azure DevOps
// ============================================================

import axios, { AxiosInstance } from 'axios';
import {
  WorkItem, TestPlan, TestSuite, TestCase, TestStep
} from '../types';

export class AzureDevOpsClient {
  private client: AxiosInstance;
  private org: string;
  private project: string;

  constructor() {
    const pat = process.env.AZURE_PAT!;
    this.org = process.env.AZURE_ORG!;
    this.project = process.env.AZURE_PROJECT!;

    if (!pat || !this.org || !this.project) {
      throw new Error(
        'Faltam variáveis de ambiente: AZURE_PAT, AZURE_ORG, AZURE_PROJECT'
      );
    }

    // Azure DevOps usa Basic Auth com PAT: base64(":" + pat)
    const token = Buffer.from(`:${pat}`).toString('base64');

    this.client = axios.create({
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  private get baseUrl(): string {
    return `https://dev.azure.com/${this.org}/${this.project}`;
  }

  private get apiUrl(): string {
    return `${this.baseUrl}/_apis`;
  }

  // ─── Work Items ─────────────────────────────────────────────

  /**
   * Busca PBIs/User Stories de um sprint via WIQL
   */
  async getWorkItemsBySprint(sprintName?: string): Promise<WorkItem[]> {
    const iterationFilter = sprintName
      ? `AND [System.IterationPath] = '${this.project}\\${sprintName}'`
      : `AND [System.IterationPath] = @currentIteration('[${this.project}]\\Team')`;

    const wiqlQuery = {
      query: `
        SELECT [System.Id], [System.Title], [System.State]
        FROM WorkItems
        WHERE [System.TeamProject] = '${this.project}'
          AND [System.WorkItemType] IN ('Product Backlog Item', 'User Story')
          AND [System.State] NOT IN ('Closed', 'Removed')
          ${iterationFilter}
        ORDER BY [System.CreatedDate] DESC
      `,
    };

    console.log('🔵 [Azure] Executando WIQL query...');

    const wiqlResp = await this.client.post(
      `${this.apiUrl}/wit/wiql?api-version=7.1`,
      wiqlQuery
    );

    const ids: number[] = wiqlResp.data.workItems.map((wi: any) => wi.id);

    if (ids.length === 0) {
      console.log('⚠️  Nenhum Work Item encontrado para esse sprint.');
      return [];
    }

    console.log(`🔵 [Azure] ${ids.length} PBIs encontrados. Buscando detalhes...`);

    // Busca os detalhes em batch (máx 200 ids por chamada)
    const fields = [
      'System.Id',
      'System.Title',
      'System.Description',
      'Microsoft.VSTS.Common.AcceptanceCriteria',
      'System.State',
      'System.Tags',
      'System.IterationPath',
      'System.AssignedTo',
      'System.WorkItemType',
    ].join(',');

    const batchSize = 200;
    const allItems: WorkItem[] = [];

    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      const resp = await this.client.get(
        `${this.apiUrl}/wit/workitems?ids=${chunk.join(',')}&fields=${fields}&api-version=7.1`
      );

      for (const item of resp.data.value) {
        allItems.push(this.mapWorkItem(item));
      }
    }

    return allItems;
  }

  private mapWorkItem(raw: any): WorkItem {
    const f = raw.fields;
    return {
      id: raw.id,
      title: f['System.Title'] ?? '',
      description: this.stripHtml(f['System.Description'] ?? ''),
      acceptanceCriteria: this.stripHtml(
        f['Microsoft.VSTS.Common.AcceptanceCriteria'] ?? ''
      ),
      state: f['System.State'] ?? '',
      tags: (f['System.Tags'] ?? '')
        .split(';')
        .map((t: string) => t.trim())
        .filter(Boolean),
      iterationPath: f['System.IterationPath'] ?? '',
      assignedTo: f['System.AssignedTo']?.displayName ?? '',
      workItemType: f['System.WorkItemType'] ?? 'Product Backlog Item',
    };
  }

  // ─── Test Plans ─────────────────────────────────────────────

  /**
   * Lê um Test Plan completo com todas as suas suites e test cases
   */
  async getTestPlan(planId: number): Promise<TestPlan> {
    console.log(`🔵 [Azure] Buscando Test Plan #${planId}...`);

    const planResp = await this.client.get(
      `${this.apiUrl}/testplan/plans/${planId}?api-version=7.1-preview.1`
    );
    const planName: string = planResp.data.name;

    const suitesResp = await this.client.get(
      `${this.apiUrl}/testplan/plans/${planId}/suites?api-version=7.1-preview.1`
    );

    const suites: TestSuite[] = [];

    for (const suite of suitesResp.data.value ?? []) {
      const testCases = await this.getTestCasesForSuite(planId, suite.id);
      suites.push({
        id: suite.id,
        name: suite.name,
        planId,
        testCases,
      });
    }

    console.log(
      `🔵 [Azure] Test Plan "${planName}": ${suites.length} suites, ` +
      `${suites.reduce((a, s) => a + s.testCases.length, 0)} test cases no total`
    );

    return { id: planId, name: planName, suites };
  }

  private async getTestCasesForSuite(
    planId: number,
    suiteId: number
  ): Promise<TestCase[]> {
    try {
      const resp = await this.client.get(
        `${this.apiUrl}/testplan/plans/${planId}/suites/${suiteId}/testcase?api-version=7.1-preview.3`
      );

      const cases: TestCase[] = [];

      for (const tc of resp.data.value ?? []) {
        const wiId: number = tc.workItem.id;
        const details = await this.client.get(
          `${this.apiUrl}/wit/workitems/${wiId}?` +
          `fields=System.Title,Microsoft.VSTS.TCM.Steps,System.State,` +
          `Microsoft.VSTS.Common.AutomationStatus&api-version=7.1`
        );

        cases.push(this.mapTestCase(details.data, tc));
      }

      return cases;
    } catch {
      return [];
    }
  }

  private mapTestCase(raw: any, suiteItem: any): TestCase {
    const f = raw.fields;
    return {
      id: raw.id,
      title: f['System.Title'] ?? '',
      state: f['System.State'] ?? '',
      automationStatus:
        f['Microsoft.VSTS.Common.AutomationStatus'] ?? 'Not Automated',
      steps: this.parseTestSteps(f['Microsoft.VSTS.TCM.Steps'] ?? ''),
      linkedWorkItemIds: (suiteItem.pointAssignments ?? []).map(
        (p: any) => p.workItem?.id
      ).filter(Boolean),
    };
  }

  private parseTestSteps(stepsXml: string): TestStep[] {
    // Steps vêm em XML; parseia de forma simples
    const steps: TestStep[] = [];
    const stepRegex =
      /<step[^>]*>.*?<parameterizedString[^>]*>(.*?)<\/parameterizedString>.*?<parameterizedString[^>]*>(.*?)<\/parameterizedString>/gs;
    let match;
    while ((match = stepRegex.exec(stepsXml)) !== null) {
      steps.push({
        action: this.stripHtml(match[1]),
        expectedResult: this.stripHtml(match[2]),
      });
    }
    return steps;
  }

  // ─── Publicação de resultados ────────────────────────────────

  /**
   * Cria um Test Case no Azure Test Plans e o vincula a um PBI
   */
  async createTestCase(
    suiteId: number,
    planId: number,
    title: string,
    steps: TestStep[],
    linkedWorkItemId: number
  ): Promise<number> {
    const stepsXml = steps
      .map(
        (s, i) => `
        <step id="${i + 2}" type="ValidateStep">
          <parameterizedString isformatted="true">${s.action}</parameterizedString>
          <parameterizedString isformatted="true">${s.expectedResult}</parameterizedString>
          <description/>
        </step>`
      )
      .join('');

    const createResp = await this.client.post(
      `${this.apiUrl}/wit/workitems/$Test Case?api-version=7.1`,
      [
        { op: 'add', path: '/fields/System.Title', value: title },
        {
          op: 'add',
          path: '/fields/Microsoft.VSTS.TCM.Steps',
          value: `<steps id="0" last="${steps.length + 1}">${stepsXml}</steps>`,
        },
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'Microsoft.VSTS.Common.TestedBy-Reverse',
            url: `${this.baseUrl}/_apis/wit/workItems/${linkedWorkItemId}`,
          },
        },
      ],
      { headers: { 'Content-Type': 'application/json-patch+json' } }
    );

    const tcId: number = createResp.data.id;

    // Adiciona à suite
    await this.client.post(
      `${this.apiUrl}/testplan/plans/${planId}/suites/${suiteId}/testcase?api-version=7.1-preview.3`,
      [{ workItem: { id: tcId } }]
    );

    return tcId;
  }

  // ─── Utils ───────────────────────────────────────────────────

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
