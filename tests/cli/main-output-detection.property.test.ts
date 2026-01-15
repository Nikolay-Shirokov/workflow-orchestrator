/**
 * Property-based тесты для определения основного выходного документа
 *
 * Feature: interactive-cli-interface, Property 15: Определение основного выходного документа
 * Validates: Requirements 12.2
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorkflowState } from '../../src/core/types.js';
import { findMainOutputPath } from '../../src/cli/auto-open-utils.js';

const OUTPUT_EXTENSIONS = ['.md', '.txt', '.yaml', '.json'];
const NON_OUTPUT_EXTENSIONS = ['.log', '.tmp', '.bin'];

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

function createState(historyArtifacts: string[], artifactPaths: string[]): WorkflowState {
  return {
    sessionId: 'session_test',
    workflowName: 'main-output-test',
    workflowVersion: '1.0.0',
    currentStep: 'step_1',
    status: 'completed',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedSteps: ['step_1'],
    artifacts: Object.fromEntries(
      artifactPaths.map(artifactPath => [path.basename(artifactPath), artifactPath])
    ),
    context: {},
    history: [
      {
        stepId: 'step_1',
        stepName: 'Step 1',
        status: 'success',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        executionTime: 1,
        artifacts: historyArtifacts
      }
    ],
    errors: []
  };
}

describe('Main Output Property Tests', () => {
  /**
   * Property 15: Определение основного выходного документа
   * Feature: interactive-cli-interface, Property 15: Определение основного выходного документа
   * Validates: Requirements 12.2
   *
   * Для любого списка артефактов в истории последний файл
   * с расширением .md/.txt/.yaml/.json считается основным.
   */
  test('Property 15: Last valid history artifact is selected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        async (validFlags) => {
          const tempDir = await createTempDir('main-output-history');

          try {
            const hasValid = validFlags.some(flag => flag);
            if (!hasValid) {
              validFlags[validFlags.length - 1] = true;
            }

            const historyArtifacts: string[] = [];
            const artifactPaths: string[] = [];
            let expectedPath: string | undefined;

            for (let i = 0; i < validFlags.length; i++) {
              const ext = validFlags[i]
                ? OUTPUT_EXTENSIONS[i % OUTPUT_EXTENSIONS.length]
                : NON_OUTPUT_EXTENSIONS[i % NON_OUTPUT_EXTENSIONS.length];
              const filePath = path.join(tempDir, `artifact_${i}${ext}`);
              await fs.writeFile(filePath, `data-${i}`, 'utf-8');

              historyArtifacts.push(filePath);
              artifactPaths.push(filePath);

              if (validFlags[i]) {
                expectedPath = filePath;
              }
            }

            const state = createState(historyArtifacts, artifactPaths);
            const actualPath = await findMainOutputPath(state);

            expect(actualPath).toBe(expectedPath);
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.1: Основной документ определяется по времени создания,
   * если в истории нет подходящих артефактов.
   */
  test('Property 15.1: Fallback uses latest timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
        async (validFlags) => {
          const tempDir = await createTempDir('main-output-fallback');

          try {
            const hasValid = validFlags.some(flag => flag);
            if (!hasValid) {
              validFlags[0] = true;
            }

            const artifactPaths: string[] = [];
            const historyArtifacts: string[] = [];
            const baseTime = Date.now();
            let expectedPath: string | undefined;

            for (let i = 0; i < validFlags.length; i++) {
              const ext = validFlags[i]
                ? OUTPUT_EXTENSIONS[i % OUTPUT_EXTENSIONS.length]
                : NON_OUTPUT_EXTENSIONS[i % NON_OUTPUT_EXTENSIONS.length];
              const filePath = path.join(tempDir, `artifact_${i}${ext}`);
              await fs.writeFile(filePath, `data-${i}`, 'utf-8');

              const timestamp = new Date(baseTime + i * 1000);
              await fs.utimes(filePath, timestamp, timestamp);

              artifactPaths.push(filePath);

              if (validFlags[i]) {
                expectedPath = filePath;
              }
            }

            const state = createState(historyArtifacts, artifactPaths);
            const actualPath = await findMainOutputPath(state);

            expect(actualPath).toBe(expectedPath);
          } finally {
            await cleanupTempDir(tempDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

