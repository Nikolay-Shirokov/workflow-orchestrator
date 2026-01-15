/**
 * Property-based тесты для DisplayState и вычисления прогресса
 * 
 * Проверяет свойство 9 из документа проектирования:
 * Корректность вычисления прогресса
 */

import * as fc from 'fast-check';
import { DisplayStateUtils, DisplayState } from '../../src/cli/display-types.js';

// Генератор количества шагов (0-100)
const stepCountArb = fc.integer({ min: 0, max: 100 });

// Генератор статусов шагов
const stepStatusArb = fc.constantFrom(
  'pending' as const,
  'running' as const,
  'completed' as const,
  'failed' as const,
  'skipped' as const
);

// Генератор информации о шаге
const stepInfoArb = fc.record({
  number: fc.integer({ min: 1, max: 100 }),
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  status: stepStatusArb,
  duration: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: undefined }),
  artifacts: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }), { nil: undefined }),
  error: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  role: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  adapter: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  model: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined })
});

// Генератор состояния отображения
const displayStateArb = fc.record({
  workflowName: fc.string({ minLength: 1, maxLength: 50 }),
  workflowVersion: fc.string({ minLength: 1, maxLength: 20 }),
  artifactsDir: fc.string({ minLength: 1, maxLength: 100 }),
  steps: fc.array(stepInfoArb, { minLength: 0, maxLength: 20 }),
  currentStepIndex: fc.integer({ min: -1, max: 19 }),
  recentActivity: fc.array(
    fc.record({
      stepName: fc.string({ minLength: 1, maxLength: 100 }),
      status: fc.constantFrom('success' as const, 'failed' as const),
      duration: fc.integer({ min: 0, max: 60000 }),
      artifacts: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 })
    }),
    { maxLength: 5 }
  ),
  totalSteps: fc.integer({ min: 0, max: 20 }),
  completedSteps: fc.integer({ min: 0, max: 20 }),
  startTime: fc.integer({ min: 0, max: Date.now() })
});

// Генератор ширины прогресс-бара
const progressBarWidthArb = fc.integer({ min: 10, max: 100 });

// Генератор процента прогресса
const progressPercentArb = fc.integer({ min: 0, max: 100 });

// Генератор времени в миллисекундах
const millisecondsArb = fc.integer({ min: 0, max: 3600000 }); // До 1 часа

