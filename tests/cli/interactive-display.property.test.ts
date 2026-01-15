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
  public rows: number = 24;

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
});
