/**
 * Property-based тесты для InteractiveMenu
 * 
 * Проверяет свойство 13 из документа проектирования:
 * Навигация в интерактивном меню
 */

import * as fc from 'fast-check';
import { InteractiveMenu } from '../../src/cli/interactive-menu.js';
import { TerminalRenderer } from '../../src/cli/terminal-renderer.js';
import { Writable, Readable } from 'stream';

/**
 * Mock WriteStream для тестирования
 */
class MockWriteStream extends Writable {
  public output: string = '';
  public isTTY: boolean = true;
  public columns: number = 80;
  public rows: number = 24;

  constructor(isTTY: boolean = true, columns: number = 80, rows: number = 24) {
    super();
    this.isTTY = isTTY;
    this.columns = columns;
    this.rows = rows;
  }

  _write(chunk: Buffer | string, _encoding: string, callback: () => void): void {
    this.output += chunk.toString();
    callback();
  }

  clearOutput(): void {
    this.output = '';
  }
}

/**
 * Mock ReadStream для тестирования
 */
class MockReadStream extends Readable {
  public isTTY: boolean = true;
  private rawMode: boolean = false;

  constructor(isTTY: boolean = true) {
    super();
    this.isTTY = isTTY;
  }

  _read(): void {
    // Не делаем ничего, данные будут добавляться через push()
  }

  setRawMode(mode: boolean): this {
    this.rawMode = mode;
    return this;
  }

  getRawMode(): boolean {
    return this.rawMode;
  }

  simulateKeyPress(key: string): void {
    this.push(Buffer.from(key));
  }
}

// Генератор опций меню
const menuOptionArb = fc.record({
  label: fc.string({ minLength: 1, maxLength: 50 }),
  value: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined })
});

// Генератор списка опций меню (минимум 1, максимум 10)
const menuOptionsArb = fc.array(menuOptionArb, { minLength: 1, maxLength: 10 });

// Генератор индекса по умолчанию
const defaultIndexArb = (optionsLength: number) =>
  fc.integer({ min: 0, max: optionsLength - 1 });

// Генератор последовательности нажатий стрелок
const arrowKeySequenceArb = fc.array(
  fc.constantFrom('up', 'down'),
  { minLength: 0, maxLength: 20 }
);

