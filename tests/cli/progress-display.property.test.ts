/**
 * Property-Based тесты для ProgressDisplay
 *
 * Property 11: Обратная совместимость логового режима
 * Validates: Requirements 7.1, 7.2, 7.3
 *
 * Проверяет, что логовый режим сохраняет всю функциональность
 * и выводит информацию последовательно без обновления на месте.
 */

import * as fc from 'fast-check';
import { ProgressDisplay } from '../../src/cli/progress-display.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { WorkflowConfig, WorkflowState, WorkflowStep, StepHistory } from '../../src/core/types.js';

/**
 * Mock логгер для захвата вывода
 */
class MockLogger extends Logger {
  public logs: Array<{ level: string; message: string }> = [];

  constructor() {
    super({
      level: LogLevel.INFO,
      enableConsole: false,
      enableFile: false
    });
  }

  debug(message: string): void {
    this.logs.push({ level: 'debug', message });
  }

  info(message: string): void {
    this.logs.push({ level: 'info', message });
  }

  warn(message: string): void {
    this.logs.push({ level: 'warn', message });
  }

  error(message: string): void {
    this.logs.push({ level: 'error', message });
  }

  clearLogs(): void {
    this.logs = [];
  }

  getOutput(): string {
    return this.logs.map(log => log.message).join('\n');
  }
}

/**
 * Arbitrary для генерации WorkflowConfig
 */
const workflowConfigArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  version: fc.string({ minLength: 1, maxLength: 10 }),
  description: fc.option(fc.string({ maxLength: 100 })),
  settings: fc.record({
    artifacts_dir: fc.string({ minLength: 1, maxLength: 20 }),
    default_adapter: fc.option(fc.constantFrom('claude-cli', 'openai-cli', 'gemini-cli')),
    parallel_execution: fc.option(fc.boolean()),
    max_retries: fc.option(fc.integer({ min: 0, max: 5 })),
    timeout: fc.option(fc.integer({ min: 1000, max: 60000 })),
    log_level: fc.option(fc.constantFrom('debug', 'info', 'warn', 'error'))
  }),
  steps: fc.array(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      type: fc.constantFrom('model', 'script', 'user_input'),
      role: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
      adapter: fc.option(fc.constantFrom('claude-cli', 'openai-cli', 'gemini-cli')),
      model: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
      prompt_template: fc.option(fc.string({ maxLength: 100 })),
      depends_on: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }))
    }),
    { minLength: 1, maxLength: 10 }
  )
});

