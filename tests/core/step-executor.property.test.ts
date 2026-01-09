/**
 * Property-based тесты для исполнителя шагов
 * Проверяют универсальные свойства корректности выполнения шагов
 */

import * as fc from 'fast-check';
import { DefaultStepExecutor } from '../../src/core/step-executor.js';
import {
  WorkflowStep,
  ExecutionContext,
  WorkflowState
} from '../../src/core/types.js';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import { MockCLIAdapter } from '../../src/adapters/mock-cli-adapter.js';
import { DefaultTemplateEngine } from '../../src/core/template-engine.js';
import { createArtifactManager } from '../../src/core/artifact-manager.js';
import { getLogger } from '../../src/core/logger.js';
import * as fs from 'fs/promises';

// Вспомогательная функция для создания тестового контекста
function createTestContext(
  contextVariables: Record<string, unknown> = {}
): ExecutionContext {
  const state: WorkflowState = {
    sessionId: 'test-session',
    workflowName: 'test-workflow',
    workflowVersion: '1.0.0',
    currentStep: 'test-step',
    status: 'running',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedSteps: [],
    artifacts: {},
    context: {
      default_adapter: 'mock-adapter',
      ...contextVariables
    },
    history: [],
    errors: []
  };

  const adapters = new AdapterRegistry();
  const mockAdapter = new MockCLIAdapter('mock-adapter', '1.0.0');
  mockAdapter.setResponse(/.*/, 'Test response');
  adapters.register(mockAdapter);

  const templateEngine = new DefaultTemplateEngine();
  const artifactManager = createArtifactManager({
    baseDir: './test-artifacts'
  });
  const logger = getLogger();

  return {
    state,
    adapters,
    templateEngine,
    artifactManager,
    logger
  };
}

// Очистка тестовых артефактов
async function cleanupTestArtifacts() {
  try {
    await fs.rm('./test-artifacts', { recursive: true, force: true });
  } catch {
    // Игнорируем ошибки
  }
}

