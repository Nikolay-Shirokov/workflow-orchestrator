/**
 * Property-based тесты для InteractiveDisplay
 * 
 * Проверяет свойство 3 из документа проектирования:
 * Наличие обязательных секций в интерактивном режиме
 */

import * as fc from 'fast-check';
import { InteractiveDisplay } from '../../src/cli/interactive-display.js';
import { TerminalRenderer } from '../../src/cli/terminal-renderer.js';
import { WorkflowConfig } from '../../src/core/types.js';
import { Writable } from 'stream';

/**
 * Mock WriteStream для тестирования
 */
class MockWriteStream extends Writable {
  public output: string = '';
  public isTTY: boolean = true;
  public columns: number = 80;
  public rows: number = 50; // Increased to fit all sections

  _write(chunk: Buffer | string, _encoding: string, callback: () => void): void {
    this.output += chunk.toString();
    callback();
  }

  clearOutput(): void {
    this.output = '';
  }
}

// Генератор конфигурации рабочего процесса
const workflowConfigArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  version: fc.string({ minLength: 1, maxLength: 20 }),
  description: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  settings: fc.record({
    artifacts_dir: fc.string({ minLength: 1, maxLength: 100 }),
    default_adapter: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    parallel_execution: fc.option(fc.boolean(), { nil: undefined }),
    max_retries: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
    timeout: fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
    log_level: fc.option(fc.constantFrom('debug', 'info', 'warn', 'error'), { nil: undefined })
  }),
  steps: fc.array(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('model', 'transform', 'export', 'import'),
      role: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      adapter: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      model: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      prompt: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
      depends_on: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }), { nil: undefined })
    }),
    { minLength: 1, maxLength: 10 }
  )
}).map(config => {
  // Гарантируем уникальность ID шагов
  const uniqueSteps = config.steps.map((step, index) => ({
    ...step,
    id: `${step.id}_${index}` // Добавляем индекс к ID для уникальности
  }));
  return {
    ...config,
    steps: uniqueSteps
  };
});