describe('ProgressDisplay Property Tests', () => {
  /**
   * Property 11: Обратная совместимость логового режима
   * Requirements 7.1, 7.2, 7.3
   *
   * Проверяет, что ProgressDisplay:
   * 1. Выводит информацию последовательно (без escape-кодов для обновления на месте)
   * 2. Сохраняет всю функциональность (все события обрабатываются)
   * 3. Не использует альтернативный буфер или курсор-манипуляции
   */
  test('Property 11: Log mode maintains backwards compatibility', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 0, max: 5 }),
        (config, stepsToComplete) => {
          const mockLogger = new MockLogger();
          const display = new ProgressDisplay(mockLogger);

          // Начало процесса
          display.onWorkflowStart(config as WorkflowConfig);

          // Проверяем, что вывод начала содержит основную информацию
          let output = mockLogger.getOutput();
          expect(output).toContain(config.name);
          expect(output).toContain(config.version);
          expect(output).toContain(`Всего шагов: ${config.steps.length}`);

          // Выполняем несколько шагов
          const actualStepsToComplete = Math.min(stepsToComplete, config.steps.length);

          for (let i = 0; i < actualStepsToComplete; i++) {
            const step = config.steps[i] as WorkflowStep;

            mockLogger.clearLogs();
            display.onStepStart(step, i + 1);

            const startOutput = mockLogger.getOutput();
            expect(startOutput).toContain(step.name);
            expect(startOutput).toContain(step.id);
            expect(startOutput).toContain(`[${i + 1}/${config.steps.length}]`);

            // Завершаем шаг
            mockLogger.clearLogs();
            const history: StepHistory = {
              stepId: step.id,
              stepName: step.name,
              status: 'success',
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              executionTime: 1000 + i * 100,
              artifacts: [`artifact_${i}.txt`],
              error: undefined
            };

            display.onStepComplete(step, history);

            const completeOutput = mockLogger.getOutput();
            expect(completeOutput).toContain('завершен успешно');
          }

          // Завершаем процесс
          mockLogger.clearLogs();
          const finalState: WorkflowState = {
            sessionId: 'test-session',
            workflowName: config.name,
            workflowVersion: config.version,
            status: 'completed',
            currentStep: '',
            context: {},
            artifacts: {},
            completedSteps: config.steps.slice(0, actualStepsToComplete).map(s => s.id),
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            history: [],
            errors: []
          };

          display.onWorkflowComplete(finalState);

          const finalOutput = mockLogger.getOutput();
          expect(finalOutput).toContain('завершен успешно');
          expect(finalOutput).toContain(finalState.sessionId);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.1: Вывод не содержит ANSI escape-кодов для манипуляции курсором
   * Requirements 7.2
   *
   * Проверяет, что логовый режим не использует:
   * - Escape-коды для перемещения курсора (\x1b[<n>A, \x1b[<n>B, etc.)
   * - Escape-коды для очистки экрана (\x1b[2J, \x1b[K, etc.)
   * - Альтернативный буфер экрана (\x1b[?1049h, \x1b[?1049l)
   * - Скрытие/показ курсора (\x1b[?25l, \x1b[?25h)
   */
  test('Property 11.1: Output contains no cursor manipulation escape codes', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        (config) => {
          const mockLogger = new MockLogger();
          const display = new ProgressDisplay(mockLogger);

          display.onWorkflowStart(config as WorkflowConfig);

          // Выполняем шаг
          if (config.steps.length > 0) {
            const step = config.steps[0] as WorkflowStep;
            display.onStepStart(step, 1);

            const history: StepHistory = {
              stepId: step.id,
              stepName: step.name,
              status: 'success',
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              executionTime: 1000,
              artifacts: [],
              error: undefined
            };

            display.onStepComplete(step, history);
          }

          const finalState: WorkflowState = {
            sessionId: 'test',
            workflowName: config.name,
            workflowVersion: config.version,
            status: 'completed',
            currentStep: '',
            context: {},
            artifacts: {},
            completedSteps: config.steps.map(s => s.id),
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            history: [],
            errors: []
          };

          display.onWorkflowComplete(finalState);

          const output = mockLogger.getOutput();

          // Проверяем отсутствие escape-кодов для манипуляции курсором
          expect(output).not.toMatch(/\x1b\[\d*[ABCDEFGH]/); // Перемещение курсора
          expect(output).not.toMatch(/\x1b\[2J/); // Очистка экрана
          expect(output).not.toMatch(/\x1b\[K/); // Очистка строки
          expect(output).not.toMatch(/\x1b\[\?1049[hl]/); // Альтернативный буфер
          expect(output).not.toMatch(/\x1b\[\?25[hl]/); // Показ/скрытие курсора

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.2: Все события обрабатываются и выводятся
   * Requirements 7.3
   *
   * Проверяет, что логовый режим обрабатывает все события:
   * - onWorkflowStart
   * - onStepStart
   * - onStepComplete
   * - onStepError
   * - onWorkflowComplete
   * - onUserInputRequired
   * - onParallelStart
   * - onParallelComplete
   */
  test('Property 11.2: All events are handled and produce output', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (workflowName, version, stepId, stepName) => {
          const mockLogger = new MockLogger();
          const display = new ProgressDisplay(mockLogger);

          const config: WorkflowConfig = {
            name: workflowName,
            version: version,
            settings: { artifacts_dir: 'test' },
            steps: [
              { id: stepId, name: stepName, type: 'model' }
            ]
          };

          // Тестируем onWorkflowStart
          mockLogger.clearLogs();
          display.onWorkflowStart(config);
          expect(mockLogger.logs.length).toBeGreaterThan(0);
          expect(mockLogger.getOutput()).toContain(workflowName);

          const step = config.steps[0];

          // Тестируем onStepStart
          mockLogger.clearLogs();
          display.onStepStart(step, 1);
          expect(mockLogger.logs.length).toBeGreaterThan(0);
          expect(mockLogger.getOutput()).toContain(stepName);

          // Тестируем onStepComplete (success)
          mockLogger.clearLogs();
          const successHistory: StepHistory = {
            stepId: step.id,
            stepName: step.name,
            status: 'success',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            executionTime: 1000,
            artifacts: ['test.txt'],
            error: undefined
          };
          display.onStepComplete(step, successHistory);
          expect(mockLogger.logs.length).toBeGreaterThan(0);
          expect(mockLogger.getOutput()).toContain('✓');

          // Тестируем onStepComplete (failed)
          mockLogger.clearLogs();
          const failedHistory: StepHistory = {
            stepId: step.id,
            stepName: step.name,
            status: 'failed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            executionTime: 1000,
            artifacts: [],
            error: 'Test error'
          };
          display.onStepComplete(step, failedHistory);
          expect(mockLogger.logs.length).toBeGreaterThan(0);
          expect(mockLogger.getOutput()).toContain('✗');
          expect(mockLogger.getOutput()).toContain('Test error');

          // Тестируем onStepError
          mockLogger.clearLogs();
          const error = new Error('Test error message');
          display.onStepError(step, error);
          expect(mockLogger.logs.length).toBeGreaterThan(0);
          expect(mockLogger.getOutput()).toContain('Test error message');

          // Тестируем onUserInputRequired
          mockLogger.clearLogs();
          display.onUserInputRequired(step, 'Please provide input');
          expect(mockLogger.logs.length).toBeGreaterThan(0);
          expect(mockLogger.getOutput()).toContain('Please provide input');

          // Тестируем onParallelStart
          mockLogger.clearLogs();
          display.onParallelStart([step, step]);
          expect(mockLogger.logs.length).toBeGreaterThan(0);
          expect(mockLogger.getOutput()).toContain('Параллельное выполнение');

          // Тестируем onParallelComplete
          mockLogger.clearLogs();
          display.onParallelComplete([
            { stepId: step.id, status: 'success' },
            { stepId: step.id, status: 'failed' }
          ]);
          expect(mockLogger.logs.length).toBeGreaterThan(0);

          // Тестируем onWorkflowComplete
          mockLogger.clearLogs();
          const state: WorkflowState = {
            sessionId: 'test-session',
            workflowName: workflowName,
            workflowVersion: version,
            status: 'completed',
            currentStep: '',
            context: {},
            artifacts: {},
            completedSteps: [stepId],
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            history: [],
            errors: []
          };
          display.onWorkflowComplete(state);
          expect(mockLogger.logs.length).toBeGreaterThan(0);
          expect(mockLogger.getOutput()).toContain('завершен успешно');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.3: syncWithState не требуется для логового режима
   * Requirements 7.3
   *
   * Проверяет, что syncWithState в ProgressDisplay не делает ничего,
   * так как логи не сохраняются и не требуют синхронизации.
   */
  test('Property 11.3: syncWithState is no-op for log mode', () => {
    const mockLogger = new MockLogger();
    const display = new ProgressDisplay(mockLogger);

    const config: WorkflowConfig = {
      name: 'test',
      version: '1.0',
      settings: { artifacts_dir: 'test' },
      steps: [{ id: 's1', name: 'Step 1', type: 'model' }]
    };

    display.onWorkflowStart(config);

    const state: WorkflowState = {
      sessionId: 'test',
      workflowName: 'test',
      workflowVersion: '1.0',
      status: 'running',
      currentStep: 's1',
      context: {},
      artifacts: {},
      completedSteps: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
      errors: []
    };

    mockLogger.clearLogs();

    // syncWithState не должна ничего выводить
    display.syncWithState(state);

    expect(mockLogger.logs.length).toBe(0);
  });

  /**
   * Property 11.4: finalize не требуется для логового режима
   * Requirements 7.3
   *
   * Проверяет, что finalize в ProgressDisplay не делает ничего,
   * так как нет ресурсов для освобождения.
   */
  test('Property 11.4: finalize is no-op for log mode', () => {
    const mockLogger = new MockLogger();
    const display = new ProgressDisplay(mockLogger);

    const config: WorkflowConfig = {
      name: 'test',
      version: '1.0',
      settings: { artifacts_dir: 'test' },
      steps: [{ id: 's1', name: 'Step 1', type: 'model' }]
    };

    display.onWorkflowStart(config);

    mockLogger.clearLogs();

    // finalize не должна ничего выводить
    display.finalize();

    expect(mockLogger.logs.length).toBe(0);
  });
});