describe('Step Executor Property Tests', () => {
  beforeEach(async () => {
    await cleanupTestArtifacts();
  });

  afterEach(async () => {
    await cleanupTestArtifacts();
  });

  /**
   * Feature: workflow-orchestrator, Property 8: Условное выполнение
   * Validates: Requirements 2.3
   * 
   * Для любого шага рабочего процесса с условием, выполнение процесса с разными
   * значениями условия должно приводить к выполнению или пропуску шага соответственно.
   */
  describe('Property 8: Условное выполнение', () => {
    test('должен выполнять шаг когда условие истинно', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем имя переменной условия
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
          // Генерируем значение условия (истинное)
          fc.oneof(
            fc.constant(true),
            fc.constant('true'),
            fc.constant('yes'),
            fc.integer({ min: 1, max: 100 }),
            fc.string({ minLength: 1, maxLength: 50 })
          ),
          async (conditionVar, conditionValue) => {
            const executor = new DefaultStepExecutor();
            
            // Создаем контекст с переменной условия
            const context = createTestContext({
              [conditionVar]: conditionValue
            });
            
            // Создаем шаг с условием
            const step: WorkflowStep = {
              id: 'conditional-step',
              name: 'Conditional Step',
              type: 'model',
              condition: conditionVar,
              prompt_template: 'Test prompt'
            };
            
            // Выполняем шаг
            const result = await executor.executeStep(step, context);
            
            // Шаг должен быть выполнен (не пропущен)
            expect(result.status).not.toBe('skipped');
            expect(result.status).toBe('success');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен пропускать шаг когда условие ложно', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем имя переменной условия
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
          // Генерируем значение условия (ложное)
          fc.oneof(
            fc.constant(false),
            fc.constant('false'),
            fc.constant(''),
            fc.constant(0),
            fc.constant(null),
            fc.constant(undefined)
          ),
          async (conditionVar, conditionValue) => {
            const executor = new DefaultStepExecutor();
            
            // Создаем контекст с переменной условия
            const context = createTestContext({
              [conditionVar]: conditionValue
            });
            
            // Создаем шаг с условием
            const step: WorkflowStep = {
              id: 'conditional-step',
              name: 'Conditional Step',
              type: 'model',
              condition: conditionVar,
              prompt_template: 'Test prompt'
            };
            
            // Выполняем шаг
            const result = await executor.executeStep(step, context);
            
            // Шаг должен быть пропущен
            expect(result.status).toBe('skipped');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать вложенные условия', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем структуру с вложенными свойствами
          fc.record({
            object: fc.record({
              property: fc.boolean()
            })
          }),
          async (contextData) => {
            const executor = new DefaultStepExecutor();
            
            // Создаем контекст с вложенной структурой
            const context = createTestContext(contextData);
            
            // Создаем шаг с вложенным условием
            const step: WorkflowStep = {
              id: 'nested-conditional-step',
              name: 'Nested Conditional Step',
              type: 'model',
              condition: 'object.property',
              prompt_template: 'Test prompt'
            };
            
            // Выполняем шаг
            const result = await executor.executeStep(step, context);
            
            // Статус должен соответствовать значению вложенного свойства
            if (contextData.object.property) {
              expect(result.status).not.toBe('skipped');
            } else {
              expect(result.status).toBe('skipped');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен пропускать шаг если переменная условия не существует', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем имя несуществующей переменной
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
          async (nonExistentVar) => {
            const executor = new DefaultStepExecutor();
            
            // Создаем контекст без переменной условия
            const context = createTestContext({});
            
            // Создаем шаг с условием на несуществующую переменную
            const step: WorkflowStep = {
              id: 'missing-var-step',
              name: 'Missing Variable Step',
              type: 'model',
              condition: nonExistentVar,
              prompt_template: 'Test prompt'
            };
            
            // Выполняем шаг
            const result = await executor.executeStep(step, context);
            
            // Шаг должен быть пропущен
            expect(result.status).toBe('skipped');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: workflow-orchestrator, Property 37: Условное выполнение шага
   * Validates: Requirements 8.3
   * 
   * Для любого опционального шага с условием доступности, шаг должен выполняться
   * только когда условие выполнено.
   */
  describe('Property 37: Условное выполнение шага', () => {
    test('должен выполнять опциональный шаг когда условие доступности выполнено', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем имя условия доступности
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_.]*$/),
          async (availabilityCondition) => {
            const executor = new DefaultStepExecutor();
            
            // Создаем контекст с условием доступности = true
            const contextVars: Record<string, unknown> = {};
            const parts = availabilityCondition.split('.');
            let current: Record<string, unknown> = contextVars;
            
            for (let i = 0; i < parts.length - 1; i++) {
              current[parts[i]] = {};
              current = current[parts[i]] as Record<string, unknown>;
            }
            current[parts[parts.length - 1]] = true;
            
            const context = createTestContext(contextVars);
            
            // Создаем опциональный шаг с условием доступности
            const step: WorkflowStep = {
              id: 'optional-step',
              name: 'Optional Step',
              type: 'model',
              condition: availabilityCondition,
              prompt_template: 'Test prompt'
            };
            
            // Выполняем шаг
            const result = await executor.executeStep(step, context);
            
            // Шаг должен быть выполнен
            expect(result.status).toBe('success');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен пропускать опциональный шаг когда условие доступности не выполнено', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем имя условия доступности
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_.]*$/),
          async (availabilityCondition) => {
            const executor = new DefaultStepExecutor();
            
            // Создаем контекст с условием доступности = false
            const contextVars: Record<string, unknown> = {};
            const parts = availabilityCondition.split('.');
            let current: Record<string, unknown> = contextVars;
            
            for (let i = 0; i < parts.length - 1; i++) {
              current[parts[i]] = {};
              current = current[parts[i]] as Record<string, unknown>;
            }
            current[parts[parts.length - 1]] = false;
            
            const context = createTestContext(contextVars);
            
            // Создаем опциональный шаг с условием доступности
            const step: WorkflowStep = {
              id: 'optional-step',
              name: 'Optional Step',
              type: 'model',
              condition: availabilityCondition,
              prompt_template: 'Test prompt'
            };
            
            // Выполняем шаг
            const result = await executor.executeStep(step, context);
            
            // Шаг должен быть пропущен
            expect(result.status).toBe('skipped');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать условия доступности MCP-инструментов', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем имя MCP-инструмента
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
          // Генерируем доступность
          fc.boolean(),
          async (toolName, isAvailable) => {
            const executor = new DefaultStepExecutor();
            
            // Создаем контекст с информацией о доступности MCP-инструмента
            const context = createTestContext({
              mcp_tools: {
                [`${toolName}_available`]: isAvailable
              }
            });
            
            // Создаем шаг с условием доступности MCP-инструмента
            const step: WorkflowStep = {
              id: 'mcp-dependent-step',
              name: 'MCP Dependent Step',
              type: 'model',
              condition: `mcp_tools.${toolName}_available`,
              prompt_template: 'Test prompt with MCP tool'
            };
            
            // Выполняем шаг
            const result = await executor.executeStep(step, context);
            
            // Статус должен соответствовать доступности инструмента
            if (isAvailable) {
              expect(result.status).toBe('success');
            } else {
              expect(result.status).toBe('skipped');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен выполнять шаг без условия всегда', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем случайный контекст
          fc.dictionary(
            fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
            fc.oneof(
              fc.boolean(),
              fc.string(),
              fc.integer(),
              fc.constant(null)
            )
          ),
          async (contextVars) => {
            const executor = new DefaultStepExecutor();
            
            const context = createTestContext(contextVars);
            
            // Создаем шаг БЕЗ условия
            const step: WorkflowStep = {
              id: 'unconditional-step',
              name: 'Unconditional Step',
              type: 'model',
              // condition отсутствует
              prompt_template: 'Test prompt'
            };
            
            // Выполняем шаг
            const result = await executor.executeStep(step, context);
            
            // Шаг должен быть выполнен (не пропущен)
            expect(result.status).not.toBe('skipped');
            expect(result.status).toBe('success');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