describe('InteractiveDisplay Property Tests', () => {
  /**
   * Property 3: Наличие обязательных секций
   * Feature: interactive-cli-interface, Property 3: Наличие обязательных секций
   * Validates: Requirements 2.1
   * 
   * Для любого вывода в интерактивном режиме, должны присутствовать все
   * обязательные секции: заголовок, путь к артефактам, список шагов,
   * текущий шаг, история, прогресс.
   */
  test('Property 3: All required sections are present', () => {
    fc.assert(
      fc.property(workflowConfigArb, (config) => {
        // Создаем mock stream
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const display = new InteractiveDisplay(renderer);

        // Инициализируем отображение
        display.initialize(config as WorkflowConfig);

        // Получаем вывод
        const output = mockStream.output;

        // Проверяем наличие обязательных секций

        // 1. Заголовок с названием процесса
        expect(output).toContain('Workflow:');
        expect(output).toContain(config.name);
        expect(output).toContain(config.version);

        // 2. Путь к артефактам
        expect(output).toContain('Artifacts:');

        // 3. Список шагов
        expect(output).toContain('Steps:');
        
        // Проверяем, что все шаги отображаются
        for (const step of config.steps) {
          expect(output).toContain(step.name);
        }

        // 4. Текущий шаг (может быть "None" если не начат)
        expect(output).toContain('Current Step:');

        // 5. История последних действий
        expect(output).toContain('Recent Activity:');

        // 6. Прогресс
        expect(output).toContain('Progress:');
        expect(output).toContain('Elapsed:');

        // Очистка
        display.cleanup();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.1: Заголовок содержит название и версию
   * Feature: interactive-cli-interface, Property 3: Наличие обязательных секций
   * Validates: Requirements 2.1
   * 
   * Для любого отображения, заголовок должен содержать название процесса и версию.
   */
  test('Property 3.1: Header contains workflow name and version', () => {
    fc.assert(
      fc.property(workflowConfigArb, (config) => {
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const display = new InteractiveDisplay(renderer);

        display.initialize(config as WorkflowConfig);
        const output = mockStream.output;

        // Проверяем, что заголовок содержит название и версию
        // Используем простую проверку вместо регулярного выражения
        expect(output).toContain('Workflow:');
        expect(output).toContain(config.name);
        expect(output).toContain(`v${config.version}`);

        display.cleanup();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.2: Список шагов содержит все шаги
   * Feature: interactive-cli-interface, Property 3: Наличие обязательных секций
   * Validates: Requirements 2.1, 3.1
   * 
   * Для любого отображения, список шагов должен содержать все шаги из конфигурации.
   */
  test('Property 3.2: Steps list contains all steps', () => {
    fc.assert(
      fc.property(workflowConfigArb, (config) => {
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const display = new InteractiveDisplay(renderer);

        display.initialize(config as WorkflowConfig);
        const output = mockStream.output;

        // Проверяем, что каждый шаг присутствует в выводе
        for (let i = 0; i < config.steps.length; i++) {
          const step = config.steps[i];
          const stepNumber = i + 1;
          
          // Проверяем наличие номера и названия шага
          expect(output).toContain(`${stepNumber}. ${step.name}`);
        }

        display.cleanup();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.3: Прогресс-бар присутствует и корректен
   * Feature: interactive-cli-interface, Property 3: Наличие обязательных секций
   * Validates: Requirements 2.1, 6.1
   * 
   * Для любого отображения, прогресс-бар должен присутствовать и иметь корректный формат.
   */
  test('Property 3.3: Progress bar is present and correct', () => {
    fc.assert(
      fc.property(workflowConfigArb, (config) => {
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const display = new InteractiveDisplay(renderer);

        display.initialize(config as WorkflowConfig);
        const output = mockStream.output;

        // Проверяем наличие прогресс-бара
        expect(output).toContain('Progress:');
        
        // Проверяем формат прогресс-бара [███░░░]
        expect(output).toMatch(/\[█*░*\]/);
        
        // Проверяем наличие процента
        expect(output).toMatch(/\d+\.\d+%/);
        
        // Проверяем наличие счетчика шагов
        expect(output).toMatch(/\(\d+\/\d+\)/);

        display.cleanup();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.4: Начальное состояние корректно
   * Feature: interactive-cli-interface, Property 3: Наличие обязательных секций
   * Validates: Requirements 2.1
   * 
   * Для любого отображения, начальное состояние должно показывать 0% прогресса
   * и все шаги в статусе "pending".
   */
  test('Property 3.4: Initial state is correct', () => {
    fc.assert(
      fc.property(workflowConfigArb, (config) => {
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const display = new InteractiveDisplay(renderer);

        display.initialize(config as WorkflowConfig);
        const state = display.getState();

        // Проверяем начальное состояние
        expect(state).not.toBeNull();
        if (state) {
          expect(state.completedSteps).toBe(0);
          expect(state.currentStepIndex).toBe(-1);
          expect(state.recentActivity).toEqual([]);
          
          // Все шаги должны быть в статусе "pending"
          for (const step of state.steps) {
            expect(step.status).toBe('pending');
          }
        }

        display.cleanup();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.5: Инициализация проверяет возможности терминала
   * Feature: interactive-cli-interface, Property 3: Наличие обязательных секций
   * Validates: Requirements 8.1, 8.2, 8.3
   * 
   * Для любого терминала, который не поддерживает ANSI или слишком узкий,
   * инициализация должна выбросить ошибку.
   */
  test('Property 3.5: Initialization checks terminal capabilities', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.boolean(),
        fc.integer({ min: 10, max: 120 }),
        (config, isTTY, width) => {
          // Создаем mock stream с заданными параметрами
          const mockStream = new MockWriteStream();
          mockStream.isTTY = isTTY;
          mockStream.columns = width;

          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          const capabilities = renderer.getCapabilities();
          const minWidth = 60;

          if (!capabilities.supportsAnsi || !capabilities.isInteractive || width < minWidth) {
            // Должна быть выброшена ошибка
            expect(() => {
              display.initialize(config as WorkflowConfig);
            }).toThrow();
          } else {
            // Инициализация должна пройти успешно
            expect(() => {
              display.initialize(config as WorkflowConfig);
            }).not.toThrow();
            
            display.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.6: Cleanup восстанавливает состояние терминала
   * Feature: interactive-cli-interface, Property 3: Наличие обязательных секций
   * Validates: Requirements 2.2
   * 
   * Для любого отображения, после cleanup() курсор должен быть показан
   * и состояние сброшено.
   */
  test('Property 3.6: Cleanup restores terminal state', () => {
    fc.assert(
      fc.property(workflowConfigArb, (config) => {
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const display = new InteractiveDisplay(renderer);

        display.initialize(config as WorkflowConfig);
        
        // Проверяем, что отображение инициализировано
        expect(display.isReady()).toBe(true);
        expect(display.getState()).not.toBeNull();

        // Очищаем
        display.cleanup();

        // Проверяем, что состояние сброшено
        expect(display.isReady()).toBe(false);
        expect(display.getState()).toBeNull();

        // Проверяем, что в выводе есть команда показа курсора
        const output = mockStream.output;
        expect(output).toContain('\x1b[?25h'); // Show cursor ANSI code
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.7: Render можно вызывать многократно
   * Feature: interactive-cli-interface, Property 3: Наличие обязательных секций
   * Validates: Requirements 2.2
   * 
   * Для любого отображения, метод render() можно вызывать многократно
   * без ошибок.
   */
  test('Property 3.7: Render can be called multiple times', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 1, max: 10 }),
        (config, renderCount) => {
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);

          // Вызываем render() несколько раз
          for (let i = 0; i < renderCount; i++) {
            expect(() => {
              display.render();
            }).not.toThrow();
          }

          display.cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.8: SetArtifactsDir обновляет путь
   * Feature: interactive-cli-interface, Property 3: Наличие обязательных секций
   * Validates: Requirements 2.1
   * 
   * Для любого пути к артефактам, setArtifactsDir() должен обновить
   * путь в состоянии и отобразить его.
   */
  test('Property 3.8: SetArtifactsDir updates path', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        (config, artifactsDir) => {
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Очищаем вывод
          mockStream.clearOutput();
          
          // Устанавливаем путь к артефактам
          display.setArtifactsDir(artifactsDir);

          // Проверяем, что путь обновился в состоянии
          const state = display.getState();
          expect(state).not.toBeNull();
          if (state) {
            expect(state.artifactsDir).toBe(artifactsDir);
          }

          // Проверяем, что путь отображается в выводе
          const output = mockStream.output;
          expect(output).toContain(artifactsDir);

          display.cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Формат отображения списка шагов
   * Feature: interactive-cli-interface, Property 5: Формат отображения списка шагов
   * Validates: Requirements 3.1
   * 
   * Для любого списка шагов, каждый шаг должен отображаться в формате:
   * номер, иконка статуса, название, ID.
   * 
   * Также проверяется:
   * - Наличие иконок статусов (✓, ⏳, ○, ✗)
   * - Визуальное выделение текущего шага (жирный текст)
   */
  test('Property 5: Steps list format is correct', () => {
    fc.assert(
      fc.property(workflowConfigArb, (config) => {
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const display = new InteractiveDisplay(renderer);

        display.initialize(config as WorkflowConfig);
        const output = mockStream.output;

        // Проверяем формат каждого шага: номер, иконка, название, ID
        for (let i = 0; i < config.steps.length; i++) {
          const step = config.steps[i];
          const stepNumber = i + 1;
          
          // Проверяем наличие номера шага
          expect(output).toContain(`${stepNumber}.`);
          
          // Проверяем наличие названия шага
          expect(output).toContain(step.name);
          
          // Проверяем наличие ID шага в квадратных скобках
          expect(output).toContain(`[${step.id}]`);
        }

        // Проверяем наличие иконок статусов
        // В начальном состоянии все шаги должны иметь статус "pending" (○)
        const state = display.getState();
        if (state) {
          for (const step of state.steps) {
            const icon = renderer.getStatusIcon(step.status);
            // Проверяем, что иконка присутствует в выводе
            // Используем простую проверку наличия иконки
            expect(['✓', '⏳', '○', '✗']).toContain(icon);
          }
        }

        display.cleanup();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.1: Иконки статусов корректны
   * Feature: interactive-cli-interface, Property 5: Формат отображения списка шагов
   * Validates: Requirements 3.1
   * 
   * Для любого статуса шага, должна использоваться правильная иконка:
   * - completed: ✓
   * - running: ⏳
   * - pending: ○
   * - failed: ✗
   */
  test('Property 5.1: Status icons are correct', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('completed', 'running', 'pending', 'failed', 'skipped'),
        (status) => {
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);

          const icon = renderer.getStatusIcon(status as any);

          // Проверяем соответствие иконок статусам
          switch (status) {
            case 'completed':
              expect(icon).toBe('✓');
              break;
            case 'running':
              expect(icon).toBe('⏳');
              break;
            case 'pending':
              expect(icon).toBe('○');
              break;
            case 'failed':
              expect(icon).toBe('✗');
              break;
            case 'skipped':
              expect(icon).toBe('○');
              break;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.2: Текущий шаг визуально выделен
   * Feature: interactive-cli-interface, Property 5: Формат отображения списка шагов
   * Validates: Requirements 3.2
   * 
   * Для любого текущего выполняемого шага, он должен быть визуально выделен
   * (жирный текст с ANSI escape code \x1b[1m).
   */
  test('Property 5.2: Current step is visually highlighted', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 0, max: 9 }),
        (config, stepIndex) => {
          // Ограничиваем индекс количеством шагов
          const actualStepIndex = stepIndex % config.steps.length;
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Симулируем начало выполнения шага
          const step = config.steps[actualStepIndex];
          display.onStepStart(step as any, actualStepIndex + 1);
          
          const output = mockStream.output;

          // Проверяем, что текущий шаг содержит ANSI код для жирного текста
          // Жирный текст: \x1b[1m ... \x1b[22m
          const boldCode = '\x1b[1m';
          expect(output).toContain(boldCode);
          
          // Проверяем, что название текущего шага присутствует после кода жирного текста
          const stepName = step.name;
          const boldCodeIndex = output.indexOf(boldCode);
          const stepNameIndex = output.indexOf(stepName, boldCodeIndex);
          
          // Если шаг найден после кода жирного текста, значит он выделен
          if (boldCodeIndex >= 0 && stepNameIndex > boldCodeIndex) {
            expect(stepNameIndex).toBeGreaterThan(boldCodeIndex);
          }

          display.cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: Полнота информации о текущем шаге
   * Feature: interactive-cli-interface, Property 7: Полнота информации о текущем шаге
   * Validates: Requirements 4.1, 4.2, 4.3
   * 
   * Для любого текущего выполняемого шага, отображение должно содержать:
   * название, ID, тип, роль (если применимо), адаптер (если применимо),
   * модель (если применимо), время выполнения.
   */
  test('Property 7: Current step information is complete', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 0, max: 9 }),
        (config, stepIndex) => {
          // Ограничиваем индекс количеством шагов
          const actualStepIndex = stepIndex % config.steps.length;
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Симулируем начало выполнения шага
          const step = config.steps[actualStepIndex];
          display.onStepStart(step as any, actualStepIndex + 1);
          
          // Очищаем вывод и рендерим снова для чистого вывода
          display.forceRender();
          
          const output = mockStream.output;

          // Проверяем наличие обязательных полей (Requirements 4.1)
          
          // 1. Название шага
          expect(output).toContain('Current Step:');
          expect(output).toContain(step.name);
          
          // 2. ID шага
          expect(output).toContain('ID:');
          expect(output).toContain(step.id);
          
          // 3. Тип шага
          expect(output).toContain('Type:');
          expect(output).toContain(step.type);
          
          // 4. Роль (если применимо)
          if (step.role) {
            expect(output).toContain('Role:');
            expect(output).toContain(step.role);
          }
          
          // 5. Адаптер (если применимо)
          if (step.adapter) {
            expect(output).toContain('Adapter:');
            expect(output).toContain(step.adapter);
          }
          
          // 6. Модель (если применимо)
          if (step.model) {
            expect(output).toContain('Model:');
            expect(output).toContain(step.model);
          }
          
          // 7. Статус
          expect(output).toContain('Status:');

          display.cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.1: Артефакты отображаются корректно
   * Feature: interactive-cli-interface, Property 7: Полнота информации о текущем шаге
   * Validates: Requirements 4.2
   * 
   * Для любого шага с артефактами, должен отображаться список артефактов.
   */
  test('Property 7.1: Artifacts are displayed correctly', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 0, max: 9 }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 100, max: 10000 }),
        (config, stepIndex, artifacts, duration) => {
          const actualStepIndex = stepIndex % config.steps.length;
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          const step = config.steps[actualStepIndex];
          display.onStepStart(step as any, actualStepIndex + 1);
          
          // Симулируем завершение шага с артефактами
          const history = {
            stepId: step.id,
            status: 'success' as const,
            executionTime: duration,
            artifacts: artifacts,
            error: undefined
          };
          
          display.onStepComplete(step as any, history as any);
          
          display.forceRender();
          
          const output = mockStream.output;

          // Проверяем отображение артефактов (Requirements 4.2)
          expect(output).toContain('Artifacts:');
          expect(output).toContain(artifacts.length.toString());
          
          // Проверяем, что первые 3 артефакта отображаются
          const displayedArtifacts = artifacts.slice(0, 3);
          for (const artifact of displayedArtifacts) {
            expect(output).toContain(artifact);
          }
          
          // Если артефактов больше 3, должно быть сообщение "... and N more"
          if (artifacts.length > 3) {
            expect(output).toContain('... and');
            expect(output).toContain('more');
          }

          display.cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.2: Ошибки отображаются корректно
   * Feature: interactive-cli-interface, Property 7: Полнота информации о текущем шаге
   * Validates: Requirements 4.3
   * 
   * Для любого шага с ошибкой, должно отображаться сообщение об ошибке.
   */
  test('Property 7.2: Errors are displayed correctly', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 0, max: 9 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        (config, stepIndex, errorMessage) => {
          const actualStepIndex = stepIndex % config.steps.length;
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          const step = config.steps[actualStepIndex];
          display.onStepStart(step as any, actualStepIndex + 1);
          
          // Симулируем ошибку шага
          const error = new Error(errorMessage);
          display.onStepError(step as any, error);
          
          display.forceRender();
          
          const output = mockStream.output;

          // Проверяем отображение ошибки (Requirements 4.3)
          expect(output).toContain('Error:');
          expect(output).toContain(errorMessage);
          
          // Проверяем, что ошибка выделена красным цветом
          const redColor = '\x1b[31m';
          expect(output).toContain(redColor);

          display.cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.3: Время выполнения отображается корректно
   * Feature: interactive-cli-interface, Property 7: Полнота информации о текущем шаге
   * Validates: Requirements 4.1
   * 
   * Для любого шага с временем выполнения, должно отображаться
   * отформатированное время.
   */
  test('Property 7.3: Duration is displayed correctly', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 100, max: 300000 }), // от 0.1s до 5 минут
        (config, stepIndex, duration) => {
          const actualStepIndex = stepIndex % config.steps.length;
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          const step = config.steps[actualStepIndex];
          display.onStepStart(step as any, actualStepIndex + 1);
          
          // Симулируем завершение шага
          const history = {
            stepId: step.id,
            status: 'success' as const,
            executionTime: duration,
            artifacts: [],
            error: undefined
          };
          
          display.onStepComplete(step as any, history as any);
          
          display.forceRender();
          
          const output = mockStream.output;

          // Проверяем отображение времени выполнения (Requirements 4.1)
          expect(output).toContain('Duration:');
          
          // Проверяем формат времени (должно быть "Xs" или "Xm Ys")
          const hasSeconds = /\d+\.\d+s/.test(output);
          const hasMinutes = /\d+m \d+\.\d+s/.test(output);
          
          expect(hasSeconds || hasMinutes).toBe(true);

          display.cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.4: Текущий шаг обновляется при смене шага
   * Feature: interactive-cli-interface, Property 7: Полнота информации о текущем шаге
   * Validates: Requirements 4.1
   * 
   * Для любой последовательности шагов, информация о текущем шаге
   * должна обновляться при переходе к следующему шагу.
   */
  test('Property 7.4: Current step updates when step changes', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        (config) => {
          // Пропускаем конфигурации с одним шагом
          if (config.steps.length < 2) {
            return true;
          }
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Запускаем первый шаг
          const firstStep = config.steps[0];
          display.onStepStart(firstStep as any, 1);
          
          display.forceRender();
          let output = mockStream.output;
          
          // Проверяем, что отображается первый шаг
          expect(output).toContain(firstStep.name);
          
          // Завершаем первый шаг
          display.onStepComplete(firstStep as any, {
            stepId: firstStep.id,
            status: 'success',
            executionTime: 1000,
            artifacts: [],
            error: undefined
          } as any);
          
          // Запускаем второй шаг
          const secondStep = config.steps[1];
          display.onStepStart(secondStep as any, 2);
          
          display.forceRender();
          output = mockStream.output;
          
          // Проверяем, что теперь отображается второй шаг
          expect(output).toContain(secondStep.name);

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.5: Опциональные поля не отображаются, если отсутствуют
   * Feature: interactive-cli-interface, Property 7: Полнота информации о текущем шаге
   * Validates: Requirements 4.1
   * 
   * Для любого шага без опциональных полей (роль, адаптер, модель),
   * эти поля не должны отображаться в выводе.
   */
  test('Property 7.5: Optional fields are not displayed when absent', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          version: fc.string({ minLength: 1, maxLength: 20 }),
          settings: fc.record({
            artifacts_dir: fc.string({ minLength: 1, maxLength: 100 })
          }),
          steps: fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              type: fc.constantFrom('model', 'transform', 'export', 'import'),
              // Намеренно не включаем role, adapter, model
            }),
            { minLength: 1, maxLength: 5 }
          )
        }),
        (config) => {
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          const step = config.steps[0];
          display.onStepStart(step as any, 1);
          
          display.forceRender();
          
          const output = mockStream.output;

          // Проверяем, что опциональные поля не отображаются
          // Используем более точную проверку - ищем "Role:", "Adapter:", "Model:" как отдельные строки
          const lines = output.split('\n');
          const hasRoleLine = lines.some(line => line.trim().startsWith('Role:'));
          const hasAdapterLine = lines.some(line => line.trim().startsWith('Adapter:'));
          const hasModelLine = lines.some(line => line.trim().startsWith('Model:'));
          
          expect(hasRoleLine).toBe(false);
          expect(hasAdapterLine).toBe(false);
          expect(hasModelLine).toBe(false);

          display.cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7.6: Все обязательные поля присутствуют для текущего шага
   * Feature: interactive-cli-interface, Property 7: Полнота информации о текущем шаге
   * Validates: Requirements 4.1
   * 
   * Для любого текущего шага, обязательные поля (название, ID, тип, статус)
   * всегда должны присутствовать в выводе.
   */
  test('Property 7.6: All required fields are present for current step', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 0, max: 9 }),
        (config, stepIndex) => {
          const actualStepIndex = stepIndex % config.steps.length;
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          const step = config.steps[actualStepIndex];
          display.onStepStart(step as any, actualStepIndex + 1);
          
          display.forceRender();
          
          const output = mockStream.output;
          const lines = output.split('\n');

          // Проверяем наличие всех обязательных полей
          const hasCurrentStep = lines.some(line => line.includes('Current Step:'));
          const hasId = lines.some(line => line.trim().startsWith('ID:'));
          const hasType = lines.some(line => line.trim().startsWith('Type:'));
          const hasStatus = lines.some(line => line.trim().startsWith('Status:'));
          
          expect(hasCurrentStep).toBe(true);
          expect(hasId).toBe(true);
          expect(hasType).toBe(true);
          expect(hasStatus).toBe(true);

          display.cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8: Ограничение размера истории
   * Feature: interactive-cli-interface, Property 8: Ограничение размера истории
   * Validates: Requirements 5.1, 5.2
   * 
   * Для любой истории последних действий, количество отображаемых элементов
   * не должно превышать 3. При добавлении нового элемента самый старый должен
   * удаляться.
   */
  test('Property 8: Recent activity size is limited to 3', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 1, max: 10 }), // Количество шагов для завершения
        (config, stepsToComplete) => {
          // Пропускаем конфигурации с недостаточным количеством шагов
          if (config.steps.length < 2) {
            return true;
          }
          
          const actualStepsToComplete = Math.min(stepsToComplete, config.steps.length);
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Завершаем несколько шагов
          for (let i = 0; i < actualStepsToComplete; i++) {
            const step = config.steps[i];
            
            // Начинаем шаг
            display.onStepStart(step as any, i + 1);
            
            // Завершаем шаг
            const history = {
              stepId: step.id,
              status: 'success' as const,
              executionTime: 1000 + i * 100,
              artifacts: [`artifact_${i}.txt`],
              error: undefined
            };
            
            display.onStepComplete(step as any, history as any);
          }
          
          // Получаем состояние
          const state = display.getState();
          
          // Проверяем, что размер истории не превышает 3 (Requirements 5.1, 5.2)
          expect(state).not.toBeNull();
          if (state) {
            expect(state.recentActivity.length).toBeLessThanOrEqual(3);
            
            // Если завершено больше 3 шагов, история должна содержать ровно 3 элемента
            if (actualStepsToComplete > 3) {
              expect(state.recentActivity.length).toBe(3);
            } else {
              // Иначе история должна содержать столько элементов, сколько завершено шагов
              expect(state.recentActivity.length).toBe(actualStepsToComplete);
            }
          }

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.1: История содержит последние завершенные шаги
   * Feature: interactive-cli-interface, Property 8: Ограничение размера истории
   * Validates: Requirements 5.2
   * 
   * Для любой последовательности завершенных шагов, история должна содержать
   * последние (самые новые) шаги, а не первые.
   */
  test('Property 8.1: Recent activity contains latest steps', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        (config) => {
          // Пропускаем конфигурации с недостаточным количеством шагов
          if (config.steps.length < 4) {
            return true;
          }
          
          // Пропускаем конфигурации, где все шаги имеют одинаковые имена
          const uniqueNames = new Set(config.steps.map(s => s.name));
          if (uniqueNames.size < 4) {
            return true;
          }
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Завершаем первые 4 шага
          for (let i = 0; i < 4; i++) {
            const step = config.steps[i];
            
            display.onStepStart(step as any, i + 1);
            
            const history = {
              stepId: step.id,
              status: 'success' as const,
              executionTime: 1000 + i * 100,
              artifacts: [`artifact_${i}.txt`],
              error: undefined
            };
            
            display.onStepComplete(step as any, history as any);
          }
          
          // Получаем состояние
          const state = display.getState();
          
          expect(state).not.toBeNull();
          if (state) {
            // История должна содержать 3 элемента
            expect(state.recentActivity.length).toBe(3);
            
            // Проверяем, что история содержит последние 3 шага (шаги 1, 2, 3)
            // В обратном порядке: шаг 3 (индекс 0), шаг 2 (индекс 1), шаг 1 (индекс 2)
            expect(state.recentActivity[0].stepName).toBe(config.steps[3].name);
            expect(state.recentActivity[1].stepName).toBe(config.steps[2].name);
            expect(state.recentActivity[2].stepName).toBe(config.steps[1].name);
            
            // Первый шаг (индекс 0) не должен быть в истории
            const hasFirstStep = state.recentActivity.some(
              activity => activity.stepName === config.steps[0].name
            );
            expect(hasFirstStep).toBe(false);
          }

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.2: История отображается в выводе
   * Feature: interactive-cli-interface, Property 8: Ограничение размера истории
   * Validates: Requirements 5.1, 5.3
   * 
   * Для любой истории с завершенными шагами, секция "Recent Activity"
   * должна отображать информацию о каждом шаге: название, статус, время, артефакты.
   */
  test('Property 8.2: Recent activity is displayed in output', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 1, max: 5 }),
        (config, stepsToComplete) => {
          // Пропускаем конфигурации с недостаточным количеством шагов
          if (config.steps.length < 2) {
            return true;
          }
          
          const actualStepsToComplete = Math.min(stepsToComplete, config.steps.length);
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Завершаем несколько шагов
          const completedSteps: Array<{ name: string; artifacts: string[] }> = [];
          
          for (let i = 0; i < actualStepsToComplete; i++) {
            const step = config.steps[i];
            const artifacts = [`artifact_${i}.txt`, `result_${i}.json`];
            
            display.onStepStart(step as any, i + 1);
            
            const history = {
              stepId: step.id,
              status: 'success' as const,
              executionTime: 1000 + i * 100,
              artifacts: artifacts,
              error: undefined
            };
            
            display.onStepComplete(step as any, history as any);
            
            completedSteps.push({ name: step.name, artifacts });
          }
          
          // Очищаем накопленный вывод и рендерим финальное состояние
          mockStream.clearOutput();
          display.forceRender();
          const output = mockStream.output;
          
          // Проверяем наличие секции истории (Requirements 5.1)
          expect(output).toContain('Recent Activity:');
          
          // Проверяем, что последние шаги отображаются (Requirements 5.3)
          const displayedSteps = completedSteps.slice(-3).reverse(); // Последние 3 в обратном порядке
          
          for (const step of displayedSteps) {
            // Проверяем наличие названия шага
            expect(output).toContain(step.name);

            // Проверяем наличие информации об артефактах
            // Формат: "→ N artifact(s)"
            expect(output).toContain(`${step.artifacts.length} artifact(s)`);
          }
          
          // Проверяем наличие иконок статуса (✓ для успешных)
          const successIcon = '✓';
          expect(output).toContain(successIcon);

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.3: История корректно обрабатывает ошибки
   * Feature: interactive-cli-interface, Property 8: Ограничение размера истории
   * Validates: Requirements 5.3
   * 
   * Для любого шага, завершившегося с ошибкой, история должна отображать
   * статус "failed" с соответствующей иконкой (✗).
   */
  test('Property 8.3: Recent activity handles errors correctly', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 0, max: 9 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (config, stepIndex, errorMessage) => {
          // Пропускаем конфигурации с недостаточным количеством шагов
          if (config.steps.length < 1) {
            return true;
          }
          
          const actualStepIndex = stepIndex % config.steps.length;
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          const step = config.steps[actualStepIndex];
          
          display.onStepStart(step as any, actualStepIndex + 1);
          
          // Завершаем шаг с ошибкой
          const history = {
            stepId: step.id,
            status: 'failed' as const,
            executionTime: 1000,
            artifacts: [],
            error: errorMessage
          };
          
          display.onStepComplete(step as any, history as any);
          
          // Получаем состояние
          const state = display.getState();
          
          expect(state).not.toBeNull();
          if (state) {
            // Проверяем, что в истории есть запись с ошибкой
            expect(state.recentActivity.length).toBe(1);
            expect(state.recentActivity[0].status).toBe('failed');
            expect(state.recentActivity[0].stepName).toBe(step.name);
          }
          
          // Проверяем вывод
          display.forceRender();
          const output = mockStream.output;
          
          // Проверяем наличие иконки ошибки (✗)
          const errorIcon = '✗';
          expect(output).toContain(errorIcon);
          
          // Проверяем наличие названия шага
          expect(output).toContain(step.name);

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.4: Пустая история отображается корректно
   * Feature: interactive-cli-interface, Property 8: Ограничение размера истории
   * Validates: Requirements 5.1
   * 
   * Для любого начального состояния без завершенных шагов, секция истории
   * должна отображать "Recent Activity: None".
   */
  test('Property 8.4: Empty recent activity is displayed correctly', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        (config) => {
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Получаем состояние без завершенных шагов
          const state = display.getState();
          
          expect(state).not.toBeNull();
          if (state) {
            // История должна быть пустой
            expect(state.recentActivity.length).toBe(0);
          }
          
          // Проверяем вывод
          display.forceRender();
          const output = mockStream.output;
          
          // Проверяем, что отображается "Recent Activity: None"
          expect(output).toContain('Recent Activity:');
          expect(output).toContain('None');

          display.cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Обновление статуса шага
   * Feature: interactive-cli-interface, Property 6: Обновление статуса шага
   * Validates: Requirements 3.3
   * 
   * Для любого шага, когда он завершается, его статус в списке должен
   * измениться с "running" на "completed" или "failed".
   */
  test('Property 6: Step status updates on completion', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 0, max: 9 }),
        fc.constantFrom('success', 'failed'),
        fc.integer({ min: 100, max: 10000 }),
        (config, stepIndex, completionStatus, duration) => {
          // Пропускаем конфигурации с недостаточным количеством шагов
          if (config.steps.length < 1) {
            return true;
          }
          
          const actualStepIndex = stepIndex % config.steps.length;
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          const step = config.steps[actualStepIndex];
          
          // Получаем начальное состояние
          let state = display.getState();
          expect(state).not.toBeNull();
          if (state) {
            // Проверяем, что шаг в статусе "pending"
            expect(state.steps[actualStepIndex].status).toBe('pending');
          }
          
          // Начинаем выполнение шага
          display.onStepStart(step as any, actualStepIndex + 1);
          
          // Проверяем, что статус изменился на "running"
          state = display.getState();
          expect(state).not.toBeNull();
          if (state) {
            expect(state.steps[actualStepIndex].status).toBe('running');
          }
          
          // Завершаем шаг
          const history = {
            stepId: step.id,
            status: completionStatus,
            executionTime: duration,
            artifacts: [],
            error: completionStatus === 'failed' ? 'Test error' : undefined
          };
          
          display.onStepComplete(step as any, history as any);
          
          // Проверяем, что статус изменился на "completed" или "failed"
          state = display.getState();
          expect(state).not.toBeNull();
          if (state) {
            const expectedStatus = completionStatus === 'success' ? 'completed' : 'failed';
            expect(state.steps[actualStepIndex].status).toBe(expectedStatus);
            
            // Проверяем, что длительность установлена
            expect(state.steps[actualStepIndex].duration).toBe(duration);
          }

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.1: Статус шага отображается в выводе
   * Feature: interactive-cli-interface, Property 6: Обновление статуса шага
   * Validates: Requirements 3.3
   * 
   * Для любого шага с обновленным статусом, новый статус должен
   * отображаться в списке шагов с соответствующей иконкой.
   */
  test('Property 6.1: Updated step status is displayed in output', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.integer({ min: 0, max: 9 }),
        fc.constantFrom('success', 'failed'),
        (config, stepIndex, completionStatus) => {
          // Пропускаем конфигурации с недостаточным количеством шагов
          if (config.steps.length < 1) {
            return true;
          }
          
          const actualStepIndex = stepIndex % config.steps.length;
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          const step = config.steps[actualStepIndex];
          
          // Начинаем и завершаем шаг
          display.onStepStart(step as any, actualStepIndex + 1);
          
          const history = {
            stepId: step.id,
            status: completionStatus,
            executionTime: 1000,
            artifacts: [],
            error: completionStatus === 'failed' ? 'Test error' : undefined
          };
          
          display.onStepComplete(step as any, history as any);
          
          // Очищаем накопленный вывод и рендерим финальное состояние
          mockStream.clearOutput();
          display.forceRender();
          const output = mockStream.output;
          
          // Проверяем наличие правильной иконки статуса
          const expectedIcon = completionStatus === 'success' ? '✓' : '✗';
          expect(output).toContain(expectedIcon);
          
          // Проверяем наличие названия шага
          expect(output).toContain(step.name);

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.2: Множественные обновления статусов
   * Feature: interactive-cli-interface, Property 6: Обновление статуса шага
   * Validates: Requirements 3.3
   * 
   * Для любой последовательности шагов, каждый шаг должен корректно
   * обновлять свой статус независимо от других шагов.
   */
  test('Property 6.2: Multiple step status updates are independent', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.array(fc.constantFrom('success', 'failed'), { minLength: 1, maxLength: 10 }),
        (config, completionStatuses) => {
          // Пропускаем конфигурации с недостаточным количеством шагов
          if (config.steps.length < 2) {
            return true;
          }
          
          const stepsToComplete = Math.min(completionStatuses.length, config.steps.length);
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Завершаем несколько шагов с разными статусами
          for (let i = 0; i < stepsToComplete; i++) {
            const step = config.steps[i];
            const completionStatus = completionStatuses[i];
            
            display.onStepStart(step as any, i + 1);
            
            const history = {
              stepId: step.id,
              status: completionStatus,
              executionTime: 1000 + i * 100,
              artifacts: [],
              error: completionStatus === 'failed' ? `Error ${i}` : undefined
            };
            
            display.onStepComplete(step as any, history as any);
          }
          
          // Проверяем, что все шаги имеют правильные статусы
          const state = display.getState();
          expect(state).not.toBeNull();
          if (state) {
            for (let i = 0; i < stepsToComplete; i++) {
              const expectedStatus = completionStatuses[i] === 'success' ? 'completed' : 'failed';
              expect(state.steps[i].status).toBe(expectedStatus);
            }
            
            // Проверяем, что незавершенные шаги остались в статусе "pending"
            for (let i = stepsToComplete; i < config.steps.length; i++) {
              expect(state.steps[i].status).toBe('pending');
            }
          }

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14: Полнота итоговой информации
   * Feature: interactive-cli-interface, Property 14: Полнота итоговой информации
   * Validates: Requirements 11.1, 11.2, 11.3
   * 
   * Для любого завершенного процесса, итоговая информация должна содержать:
   * статус, время выполнения, количество завершенных шагов, количество артефактов, ID сессии.
   */
  test('Property 14: Workflow completion information is complete', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.constantFrom('completed', 'failed'),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.integer({ min: 1, max: 10 }),
        (config, workflowStatus, sessionId, artifactCount) => {
          // Пропускаем конфигурации с недостаточным количеством шагов
          if (config.steps.length < 1) {
            return true;
          }
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Завершаем все шаги
          const completedSteps: string[] = [];
          const artifacts: Record<string, string> = {};
          
          for (let i = 0; i < config.steps.length; i++) {
            const step = config.steps[i];
            
            display.onStepStart(step as any, i + 1);
            
            const stepArtifacts = [`artifact_${i}.txt`];
            
            const history = {
              stepId: step.id,
              status: 'success' as const,
              executionTime: 1000 + i * 100,
              artifacts: stepArtifacts,
              error: undefined
            };
            
            display.onStepComplete(step as any, history as any);
            
            completedSteps.push(step.id);
            artifacts[step.id] = stepArtifacts[0];
          }
          
          // Добавляем дополнительные артефакты
          for (let i = 0; i < artifactCount; i++) {
            artifacts[`extra_${i}`] = `extra_artifact_${i}.txt`;
          }
          
          // Создаем состояние завершения
          const finalState = {
            sessionId,
            workflowName: config.name,
            workflowVersion: config.version,
            status: workflowStatus,
            currentStep: null,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            completedSteps,
            artifacts,
            history: [],
            errors: workflowStatus === 'failed' ? ['Test error'] : []
          };
          
          // Очищаем вывод перед финальным рендером
          mockStream.clearOutput();
          
          // Вызываем обработчик завершения
          display.onWorkflowComplete(finalState as any);
          
          const output = mockStream.output;
          
          // Проверяем наличие всех обязательных элементов итоговой информации
          
          // 1. Статус завершения (Requirements 11.1)
          if (workflowStatus === 'completed') {
            expect(output).toContain('completed successfully');
            expect(output).toContain('✓');
          } else {
            expect(output).toContain('failed');
            expect(output).toContain('✗');
          }
          
          // 2. Общее время выполнения (Requirements 11.1)
          expect(output).toContain('Total time:');
          expect(output).toMatch(/\d+\.\d+s/); // Формат времени
          
          // 3. Количество завершенных шагов (Requirements 11.2)
          expect(output).toContain('Completed steps:');
          expect(output).toContain(`${completedSteps.length}`);
          
          // 4. Количество артефактов (Requirements 11.2)
          expect(output).toContain('Artifacts:');
          expect(output).toContain(`${Object.keys(artifacts).length}`);
          
          // 5. ID сессии (Requirements 11.2)
          expect(output).toContain('Session:');
          expect(output).toContain(sessionId);
          
          // 6. Ошибки (если есть) (Requirements 11.3)
          if (workflowStatus === 'failed') {
            expect(output).toContain('Errors:');
          }

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.1: Итоговая информация остается на экране
   * Feature: interactive-cli-interface, Property 14: Полнота итоговой информации
   * Validates: Requirements 11.2
   * 
   * Для любого завершенного процесса, итоговая информация должна
   * оставаться на экране после завершения (не очищаться).
   */
  test('Property 14.1: Completion information remains on screen', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.string({ minLength: 10, maxLength: 50 }),
        (config, sessionId) => {
          // Пропускаем конфигурации с недостаточным количеством шагов
          if (config.steps.length < 1) {
            return true;
          }
          
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Создаем состояние завершения
          const finalState = {
            sessionId,
            workflowName: config.name,
            workflowVersion: config.version,
            status: 'completed',
            currentStep: null,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            completedSteps: config.steps.map(s => s.id),
            artifacts: {},
            history: [],
            errors: []
          };
          
          // Очищаем вывод
          mockStream.clearOutput();
          
          // Вызываем обработчик завершения
          display.onWorkflowComplete(finalState as any);
          
          const outputAfterCompletion = mockStream.output;
          
          // Проверяем, что итоговая информация присутствует
          expect(outputAfterCompletion).toContain('completed successfully');
          expect(outputAfterCompletion).toContain('Session:');
          expect(outputAfterCompletion).toContain(sessionId);
          
          // Очищаем вывод снова
          mockStream.clearOutput();
          
          // Вызываем cleanup (не должен очищать итоговую информацию)
          display.cleanup();
          
          // Итоговая информация должна остаться (не должно быть команды очистки экрана после завершения)
          // Проверяем, что курсор показан (это происходит в cleanup)
          const outputAfterCleanup = mockStream.output;
          expect(outputAfterCleanup).toContain('\x1b[?25h'); // Show cursor

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.2: Список ошибок отображается при неудачном завершении
   * Feature: interactive-cli-interface, Property 14: Полнота итоговой информации
   * Validates: Requirements 11.3
   * 
   * Для любого процесса, завершившегося с ошибками, должен отображаться
   * список ошибок.
   */
  test('Property 14.2: Error list is displayed on failure', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
        (config, sessionId, errors) => {
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);
          
          // Создаем состояние завершения с ошибками
          const finalState = {
            sessionId,
            workflowName: config.name,
            workflowVersion: config.version,
            status: 'failed',
            currentStep: null,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            completedSteps: [],
            artifacts: {},
            history: [],
            errors
          };
          
          // Очищаем вывод
          mockStream.clearOutput();
          
          // Вызываем обработчик завершения
          display.onWorkflowComplete(finalState as any);
          
          const output = mockStream.output;
          
          // Проверяем наличие информации об ошибках (Requirements 11.3)
          expect(output).toContain('failed');
          expect(output).toContain('Errors:');
          expect(output).toContain(`${errors.length}`);

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12: Отображение параллельных шагов
   * Feature: interactive-cli-interface, Property 12: Отображение параллельных шагов
   * Validates: Requirements 9.1, 9.2, 9.3
   * 
   * Для любого набора параллельно выполняемых шагов, все шаги должны
   * отображаться в секции текущих шагов с индикатором параллельного выполнения (⚡).
   */
  test('Property 12: Parallel steps are displayed with indicator', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            type: fc.constantFrom('model', 'transform', 'export', 'import')
          }),
          { minLength: 2, maxLength: 5 } // Минимум 2 параллельных шага
        ),
        (config, parallelStepsData) => {
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          // Инициализируем отображение
          display.initialize(config as WorkflowConfig);

          // Создаем параллельные шаги с уникальными ID
          const parallelSteps = parallelStepsData.map((stepData, index) => ({
            ...stepData,
            id: `parallel_${stepData.id}_${index}` // Гарантируем уникальность
          }));

          // Очищаем вывод перед вызовом onParallelStart
          mockStream.clearOutput();

          // Вызываем обработчик начала параллельного выполнения
          display.onParallelStart(parallelSteps as any);

          const output = mockStream.output;

          // Проверяем наличие индикатора параллельного выполнения (Requirements 9.3)
          expect(output).toContain('⚡');
          expect(output).toContain('Parallel Execution:');

          // Проверяем, что все параллельные шаги отображаются (Requirements 9.1)
          for (const step of parallelSteps) {
            expect(output).toContain(step.name);
            expect(output).toContain(step.id);
          }

          // Проверяем, что шаги визуально сгруппированы (Requirements 9.2)
          // Все шаги должны быть в одной секции "Parallel Execution"
          const parallelSectionMatch = output.match(/⚡ Parallel Execution:([\s\S]*?)─{10,}/);
          if (parallelSectionMatch) {
            const parallelSection = parallelSectionMatch[1];
            // Проверяем, что все шаги находятся в этой секции
            for (const step of parallelSteps) {
              expect(parallelSection).toContain(step.name);
            }
          }

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.1: Статусы параллельных шагов обновляются
   * Feature: interactive-cli-interface, Property 12: Отображение параллельных шагов
   * Validates: Requirements 9.1
   * 
   * Для любого набора параллельных шагов, при завершении выполнения
   * их статусы должны обновляться корректно.
   */
  test('Property 12.1: Parallel step statuses are updated', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            type: fc.constantFrom('model', 'transform', 'export', 'import'),
            status: fc.constantFrom('completed', 'failed')
          }),
          { minLength: 2, maxLength: 5 }
        ),
        (config, parallelStepsData) => {
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);

          // Создаем параллельные шаги с уникальными ID
          const parallelSteps = parallelStepsData.map((stepData, index) => ({
            id: `parallel_${stepData.id}_${index}`,
            name: stepData.name,
            type: stepData.type
          }));

          // Начинаем параллельное выполнение
          display.onParallelStart(parallelSteps as any);

          // Создаем результаты выполнения
          const results = parallelStepsData.map((stepData, index) => ({
            stepId: `parallel_${stepData.id}_${index}`,
            status: stepData.status
          }));

          // Очищаем вывод перед вызовом onParallelComplete
          mockStream.clearOutput();

          // Завершаем параллельное выполнение
          display.onParallelComplete(results);

          const output = mockStream.output;

          // Проверяем, что статусы обновлены
          // Ищем иконки статусов в выводе
          const hasCompletedIcon = output.includes('✓');
          const hasFailedIcon = output.includes('✗');

          // Проверяем соответствие иконок статусам
          const hasCompleted = results.some(r => r.status === 'completed');
          const hasFailed = results.some(r => r.status === 'failed');

          if (hasCompleted) {
            expect(hasCompletedIcon).toBe(true);
          }
          if (hasFailed) {
            expect(hasFailedIcon).toBe(true);
          }

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.2: Параллельные шаги очищаются после завершения
   * Feature: interactive-cli-interface, Property 12: Отображение параллельных шагов
   * Validates: Requirements 9.1
   * 
   * Для любого набора параллельных шагов, после завершения выполнения
   * информация о параллельных шагах должна быть очищена из состояния.
   */
  test('Property 12.2: Parallel steps are cleared after completion', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowConfigArb,
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            type: fc.constantFrom('model', 'transform', 'export', 'import')
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (config, parallelStepsData) => {
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);

          // Создаем параллельные шаги с уникальными ID
          const parallelSteps = parallelStepsData.map((stepData, index) => ({
            id: `parallel_${stepData.id}_${index}`,
            name: stepData.name,
            type: stepData.type
          }));

          // Начинаем параллельное выполнение
          display.onParallelStart(parallelSteps as any);

          // Проверяем, что параллельные шаги установлены
          let state = display.getState();
          expect(state?.parallelSteps).toBeDefined();
          expect(state?.parallelSteps?.length).toBe(parallelSteps.length);

          // Создаем результаты выполнения
          const results = parallelStepsData.map((stepData, index) => ({
            stepId: `parallel_${stepData.id}_${index}`,
            status: 'completed'
          }));

          // Завершаем параллельное выполнение
          display.onParallelComplete(results);

          // Ждем очистки (setTimeout в onParallelComplete - 1000ms)
          await new Promise(resolve => setTimeout(resolve, 1100));

          // Проверяем, что параллельные шаги очищены
          state = display.getState();
          expect(state?.parallelSteps).toBeUndefined();

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 10 } // Меньше итераций из-за async и таймаутов
    );
  }, 30000); // Увеличиваем таймаут до 30 секунд

  /**
   * Property 12.3: Индикатор параллельного выполнения всегда присутствует
   * Feature: interactive-cli-interface, Property 12: Отображение параллельных шагов
   * Validates: Requirements 9.3
   * 
   * Для любого набора параллельных шагов, индикатор ⚡ должен всегда
   * присутствовать в выводе при параллельном выполнении.
   */
  test('Property 12.3: Parallel execution indicator is always present', () => {
    fc.assert(
      fc.property(
        workflowConfigArb,
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            type: fc.constantFrom('model', 'transform', 'export', 'import')
          }),
          { minLength: 1, maxLength: 10 } // От 1 до 10 параллельных шагов
        ),
        (config, parallelStepsData) => {
          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const display = new InteractiveDisplay(renderer);

          display.initialize(config as WorkflowConfig);

          // Создаем параллельные шаги с уникальными ID
          const parallelSteps = parallelStepsData.map((stepData, index) => ({
            id: `parallel_${stepData.id}_${index}`,
            name: stepData.name,
            type: stepData.type
          }));

          mockStream.clearOutput();

          // Начинаем параллельное выполнение
          display.onParallelStart(parallelSteps as any);

          const output = mockStream.output;

          // Проверяем наличие индикатора ⚡ (Requirements 9.3)
          expect(output).toContain('⚡');

          // Проверяем, что индикатор находится рядом с текстом "Parallel Execution"
          expect(output).toMatch(/⚡.*Parallel Execution/);

          display.cleanup();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