describe('InteractiveMenu Property Tests', () => {
  /**
   * Property 13: Навигация в интерактивном меню
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.2, 10.1.3
   * 
   * Для любого интерактивного меню, нажатие стрелок вверх/вниз должно изменять
   * выбранную опцию, а нажатие Enter должно возвращать значение выбранной опции.
   */
  test('Property 13.1: Arrow keys change selected option', () => {
    fc.assert(
      fc.property(menuOptionsArb, (options) => {
        const mockOutput = new MockWriteStream(true, 80, 24);
        const mockInput = new MockReadStream(true);
        const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
        const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

        // Устанавливаем опции и начальный индекс
        menu['options'] = options;
        menu['currentIndex'] = 0;

        const initialIndex = menu.getCurrentIndex();
        expect(initialIndex).toBe(0);

        // Симулируем нажатие стрелки вниз
        menu['moveDown']();
        const afterDownIndex = menu.getCurrentIndex();

        if (options.length > 1) {
          expect(afterDownIndex).toBe(1);
        } else {
          // Для одной опции должен остаться на месте (циклический переход)
          expect(afterDownIndex).toBe(0);
        }

        // Симулируем нажатие стрелки вверх
        menu['moveUp']();
        const afterUpIndex = menu.getCurrentIndex();
        expect(afterUpIndex).toBe(initialIndex);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.2: Циклическая навигация вниз
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.2
   * 
   * Для любого меню, нажатие стрелки вниз на последней опции должно
   * переводить на первую опцию (циклический переход).
   */
  test('Property 13.2: Cyclic navigation down', () => {
    fc.assert(
      fc.property(menuOptionsArb, (options) => {
        const mockOutput = new MockWriteStream(true, 80, 24);
        const mockInput = new MockReadStream(true);
        const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
        const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

        // Устанавливаем опции и индекс на последнюю опцию
        menu['options'] = options;
        menu['currentIndex'] = options.length - 1;

        // Симулируем нажатие стрелки вниз
        menu['moveDown']();
        const newIndex = menu.getCurrentIndex();

        // Должны перейти к первой опции
        expect(newIndex).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.3: Циклическая навигация вверх
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.2
   * 
   * Для любого меню, нажатие стрелки вверх на первой опции должно
   * переводить на последнюю опцию (циклический переход).
   */
  test('Property 13.3: Cyclic navigation up', () => {
    fc.assert(
      fc.property(menuOptionsArb, (options) => {
        const mockOutput = new MockWriteStream(true, 80, 24);
        const mockInput = new MockReadStream(true);
        const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
        const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

        // Устанавливаем опции и индекс на первую опцию
        menu['options'] = options;
        menu['currentIndex'] = 0;

        // Симулируем нажатие стрелки вверх
        menu['moveUp']();
        const newIndex = menu.getCurrentIndex();

        // Должны перейти к последней опции
        expect(newIndex).toBe(options.length - 1);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.4: Последовательность навигации
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.2
   * 
   * Для любой последовательности нажатий стрелок, индекс должен оставаться
   * в допустимых границах [0, options.length - 1].
   */
  test('Property 13.4: Navigation sequence keeps index in bounds', () => {
    fc.assert(
      fc.property(menuOptionsArb, arrowKeySequenceArb, (options, keySequence) => {
        const mockOutput = new MockWriteStream(true, 80, 24);
        const mockInput = new MockReadStream(true);
        const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
        const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

        // Устанавливаем опции
        menu['options'] = options;
        menu['currentIndex'] = 0;

        // Выполняем последовательность нажатий
        for (const key of keySequence) {
          if (key === 'up') {
            menu['moveUp']();
          } else {
            menu['moveDown']();
          }

          // Проверяем, что индекс в допустимых границах
          const currentIndex = menu.getCurrentIndex();
          expect(currentIndex).toBeGreaterThanOrEqual(0);
          expect(currentIndex).toBeLessThan(options.length);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.5: Индекс по умолчанию
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.2
   * 
   * Для любого допустимого индекса по умолчанию, меню должно начинаться
   * с этого индекса.
   */
  test('Property 13.5: Default index is respected', () => {
    fc.assert(
      fc.property(menuOptionsArb, (options) => {
        const defaultIndex = fc.sample(defaultIndexArb(options.length), 1)[0];
        
        const mockOutput = new MockWriteStream(true, 80, 24);
        const mockInput = new MockReadStream(true);
        const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
        const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

        // Устанавливаем опции и индекс по умолчанию
        menu['options'] = options;
        menu['currentIndex'] = defaultIndex;

        // Проверяем, что индекс установлен корректно
        expect(menu.getCurrentIndex()).toBe(defaultIndex);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.6: Недопустимый индекс по умолчанию
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.2
   * 
   * Для любого недопустимого индекса по умолчанию (отрицательный или >= length),
   * индекс должен оставаться в допустимых границах.
   */
  test('Property 13.6: Invalid default index is handled', () => {
    fc.assert(
      fc.property(
        menuOptionsArb,
        fc.integer({ min: -10, max: 100 }),
        (options, invalidIndex) => {
          // Пропускаем допустимые индексы
          fc.pre(invalidIndex < 0 || invalidIndex >= options.length);

          const mockOutput = new MockWriteStream(true, 80, 24);
          const mockInput = new MockReadStream(true);
          const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
          const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

          // Устанавливаем опции
          menu['options'] = options;
          
          // Пытаемся установить недопустимый индекс
          menu.setCurrentIndex(invalidIndex);

          // Индекс не должен измениться (должен остаться в границах)
          const currentIndex = menu.getCurrentIndex();
          expect(currentIndex).toBeGreaterThanOrEqual(0);
          expect(currentIndex).toBeLessThan(options.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.7: Получение опций
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.1
   * 
   * Для любого набора опций, метод getOptions() должен возвращать
   * копию опций (не изменяя оригинал).
   */
  test('Property 13.7: getOptions returns a copy', () => {
    fc.assert(
      fc.property(menuOptionsArb, (options) => {
        const mockOutput = new MockWriteStream(true, 80, 24);
        const mockInput = new MockReadStream(true);
        const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
        const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

        // Устанавливаем опции
        menu['options'] = options;

        // Получаем опции
        const retrievedOptions = menu.getOptions();

        // Проверяем, что это копия
        expect(retrievedOptions).toEqual(options);
        expect(retrievedOptions).not.toBe(options);

        // Изменение копии не должно влиять на оригинал
        if (retrievedOptions.length > 0) {
          retrievedOptions[0].label = 'MODIFIED';
          expect(menu.getOptions()[0].label).not.toBe('MODIFIED');
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.8: Навигация сохраняет количество опций
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.2
   * 
   * Для любой последовательности навигации, количество опций должно
   * оставаться неизменным.
   */
  test('Property 13.8: Navigation preserves options count', () => {
    fc.assert(
      fc.property(menuOptionsArb, arrowKeySequenceArb, (options, keySequence) => {
        const mockOutput = new MockWriteStream(true, 80, 24);
        const mockInput = new MockReadStream(true);
        const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
        const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

        // Устанавливаем опции
        menu['options'] = options;
        const initialCount = menu.getOptions().length;

        // Выполняем последовательность нажатий
        for (const key of keySequence) {
          if (key === 'up') {
            menu['moveUp']();
          } else {
            menu['moveDown']();
          }
        }

        // Проверяем, что количество опций не изменилось
        expect(menu.getOptions().length).toBe(initialCount);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.9: Вычисление конечного индекса
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.2
   * 
   * Для любой последовательности нажатий вверх и вниз, конечный индекс
   * должен быть предсказуемым на основе начального индекса и количества нажатий.
   */
  test('Property 13.9: Final index is predictable', () => {
    fc.assert(
      fc.property(
        menuOptionsArb,
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (options, upCount, downCount) => {
          const mockOutput = new MockWriteStream(true, 80, 24);
          const mockInput = new MockReadStream(true);
          const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
          const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

          // Устанавливаем опции и начальный индекс
          menu['options'] = options;
          menu['currentIndex'] = 0;

          // Выполняем нажатия вниз
          for (let i = 0; i < downCount; i++) {
            menu['moveDown']();
          }

          // Выполняем нажатия вверх
          for (let i = 0; i < upCount; i++) {
            menu['moveUp']();
          }

          // Вычисляем ожидаемый индекс
          const netMovement = downCount - upCount;
          const expectedIndex = ((netMovement % options.length) + options.length) % options.length;

          // Проверяем, что индекс соответствует ожидаемому
          expect(menu.getCurrentIndex()).toBe(expectedIndex);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.10: Пустое меню выбрасывает ошибку
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.1
   * 
   * Попытка показать меню без опций должна выбрасывать ошибку.
   */
  test('Property 13.10: Empty menu throws error', async () => {
    const mockOutput = new MockWriteStream(true, 80, 24);
    const mockInput = new MockReadStream(true);
    const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
    const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

    // Попытка показать пустое меню должна выбросить ошибку
    await expect(menu.show([])).rejects.toThrow('Menu must have at least one option');
  });

  /**
   * Property 13.11: Non-TTY терминал выбрасывает ошибку
   * Feature: interactive-cli-interface, Property 13: Навигация в интерактивном меню
   * Validates: Requirements 10.1.1
   * 
   * Попытка показать интерактивное меню в non-TTY терминале должна
   * выбрасывать ошибку.
   */
  test('Property 13.11: Non-TTY terminal throws error', async () => {
    fc.assert(
      fc.asyncProperty(menuOptionsArb, async (options) => {
        const mockOutput = new MockWriteStream(false, 80, 24); // non-TTY
        const mockInput = new MockReadStream(false);
        const renderer = new TerminalRenderer(mockOutput as unknown as NodeJS.WriteStream);
        const menu = new InteractiveMenu(renderer, mockInput as unknown as NodeJS.ReadStream);

        // Попытка показать меню в non-TTY должна выбросить ошибку
        await expect(menu.show(options)).rejects.toThrow('Interactive menu requires a TTY terminal');
      }),
      { numRuns: 100 }
    );
  });
});