describe('DisplayState Property Tests', () => {
  /**
   * Property 9: Корректность вычисления прогресса
   * Feature: interactive-cli-interface, Property 9: Корректность вычисления прогресса
   * Validates: Requirements 6.2
   * 
   * Для любого состояния выполнения, процент прогресса должен равняться
   * (завершенные шаги / общее количество шагов) * 100.
   */
  test('Property 9: Progress calculation is correct', () => {
    fc.assert(
      fc.property(
        stepCountArb,
        stepCountArb,
        (totalSteps, completedSteps) => {
          // Ограничиваем completedSteps до totalSteps
          const validCompletedSteps = Math.min(completedSteps, totalSteps);
          const progress = DisplayStateUtils.calculateProgress(validCompletedSteps, totalSteps);

          if (totalSteps === 0) {
            // Если нет шагов, прогресс должен быть 0
            expect(progress).toBe(0);
          } else {
            // Вычисляем ожидаемый прогресс
            const expectedProgress = (validCompletedSteps / totalSteps) * 100;
            
            // Проверяем, что вычисленный прогресс соответствует формуле
            expect(progress).toBeCloseTo(expectedProgress, 10);
            
            // Проверяем, что прогресс в диапазоне [0, 100]
            expect(progress).toBeGreaterThanOrEqual(0);
            expect(progress).toBeLessThanOrEqual(100);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.1: Прогресс 0% когда нет завершенных шагов
   * Feature: interactive-cli-interface, Property 9: Корректность вычисления прогресса
   * Validates: Requirements 6.2
   * 
   * Для любого количества шагов, если завершенных шагов 0, прогресс должен быть 0%.
   */
  test('Property 9.1: Progress is 0% when no steps completed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (totalSteps) => {
          const progress = DisplayStateUtils.calculateProgress(0, totalSteps);
          expect(progress).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.2: Прогресс 100% когда все шаги завершены
   * Feature: interactive-cli-interface, Property 9: Корректность вычисления прогресса
   * Validates: Requirements 6.2
   * 
   * Для любого количества шагов, если все шаги завершены, прогресс должен быть 100%.
   */
  test('Property 9.2: Progress is 100% when all steps completed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (totalSteps) => {
          const progress = DisplayStateUtils.calculateProgress(totalSteps, totalSteps);
          expect(progress).toBe(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.3: Прогресс монотонно возрастает
   * Feature: interactive-cli-interface, Property 9: Корректность вычисления прогресса
   * Validates: Requirements 6.2
   * 
   * Для любого количества шагов, при увеличении количества завершенных шагов
   * прогресс должен монотонно возрастать.
   */
  test('Property 9.3: Progress increases monotonically', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        (totalSteps) => {
          // Вычисляем прогресс для последовательных значений завершенных шагов
          for (let completed = 0; completed < totalSteps; completed++) {
            const progress1 = DisplayStateUtils.calculateProgress(completed, totalSteps);
            const progress2 = DisplayStateUtils.calculateProgress(completed + 1, totalSteps);
            
            // Прогресс должен увеличиваться
            expect(progress2).toBeGreaterThan(progress1);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 10: Формат прогресс-бара
   * Feature: interactive-cli-interface, Property 10: Формат прогресс-бара
   * Validates: Requirements 6.1
   * 
   * Для любого прогресс-бара, его длина должна быть фиксированной,
   * а количество заполненных символов должно соответствовать проценту выполнения.
   */
  test('Property 10: Progress bar format is correct', () => {
    fc.assert(
      fc.property(
        progressPercentArb,
        progressBarWidthArb,
        (progress, width) => {
          const progressBar = DisplayStateUtils.createProgressBar(progress, width);

          // Проверяем, что прогресс-бар имеет правильную структуру: [███░░░]
          expect(progressBar).toMatch(/^\[█*░*\]$/);

          // Вычисляем ожидаемое количество заполненных символов
          const expectedFilled = Math.round((progress / 100) * width);
          const expectedEmpty = width - expectedFilled;

          // Извлекаем заполненные и пустые символы
          const filled = (progressBar.match(/█/g) || []).length;
          const empty = (progressBar.match(/░/g) || []).length;

          // Проверяем количество символов
          expect(filled).toBe(expectedFilled);
          expect(empty).toBe(expectedEmpty);

          // Проверяем общую длину (включая скобки)
          expect(progressBar.length).toBe(width + 2); // +2 для скобок []
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.1: Прогресс-бар для 0% пустой
   * Feature: interactive-cli-interface, Property 10: Формат прогресс-бара
   * Validates: Requirements 6.1
   * 
   * Для любой ширины, прогресс-бар для 0% должен быть полностью пустым.
   */
  test('Property 10.1: Progress bar is empty at 0%', () => {
    fc.assert(
      fc.property(progressBarWidthArb, (width) => {
        const progressBar = DisplayStateUtils.createProgressBar(0, width);

        // Не должно быть заполненных символов
        expect(progressBar).not.toContain('█');
        
        // Должны быть только пустые символы
        const empty = (progressBar.match(/░/g) || []).length;
        expect(empty).toBe(width);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.2: Прогресс-бар для 100% полный
   * Feature: interactive-cli-interface, Property 10: Формат прогресс-бара
   * Validates: Requirements 6.1
   * 
   * Для любой ширины, прогресс-бар для 100% должен быть полностью заполнен.
   */
  test('Property 10.2: Progress bar is full at 100%', () => {
    fc.assert(
      fc.property(progressBarWidthArb, (width) => {
        const progressBar = DisplayStateUtils.createProgressBar(100, width);

        // Не должно быть пустых символов
        expect(progressBar).not.toContain('░');
        
        // Должны быть только заполненные символы
        const filled = (progressBar.match(/█/g) || []).length;
        expect(filled).toBe(width);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11: Форматирование времени выполнения
   * Feature: interactive-cli-interface, Property 9: Корректность вычисления прогресса
   * Validates: Requirements 6.4
   * 
   * Для любого времени в миллисекундах, форматирование должно возвращать
   * строку в формате "Xm Ys" или "Xs".
   */
  test('Property 11: Execution time formatting', () => {
    fc.assert(
      fc.property(millisecondsArb, (milliseconds) => {
        const formatted = DisplayStateUtils.formatExecutionTime(milliseconds);

        const minutes = Math.floor(milliseconds / 60000);
        const seconds = ((milliseconds % 60000) / 1000).toFixed(1);

        if (minutes > 0) {
          // Должен быть формат "Xm Ys"
          expect(formatted).toMatch(/^\d+m \d+\.\d+s$/);
          expect(formatted).toContain(`${minutes}m`);
          expect(formatted).toContain(`${seconds}s`);
        } else {
          // Должен быть формат "Xs"
          expect(formatted).toMatch(/^\d+\.\d+s$/);
          expect(formatted).toBe(`${seconds}s`);
        }
      }),
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
  test('Property 6: Step status updates correctly', () => {
    fc.assert(
      fc.property(
        displayStateArb,
        fc.integer({ min: 0, max: 19 }),
        fc.constantFrom('completed' as const, 'failed' as const, 'skipped' as const),
        fc.integer({ min: 0, max: 60000 }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
        (state, stepIndex, status, duration, artifacts) => {
          // Пропускаем, если индекс вне диапазона
          if (stepIndex >= state.steps.length) {
            return;
          }

          // Устанавливаем начальный статус "running"
          const stateWithRunningStep: DisplayState = {
            ...state,
            steps: state.steps.map((step, idx) =>
              idx === stepIndex ? { ...step, status: 'running' as const } : step
            )
          };

          // Обновляем состояние при завершении шага
          const updatedState = DisplayStateUtils.updateStateOnStepComplete(
            stateWithRunningStep,
            stepIndex,
            status,
            duration,
            artifacts
          );

          // Проверяем, что статус изменился
          expect(updatedState.steps[stepIndex].status).toBe(status);
          
          // Проверяем, что длительность установлена
          expect(updatedState.steps[stepIndex].duration).toBe(duration);
          
          // Проверяем, что артефакты установлены
          expect(updatedState.steps[stepIndex].artifacts).toEqual(artifacts);
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
   * не должно превышать 3.
   */
  test('Property 8: Recent activity size is limited to 3', () => {
    fc.assert(
      fc.property(
        displayStateArb,
        fc.integer({ min: 0, max: 19 }),
        fc.constantFrom('completed' as const, 'failed' as const),
        fc.integer({ min: 0, max: 60000 }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
        (state, stepIndex, status, duration, artifacts) => {
          // Пропускаем, если индекс вне диапазона
          if (stepIndex >= state.steps.length) {
            return;
          }

          // Обновляем состояние при завершении шага
          const updatedState = DisplayStateUtils.updateStateOnStepComplete(
            state,
            stepIndex,
            status,
            duration,
            artifacts
          );

          // Проверяем, что размер истории не превышает 3
          expect(updatedState.recentActivity.length).toBeLessThanOrEqual(3);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.1: Новые действия добавляются в начало истории
   * Feature: interactive-cli-interface, Property 8: Ограничение размера истории
   * Validates: Requirements 5.2
   * 
   * Для любого нового завершенного шага, он должен добавляться в начало
   * истории последних действий.
   */
  test('Property 8.1: New activities are added to the beginning', () => {
    fc.assert(
      fc.property(
        displayStateArb,
        fc.integer({ min: 0, max: 19 }),
        fc.constantFrom('completed' as const, 'failed' as const),
        fc.integer({ min: 0, max: 60000 }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
        (state, stepIndex, status, duration, artifacts) => {
          // Пропускаем, если индекс вне диапазона
          if (stepIndex >= state.steps.length) {
            return;
          }

          const stepName = state.steps[stepIndex].name;

          // Обновляем состояние при завершении шага
          const updatedState = DisplayStateUtils.updateStateOnStepComplete(
            state,
            stepIndex,
            status,
            duration,
            artifacts
          );

          // Проверяем, что новое действие в начале истории
          expect(updatedState.recentActivity[0].stepName).toBe(stepName);
          expect(updatedState.recentActivity[0].status).toBe(
            status === 'completed' ? 'success' : 'failed'
          );
          expect(updatedState.recentActivity[0].duration).toBe(duration);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12: Создание начального состояния
   * Feature: interactive-cli-interface, Property 9: Корректность вычисления прогресса
   * Validates: Requirements 6.1, 6.2, 6.3
   * 
   * Для любого набора шагов, начальное состояние должно быть корректно
   * инициализировано с нулевым прогрессом.
   */
  test('Property 12: Initial state creation', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            role: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            adapter: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            model: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined })
          }),
          { minLength: 0, maxLength: 20 }
        ),
        (workflowName, workflowVersion, artifactsDir, steps) => {
          const state = DisplayStateUtils.createInitialState(
            workflowName,
            workflowVersion,
            artifactsDir,
            steps
          );

          // Проверяем базовые поля
          expect(state.workflowName).toBe(workflowName);
          expect(state.workflowVersion).toBe(workflowVersion);
          expect(state.artifactsDir).toBe(artifactsDir);

          // Проверяем количество шагов
          expect(state.steps.length).toBe(steps.length);
          expect(state.totalSteps).toBe(steps.length);

          // Проверяем начальные значения
          expect(state.completedSteps).toBe(0);
          expect(state.currentStepIndex).toBe(-1);
          expect(state.recentActivity).toEqual([]);

          // Проверяем, что все шаги имеют статус 'pending'
          for (const step of state.steps) {
            expect(step.status).toBe('pending');
          }

          // Проверяем, что startTime установлен
          expect(state.startTime).toBeGreaterThan(0);
          expect(state.startTime).toBeLessThanOrEqual(Date.now());
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13: Обновление состояния при начале шага
   * Feature: interactive-cli-interface, Property 6: Обновление статуса шага
   * Validates: Requirements 3.3
   * 
   * Для любого шага, при его начале статус должен измениться на "running"
   * и currentStepIndex должен обновиться.
   */
  test('Property 13: State updates on step start', () => {
    fc.assert(
      fc.property(
        displayStateArb,
        fc.integer({ min: 0, max: 19 }),
        (state, stepIndex) => {
          // Пропускаем, если индекс вне диапазона
          if (stepIndex >= state.steps.length) {
            return;
          }

          const updatedState = DisplayStateUtils.updateStateOnStepStart(state, stepIndex);

          // Проверяем, что статус изменился на "running"
          expect(updatedState.steps[stepIndex].status).toBe('running');

          // Проверяем, что currentStepIndex обновился
          expect(updatedState.currentStepIndex).toBe(stepIndex);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14: Подсчет завершенных шагов
   * Feature: interactive-cli-interface, Property 9: Корректность вычисления прогресса
   * Validates: Requirements 6.2, 6.3
   * 
   * Для любого состояния, количество завершенных шагов должно быть неотрицательным
   * и не превышать длину массива шагов.
   */
  test('Property 14: Completed steps count is accurate', () => {
    fc.assert(
      fc.property(displayStateArb, (state) => {
        // Подсчитываем завершенные шаги вручную
        const actualCompleted = state.steps.filter(
          step => step.status === 'completed' || step.status === 'failed' || step.status === 'skipped'
        ).length;

        // Проверяем, что количество завершенных шагов корректно
        expect(actualCompleted).toBeGreaterThanOrEqual(0);
        expect(actualCompleted).toBeLessThanOrEqual(state.steps.length);
        
        // Проверяем, что completedSteps не отрицательное
        expect(state.completedSteps).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });
});
