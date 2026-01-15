/**
 * Property-based тесты для возобновления процесса
 *
 * Проверяет Property 17 из документа проектирования:
 * Инициализация артефактов при возобновлении
 *
 * Feature: interactive-cli-interface, Property 17: Инициализация артефактов при возобновлении
 * Validates: Requirements 14.5, 14.6
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWorkflowEngine, WorkflowEngine } from '../../src/core/workflow-engine.js';
import { createStateManager } from '../../src/core/state-manager.js';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import { DefaultTemplateEngine } from '../../src/core/template-engine.js';
import { createArtifactManager } from '../../src/core/artifact-manager.js';
import { WorkflowConfigParser } from '../../src/core/workflow-config-parser.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import {
  StepExecutor,
  StepResult,
  WorkflowConfig,
  WorkflowStep
} from '../../src/core/types.js';

// Минимальный мок-исполнитель шагов без внешних эффектов
class MockStepExecutor implements StepExecutor {
  async executeStep(step: WorkflowStep, _context: any): Promise<StepResult> {
    return {
      stepId: step.id,
      status: 'success',
      outputs: {},
      artifacts: [],
      executionTime: 1
    };
  }

  async executeParallel(steps: WorkflowStep[], _context: any): Promise<StepResult[]> {
    return Promise.all(steps.map(step => this.executeStep(step, _context)));
  }

  async executeWithRetry(step: WorkflowStep, _context: any, _maxRetries?: number): Promise<StepResult> {
    return this.executeStep(step, _context);
  }
}

async function createTempDir(prefix: string): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp', `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Игнорируем ошибки очистки
  }
}

describe('Resume Property Tests', () => {
  /**
   * Property 17: Инициализация артефактов при возобновлении
   * Feature: interactive-cli-interface, Property 17: Инициализация артефактов при возобновлении
   * Validates: Requirements 14.5, 14.6
   *
   * Для любого выбора шага, артефакты должны сохраняться только
   * для предыдущих шагов, а артефакты выбранного и последующих
   * шагов должны быть проигнорированы.
   */
  test('Property 17: Resume initializes artifacts from previous steps only', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 1, max: 20 }),
        async (artifactCounts, rawFromStep) => {
          const stepsCount = artifactCounts.length;
          const fromStep = (rawFromStep % stepsCount) + 1;

          const tempDir = await createTempDir('resume-artifact-prop');
          const stateDir = path.join(tempDir, 'state');
          const artifactsDir = path.join(tempDir, 'artifacts');

          try {
            await fs.mkdir(stateDir, { recursive: true });
            await fs.mkdir(artifactsDir, { recursive: true });

            const logger = new Logger({
              level: LogLevel.ERROR,
              enableConsole: false,
              enableFile: false
            });

            const config: WorkflowConfig = {
              name: 'resume-artifact-test',
              version: '1.0.0',
              settings: {
                artifacts_dir: artifactsDir
              },
              steps: artifactCounts.map((_, index) => ({
                id: `step_${index + 1}`,
                name: `Step ${index + 1}`,
                type: 'script'
              }))
            };

            const stateManager = createStateManager({
              stateDir,
              logger
            });

            const workflowEngine: WorkflowEngine = createWorkflowEngine({
              configParser: new WorkflowConfigParser(),
              stateManager,
              stepExecutor: new MockStepExecutor(),
              adapterRegistry: new AdapterRegistry(),
              templateEngine: new DefaultTemplateEngine(),
              artifactManager: createArtifactManager({
                baseDir: artifactsDir,
                sessionDirTemplate: '',
                logger
              }),
              logger
            });

            const initialState = await stateManager.createState(
              config.name,
              config.version,
              config.steps[0].id
            );

            const artifactPathsByStep = config.steps.map((step, index) => {
              const count = artifactCounts[index];
              return Array.from({ length: count }, (_, artifactIndex) => {
                const fileName = `${step.id}_artifact_${artifactIndex + 1}.txt`;
                return path.join(artifactsDir, fileName);
              });
            });

            // Создаем файлы артефактов на диске
            for (const artifactPaths of artifactPathsByStep) {
              for (const artifactPath of artifactPaths) {
                await fs.writeFile(artifactPath, 'test', 'utf-8');
              }
            }

            initialState.status = 'completed';
            initialState.completedSteps = config.steps.map(step => step.id);
            initialState.currentStep = config.steps[config.steps.length - 1].id;
            initialState.history = config.steps.map((step, index) => ({
              stepId: step.id,
              stepName: step.name,
              status: 'success',
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              executionTime: 1,
              artifacts: artifactPathsByStep[index]
            }));
            initialState.artifacts = Object.fromEntries(
              artifactPathsByStep
                .flat()
                .map(artifactPath => [path.basename(artifactPath), artifactPath])
            );
            initialState.context = {
              workflow_name: config.name,
              workflow_version: config.version,
              session_id: initialState.sessionId,
              artifacts_dir: artifactsDir
            };

            await stateManager.saveState(initialState);

            const resumedState = await workflowEngine.resume(
              initialState.sessionId,
              config,
              undefined,
              fromStep
            );

            const expectedArtifactPaths = new Set(
              artifactPathsByStep
                .slice(0, fromStep - 1)
                .flat()
            );

            const actualArtifactPaths = new Set(Object.values(resumedState.artifacts));

            expect(actualArtifactPaths.size).toBe(expectedArtifactPaths.size);
            for (const artifactPath of actualArtifactPaths) {
              expect(expectedArtifactPaths.has(artifactPath)).toBe(true);
            }
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});




