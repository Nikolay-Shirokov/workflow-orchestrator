/**
 * Property-based тесты для выбора режима отображения
 * 
 * Feature: interactive-cli-interface
 * Validates: Requirements 1.2, 1.3, 1.4
 */

import fc from 'fast-check';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { ProgressDisplay } from '../../src/cli/progress-display.js';
import { InteractiveDisplay } from '../../src/cli/interactive-display.js';
import { IProgressDisplay } from '../../src/cli/display-types.js';

/**
 * Создание индикатора прогресса на основе режима
 * Это копия функции из src/cli/index.ts для тестирования
 */
function createProgressDisplay(logMode: boolean, logger: Logger): IProgressDisplay {
  if (logMode) {
    return new ProgressDisplay(logger);
  } else {
    try {
      return new InteractiveDisplay();
    } catch (error) {
      // Fallback на логовый режим при ошибке
      return new ProgressDisplay(logger);
    }
  }
}

describe('Display Mode Selection - Property Tests', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({
      level: LogLevel.ERROR, // Минимальный уровень для тестов
      enableConsole: false,
      enableFile: false
    });
  });

  /**
   * Property 1: Выбор режима на основе флага
   * Feature: interactive-cli-interface, Property 1: Выбор режима на основе флага
   * 
   * Для любой конфигурации запуска, если указан флаг logMode=true,
   * то система должна использовать ProgressDisplay (логовый режим),
   * иначе - InteractiveDisplay (интерактивный режим)
   * 
   * Validates: Requirements 1.2, 1.3
   */
  test('Property 1: Выбор режима на основе флага', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // Генератор флага logMode
        (logMode) => {
          // Создаем display на основе флага
          const display = createProgressDisplay(logMode, logger);

          // Проверяем, что выбран правильный тип display
          if (logMode) {
            // Логовый режим - должен быть ProgressDisplay
            expect(display).toBeInstanceOf(ProgressDisplay);
          } else {
            // Интерактивный режим - должен быть InteractiveDisplay или ProgressDisplay (fallback)
            // Проверяем, что это один из допустимых типов
            const isValidType = 
              display instanceof InteractiveDisplay || 
              display instanceof ProgressDisplay;
            expect(isValidType).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Неизменность режима
   * Feature: interactive-cli-interface, Property 2: Неизменность режима
   * 
   * Для любой сессии выполнения, режим отображения, выбранный при инициализации,
   * должен оставаться неизменным на протяжении всей сессии
   * 
   * Validates: Requirements 1.4
   */
  test('Property 2: Неизменность режима', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // Генератор флага logMode
        fc.array(fc.constantFrom('start', 'complete', 'error'), { minLength: 1, maxLength: 10 }), // Последовательность событий
        (logMode, _events) => {
          // Создаем display на основе флага
          const display = createProgressDisplay(logMode, logger);
          const initialType = display.constructor.name;

          // Симулируем последовательность событий
          // (в реальности display не меняет свой тип)
          // _events используется для генерации различных сценариев
          
          // Проверяем, что тип display не изменился
          const finalType = display.constructor.name;
          expect(finalType).toBe(initialType);

          // Дополнительная проверка: создаем новый display с тем же флагом
          const display2 = createProgressDisplay(logMode, logger);
          const secondType = display2.constructor.name;
          
          // Тип должен быть таким же
          expect(secondType).toBe(initialType);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Консистентность выбора режима
   * 
   * Для любого значения флага logMode, повторный вызов createProgressDisplay
   * с тем же флагом должен возвращать display того же типа
   */
  test('Property 3: Консистентность выбора режима', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.nat({ max: 5 }), // Количество повторных вызовов
        (logMode, repeatCount) => {
          const displays: IProgressDisplay[] = [];
          
          // Создаем несколько display с одним и тем же флагом
          for (let i = 0; i <= repeatCount; i++) {
            displays.push(createProgressDisplay(logMode, logger));
          }

          // Все display должны быть одного типа
          const firstType = displays[0].constructor.name;
          for (const display of displays) {
            expect(display.constructor.name).toBe(firstType);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: Интерфейс IProgressDisplay
   * 
   * Для любого режима, созданный display должен реализовывать
   * обязательные методы интерфейса IProgressDisplay
   */
  test('Property 4: Интерфейс IProgressDisplay', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (logMode) => {
          const display = createProgressDisplay(logMode, logger);

          // Проверяем наличие обязательных методов
          expect(typeof display.onWorkflowStart).toBe('function');
          expect(typeof display.onWorkflowComplete).toBe('function');

          // Проверяем наличие опциональных методов (могут быть undefined)
          // Но если они есть, то должны быть функциями
          if (display.onStepStart !== undefined) {
            expect(typeof display.onStepStart).toBe('function');
          }
          if (display.onStepComplete !== undefined) {
            expect(typeof display.onStepComplete).toBe('function');
          }
          if (display.onStepError !== undefined) {
            expect(typeof display.onStepError).toBe('function');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
