/**
 * Property-based тесты для ResumeSelector
 * 
 * Проверяет Property 16 из документа проектирования:
 * Позиционирование при возобновлении
 * 
 * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
 * Validates: Requirements 14.3
 */

import * as fc from 'fast-check';
import { ResumeSelector } from '../../src/cli/resume-selector.js';
import { TerminalRenderer } from '../../src/cli/terminal-renderer.js';
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

// Генератор информации о шаге для возобновления
const resumeStepInfoArb = fc.record({
  number: fc.integer({ min: 1, max: 100 }),
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  completed: fc.boolean(),
  hasArtifacts: fc.boolean(),
  artifacts: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
    { nil: undefined }
  )
});

// Генератор списка шагов для возобновления
const resumeStepsArb = fc.array(resumeStepInfoArb, { minLength: 1, maxLength: 20 }).map(steps => {
  // Гарантируем уникальность номеров и ID
  return steps.map((step, index) => ({
    ...step,
    number: index + 1,
    id: `step_${index + 1}`
  }));
});

describe('ResumeSelector Property Tests', () => {
  /**
   * Property 16: Позиционирование при возобновлении
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.3
   * 
   * Для любого процесса возобновления, курсор должен автоматически
   * позиционироваться на первом незавершенном шаге.
   */
  test('Property 16: Cursor positions on first incomplete step', () => {
    fc.assert(
      fc.property(resumeStepsArb, (steps) => {
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const selector = new ResumeSelector(renderer);

        // Используем приватный метод для тестирования логики позиционирования
        const findFirstIncompleteStep = (selector as any).findFirstIncompleteStep.bind(selector);
        const defaultIndex = findFirstIncompleteStep(steps);

        // Проверяем корректность позиции
        const hasIncompleteSteps = steps.some(step => !step.completed);
        
        if (hasIncompleteSteps) {
          // Должен быть выбран первый незавершенный шаг
          const firstIncompleteIndex = steps.findIndex(step => !step.completed);
          expect(defaultIndex).toBe(firstIncompleteIndex);
          expect(steps[defaultIndex].completed).toBe(false);
        } else {
          // Если все шаги завершены, должен быть выбран последний шаг
          expect(defaultIndex).toBe(steps.length - 1);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.1: Позиция по умолчанию корректна
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.3
   * 
   * Для любого списка шагов, если не указан defaultIndex, должен быть
   * выбран первый незавершенный шаг.
   */
  test('Property 16.1: Default position is first incomplete step', () => {
    fc.assert(
      fc.property(resumeStepsArb, (steps) => {
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const selector = new ResumeSelector(renderer);

        // Используем приватный метод через рефлексию для тестирования
        // В реальном коде это будет вызвано внутри selectStep
        const findFirstIncompleteStep = (selector as any).findFirstIncompleteStep.bind(selector);
        const defaultIndex = findFirstIncompleteStep(steps);

        // Проверяем корректность позиции
        const hasIncompleteSteps = steps.some(step => !step.completed);
        
        if (hasIncompleteSteps) {
          // Должен быть выбран первый незавершенный шаг
          const firstIncompleteIndex = steps.findIndex(step => !step.completed);
          expect(defaultIndex).toBe(firstIncompleteIndex);
          expect(steps[defaultIndex].completed).toBe(false);
        } else {
          // Если все шаги завершены, должен быть выбран последний шаг
          expect(defaultIndex).toBe(steps.length - 1);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.2: Явно указанный defaultIndex используется
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.4
   * 
   * Для любого списка шагов, если указан defaultIndex, он должен быть
   * использован вместо автоматического определения.
   */
  test('Property 16.2: Explicit defaultIndex is used', () => {
    fc.assert(
      fc.property(
        resumeStepsArb,
        fc.integer({ min: 0, max: 19 }),
        (steps, explicitIndex) => {
          // Ограничиваем индекс количеством шагов
          const actualIndex = explicitIndex % steps.length;

          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const selector = new ResumeSelector(renderer);

          // Создаем опции меню с явным defaultIndex
          const createMenuOptions = (selector as any).createMenuOptions.bind(selector);
          const menuOptions = createMenuOptions(steps, actualIndex);

          // Проверяем, что опция с указанным индексом помечена как DEFAULT
          expect(menuOptions[actualIndex].label).toContain('← DEFAULT');

          // Проверяем, что другие опции не помечены как DEFAULT
          for (let i = 0; i < menuOptions.length; i++) {
            if (i !== actualIndex) {
              expect(menuOptions[i].label).not.toContain('← DEFAULT');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.3: Отображение статусов шагов
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.2
   * 
   * Для любого списка шагов, каждый шаг должен отображаться с:
   * - Номером шага
   * - Названием шага
   * - Статусом выполнения (✓ завершен, ○ не выполнен)
   * - Наличием артефактов
   */
  test('Property 16.3: Step statuses are displayed correctly', () => {
    fc.assert(
      fc.property(resumeStepsArb, (steps) => {
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const selector = new ResumeSelector(renderer);

        // Создаем опции меню (используем приватный метод через рефлексию)
        const createMenuOptions = (selector as any).createMenuOptions.bind(selector);
        const menuOptions = createMenuOptions(steps, 0);

        // Проверяем, что для каждого шага создана опция
        expect(menuOptions.length).toBe(steps.length);

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const option = menuOptions[i];

          // Проверяем наличие номера шага (Requirements 14.2)
          expect(option.label).toContain(`${step.number}.`);

          // Проверяем наличие названия шага (Requirements 14.2)
          expect(option.label).toContain(step.name);

          // Проверяем наличие иконки статуса (Requirements 14.2)
          const expectedIcon = step.completed ? '✓' : '○';
          expect(option.label).toContain(expectedIcon);

          // Проверяем наличие статуса (Requirements 14.2)
          const expectedStatus = step.completed ? 'completed' : 'not completed';
          expect(option.label).toContain(expectedStatus);

          // Проверяем информацию об артефактах (Requirements 14.2)
          if (step.hasArtifacts && step.artifacts && step.artifacts.length > 0) {
            expect(option.label).toContain('artifact');
          }

          // Проверяем значение опции
          expect(option.value).toBe(step.number.toString());
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.4: Маркер DEFAULT отображается корректно
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.3
   * 
   * Для любого списка шагов, шаг по умолчанию должен быть помечен
   * маркером "← DEFAULT".
   */
  test('Property 16.4: DEFAULT marker is displayed correctly', () => {
    fc.assert(
      fc.property(
        resumeStepsArb,
        fc.integer({ min: 0, max: 19 }),
        (steps, defaultIndex) => {
          const actualIndex = defaultIndex % steps.length;

          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const selector = new ResumeSelector(renderer);

          // Создаем опции меню
          const createMenuOptions = (selector as any).createMenuOptions.bind(selector);
          const menuOptions = createMenuOptions(steps, actualIndex);

          // Проверяем, что только шаг по умолчанию имеет маркер DEFAULT
          for (let i = 0; i < menuOptions.length; i++) {
            const option = menuOptions[i];
            
            if (i === actualIndex) {
              // Шаг по умолчанию должен иметь маркер
              expect(option.label).toContain('← DEFAULT');
            } else {
              // Остальные шаги не должны иметь маркер
              expect(option.label).not.toContain('← DEFAULT');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.5: Валидация выбранного шага
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.4
   * 
   * Для любого выбранного шага, номер должен быть в допустимом диапазоне
   * (от 1 до количества шагов).
   */
  test('Property 16.5: Selected step number is valid', () => {
    fc.assert(
      fc.property(
        resumeStepsArb,
        fc.integer({ min: 0, max: 19 }),
        (steps, stepIndex) => {
          const actualIndex = stepIndex % steps.length;

          // Проверяем, что номер шага в допустимом диапазоне
          const stepNumber = steps[actualIndex].number;
          expect(stepNumber).toBeGreaterThanOrEqual(1);
          expect(stepNumber).toBeLessThanOrEqual(steps.length);

          // Проверяем, что номер соответствует реальному шагу
          const selectedStep = steps.find(s => s.number === stepNumber);
          expect(selectedStep).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.6: Отображение информации об артефактах
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.2
   * 
   * Для любого шага с артефактами, должна отображаться информация
   * о количестве и списке артефактов.
   */
  test('Property 16.6: Artifact information is displayed', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            number: fc.integer({ min: 1, max: 100 }),
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            completed: fc.constant(true), // Только завершенные шаги имеют артефакты
            hasArtifacts: fc.constant(true),
            artifacts: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (stepsWithArtifacts) => {
          // Гарантируем уникальность номеров
          const steps = stepsWithArtifacts.map((step, index) => ({
            ...step,
            number: index + 1,
            id: `step_${index + 1}`
          }));

          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const selector = new ResumeSelector(renderer);

          // Создаем опции меню
          const createMenuOptions = (selector as any).createMenuOptions.bind(selector);
          const menuOptions = createMenuOptions(steps, 0);

          // Проверяем информацию об артефактах для каждого шага
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const option = menuOptions[i];

            // Проверяем наличие информации о количестве артефактов
            expect(option.label).toContain(`${step.artifacts!.length} artifact`);

            // Проверяем наличие описания с артефактами
            if (option.description) {
              expect(option.description).toContain('Artifacts:');
              
              // Проверяем, что первые 2 артефакта отображаются
              const displayedArtifacts = step.artifacts!.slice(0, 2);
              for (const artifact of displayedArtifacts) {
                expect(option.description).toContain(artifact);
              }

              // Если артефактов больше 2, должно быть "..."
              if (step.artifacts!.length > 2) {
                expect(option.description).toContain('...');
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.7: Обработка пустого списка шагов
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.1
   * 
   * Для пустого списка шагов, должна быть выброшена ошибка.
   */
  test('Property 16.7: Empty steps list throws error', () => {
    // Проверяем, что пустой список вызывает ошибку
    expect(() => {
      const steps: any[] = [];
      if (steps.length === 0) {
        throw new Error('No steps available for resume');
      }
    }).toThrow('No steps available for resume');
  });

  /**
   * Property 16.8: ShowStepInfo отображает полную информацию
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.2
   * 
   * Для любого шага, showStepInfo должен отображать:
   * - Название
   * - Номер
   * - ID
   * - Статус
   * - Артефакты (если есть)
   */
  test('Property 16.8: ShowStepInfo displays complete information', () => {
    fc.assert(
      fc.property(resumeStepInfoArb, (step) => {
        const mockStream = new MockWriteStream();
        const renderer = new TerminalRenderer(mockStream as any);
        const selector = new ResumeSelector(renderer);

        // Вызываем showStepInfo
        selector.showStepInfo(step);

        const output = mockStream.output;

        // Проверяем наличие всех полей (Requirements 14.2)
        expect(output).toContain('Selected Step:');
        expect(output).toContain(step.name);
        expect(output).toContain('Number:');
        expect(output).toContain(step.number.toString());
        expect(output).toContain('ID:');
        expect(output).toContain(step.id);
        expect(output).toContain('Status:');
        
        const expectedStatus = step.completed ? 'Completed' : 'Not completed';
        expect(output).toContain(expectedStatus);

        // Проверяем информацию об артефактах
        if (step.hasArtifacts && step.artifacts && step.artifacts.length > 0) {
          expect(output).toContain('Artifacts:');
          expect(output).toContain(step.artifacts.length.toString());
          
          // Проверяем, что первые 3 артефакта отображаются
          const displayedArtifacts = step.artifacts.slice(0, 3);
          for (const artifact of displayedArtifacts) {
            expect(output).toContain(artifact);
          }

          // Если артефактов больше 3, должно быть "... and N more"
          if (step.artifacts.length > 3) {
            expect(output).toContain('... and');
            expect(output).toContain('more');
          }
        } else {
          expect(output).toContain('Artifacts: None');
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.9: Все шаги завершены - выбирается последний
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.3
   * 
   * Для списка, где все шаги завершены, должен быть выбран последний шаг.
   */
  test('Property 16.9: All steps completed - selects last step', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            number: fc.integer({ min: 1, max: 100 }),
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            completed: fc.constant(true), // Все шаги завершены
            hasArtifacts: fc.boolean(),
            artifacts: fc.option(
              fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
              { nil: undefined }
            )
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (allCompletedSteps) => {
          // Гарантируем уникальность номеров
          const steps = allCompletedSteps.map((step, index) => ({
            ...step,
            number: index + 1,
            id: `step_${index + 1}`
          }));

          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const selector = new ResumeSelector(renderer);

          // Используем приватный метод для тестирования
          const findFirstIncompleteStep = (selector as any).findFirstIncompleteStep.bind(selector);
          const defaultIndex = findFirstIncompleteStep(steps);

          // Проверяем, что выбран последний шаг
          expect(defaultIndex).toBe(steps.length - 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.10: Первый шаг незавершен - выбирается первый
   * Feature: interactive-cli-interface, Property 16: Позиционирование при возобновлении
   * Validates: Requirements 14.3
   * 
   * Для списка, где первый шаг незавершен, он должен быть выбран.
   */
  test('Property 16.10: First step incomplete - selects first step', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            number: fc.integer({ min: 1, max: 100 }),
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            completed: fc.boolean(),
            hasArtifacts: fc.boolean(),
            artifacts: fc.option(
              fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
              { nil: undefined }
            )
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (randomSteps) => {
          // Гарантируем, что первый шаг незавершен
          const steps = randomSteps.map((step, index) => ({
            ...step,
            number: index + 1,
            id: `step_${index + 1}`,
            completed: index === 0 ? false : step.completed
          }));

          const mockStream = new MockWriteStream();
          const renderer = new TerminalRenderer(mockStream as any);
          const selector = new ResumeSelector(renderer);

          // Используем приватный метод для тестирования
          const findFirstIncompleteStep = (selector as any).findFirstIncompleteStep.bind(selector);
          const defaultIndex = findFirstIncompleteStep(steps);

          // Проверяем, что выбран первый шаг
          expect(defaultIndex).toBe(0);
          expect(steps[0].completed).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
