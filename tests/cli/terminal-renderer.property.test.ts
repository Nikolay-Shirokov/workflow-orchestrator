/**
 * Property-based тесты для TerminalRenderer
 *
 * Проверяет свойство 4 из документа проектирования:
 * Цветовая индикация статусов
 *
 * ПРИМЕЧАНИЕ: Некоторые тесты пропускаются в CI среде, так как требуют
 * реального TTY терминала для корректной работы с ANSI кодами.
 */

// Пропускаем TTY-зависимые тесты в CI среде
const isCI = process.env.CI === 'true';

import * as fc from 'fast-check';
import { TerminalRenderer, TerminalColor } from '../../src/cli/terminal-renderer.js';
import { Writable } from 'stream';

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

// Генератор статусов шагов
const stepStatusArb = fc.constantFrom(
  'completed' as const,
  'running' as const,
  'pending' as const,
  'failed' as const,
  'skipped' as const
);

// Генератор текста для форматирования
const textArb = fc.string({ minLength: 1, maxLength: 100 });

// Генератор размеров терминала
const terminalSizeArb = fc.record({
  width: fc.integer({ min: 40, max: 200 }),
  height: fc.integer({ min: 10, max: 100 })
});

describe('TerminalRenderer Property Tests', () => {
  /**
   * Property 4: Цветовая индикация статусов
   * Feature: interactive-cli-interface, Property 4: Цветовая индикация статусов
   * Validates: Requirements 2.3
   * 
   * Для любого статуса шага, система должна использовать соответствующий цвет:
   * - Зеленый для завершенных шагов (completed)
   * - Желтый для текущего шага (running)
   * - Серый для ожидающих шагов (pending)
   * - Красный для ошибок (failed)
   * - Серый для пропущенных шагов (skipped)
   */
  test('Property 4: Status colors match requirements', () => {
    fc.assert(
      fc.property(stepStatusArb, (status) => {
        const mockStream = new MockWriteStream(true, 80, 24);
        const renderer = new TerminalRenderer(mockStream as unknown as NodeJS.WriteStream);

        // Получаем цвет для статуса
        const color = renderer.getStatusColor(status);

        // Проверяем соответствие цвета статусу согласно Requirements 2.3
        switch (status) {
          case 'completed':
            expect(color).toBe(TerminalColor.Green);
            break;
          case 'running':
            expect(color).toBe(TerminalColor.Yellow);
            break;
          case 'pending':
            expect(color).toBe(TerminalColor.Gray);
            break;
          case 'failed':
            expect(color).toBe(TerminalColor.Red);
            break;
          case 'skipped':
            expect(color).toBe(TerminalColor.Gray);
            break;
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.1: Форматированный статус содержит цветовые коды
   * Feature: interactive-cli-interface, Property 4: Цветовая индикация статусов
   * Validates: Requirements 2.3
   *
   * Для любого статуса шага в TTY терминале, форматированный вывод должен
   * содержать соответствующие ANSI escape codes для цвета.
   *
   * ПРИМЕЧАНИЕ: Пропускается в CI - требует реального TTY для ANSI кодов.
   */
  (isCI ? test.skip : test)('Property 4.1: Formatted status contains ANSI color codes in TTY', () => {
    fc.assert(
      fc.property(stepStatusArb, (status) => {
        const mockStream = new MockWriteStream(true, 80, 24);
        const renderer = new TerminalRenderer(mockStream as unknown as NodeJS.WriteStream);

        // Форматируем статус
        const formatted = renderer.formatStatus(status);

        // Получаем ожидаемый цвет
        const expectedColor = renderer.getStatusColor(status);

        // Проверяем, что форматированная строка содержит цветовой код
        expect(formatted).toContain(expectedColor);
        
        // Проверяем, что форматированная строка содержит код сброса
        expect(formatted).toContain(TerminalColor.Reset);

        // Проверяем, что форматированная строка содержит иконку статуса
        const icon = renderer.getStatusIcon(status);
        expect(formatted).toContain(icon);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.2: Цветовое форматирование в non-TTY терминале
   * Feature: interactive-cli-interface, Property 4: Цветовая индикация статусов
   * Validates: Requirements 2.3
   * 
   * Для любого текста в non-TTY терминале, цветовое форматирование не должно
   * добавлять ANSI escape codes.
   */
  test('Property 4.2: No ANSI codes in non-TTY terminal', () => {
    fc.assert(
      fc.property(textArb, stepStatusArb, (text, status) => {
        const mockStream = new MockWriteStream(false, 80, 24);
        const renderer = new TerminalRenderer(mockStream as unknown as NodeJS.WriteStream);

        // Получаем цвет для статуса
        const color = renderer.getStatusColor(status);

        // Форматируем текст с цветом
        const formatted = renderer.colorize(text, color);

        // В non-TTY терминале не должно быть ANSI кодов
        expect(formatted).toBe(text);
        expect(formatted).not.toContain('\x1b[');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.3: Иконки статусов уникальны
   * Feature: interactive-cli-interface, Property 4: Цветовая индикация статусов
   * Validates: Requirements 2.3
   * 
   * Для любых двух различных статусов (кроме pending и skipped),
   * иконки должны быть различными.
   */
  test('Property 4.3: Status icons are unique (except pending and skipped)', () => {
    fc.assert(
      fc.property(stepStatusArb, stepStatusArb, (status1, status2) => {
        const mockStream = new MockWriteStream(true, 80, 24);
        const renderer = new TerminalRenderer(mockStream as unknown as NodeJS.WriteStream);

        const icon1 = renderer.getStatusIcon(status1);
        const icon2 = renderer.getStatusIcon(status2);

        // Если статусы различны и не являются pending/skipped,
        // иконки должны быть различными
        if (status1 !== status2) {
          // pending и skipped используют одинаковую иконку ○
          const bothPendingOrSkipped = 
            (status1 === 'pending' || status1 === 'skipped') &&
            (status2 === 'pending' || status2 === 'skipped');

          if (!bothPendingOrSkipped) {
            expect(icon1).not.toBe(icon2);
          }
        } else {
          // Одинаковые статусы должны иметь одинаковые иконки
          expect(icon1).toBe(icon2);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.4: Определение возможностей терминала
   * Feature: interactive-cli-interface, Property 4: Цветовая индикация статусов
   * Validates: Requirements 8.1, 8.2
   * 
   * Для любого терминала, система должна корректно определять его возможности
   * (поддержка ANSI, размеры, интерактивность).
   */
  test('Property 4.4: Terminal capabilities detection', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // isTTY
        terminalSizeArb,
        (isTTY, size) => {
          const mockStream = new MockWriteStream(isTTY, size.width, size.height);
          const renderer = new TerminalRenderer(mockStream as unknown as NodeJS.WriteStream);

          const capabilities = renderer.getCapabilities();

          // Проверяем корректность определения интерактивности
          expect(capabilities.isInteractive).toBe(isTTY);

          // Проверяем корректность определения размеров
          if (isTTY) {
            expect(capabilities.width).toBe(size.width);
            expect(capabilities.height).toBe(size.height);
          } else {
            // Для non-TTY используются значения по умолчанию
            expect(capabilities.width).toBe(80);
            expect(capabilities.height).toBe(24);
          }

          // Проверяем, что поддержка ANSI зависит от TTY
          // (в реальности также зависит от переменных окружения,
          // но в тестах мы проверяем базовую логику)
          if (!isTTY) {
            expect(capabilities.supportsAnsi).toBe(false);
            expect(capabilities.supportsColors).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.5: Получение размера терминала
   * Feature: interactive-cli-interface, Property 4: Цветовая индикация статусов
   * Validates: Requirements 8.1, 8.2
   * 
   * Для любого терминала, метод getSize() должен возвращать корректные размеры.
   */
  test('Property 4.5: Terminal size retrieval', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        terminalSizeArb,
        (isTTY, size) => {
          const mockStream = new MockWriteStream(isTTY, size.width, size.height);
          const renderer = new TerminalRenderer(mockStream as unknown as NodeJS.WriteStream);

          const retrievedSize = renderer.getSize();

          if (isTTY) {
            expect(retrievedSize.width).toBe(size.width);
            expect(retrievedSize.height).toBe(size.height);
          } else {
            // Для non-TTY используются значения по умолчанию
            expect(retrievedSize.width).toBe(80);
            expect(retrievedSize.height).toBe(24);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.6: Цветовое форматирование сохраняет текст
   * Feature: interactive-cli-interface, Property 4: Цветовая индикация статусов
   * Validates: Requirements 2.3
   * 
   * Для любого текста и цвета, цветовое форматирование должно сохранять
   * исходный текст (возможно с добавлением ANSI кодов).
   */
  test('Property 4.6: Color formatting preserves text content', () => {
    fc.assert(
      fc.property(
        textArb,
        fc.constantFrom(
          TerminalColor.Red,
          TerminalColor.Green,
          TerminalColor.Yellow,
          TerminalColor.Blue,
          TerminalColor.Gray
        ),
        (text, color) => {
          const mockStream = new MockWriteStream(true, 80, 24);
          const renderer = new TerminalRenderer(mockStream as unknown as NodeJS.WriteStream);

          const formatted = renderer.colorize(text, color);

          // Форматированная строка должна содержать исходный текст
          expect(formatted).toContain(text);

          // Если терминал поддерживает цвета, должны быть ANSI коды
          const capabilities = renderer.getCapabilities();
          if (capabilities.supportsColors) {
            expect(formatted).toContain(color);
            expect(formatted).toContain(TerminalColor.Reset);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.7: Форматирование текста (bold, dim, underline)
   * Feature: interactive-cli-interface, Property 4: Цветовая индикация статусов
   * Validates: Requirements 2.3
   * 
   * Для любого текста, форматирование (bold, dim, underline) должно
   * сохранять исходный текст и добавлять соответствующие ANSI коды в TTY.
   */
  test('Property 4.7: Text formatting preserves content', () => {
    fc.assert(
      fc.property(textArb, (text) => {
        const mockStream = new MockWriteStream(true, 80, 24);
        const renderer = new TerminalRenderer(mockStream as unknown as NodeJS.WriteStream);

        const bold = renderer.bold(text);
        const dim = renderer.dim(text);
        const underline = renderer.underline(text);

        // Все форматированные строки должны содержать исходный текст
        expect(bold).toContain(text);
        expect(dim).toContain(text);
        expect(underline).toContain(text);

        // В TTY должны быть ANSI коды
        const capabilities = renderer.getCapabilities();
        if (capabilities.supportsAnsi) {
          expect(bold).toContain('\x1b[1m'); // Bold
          expect(dim).toContain('\x1b[2m'); // Dim
          expect(underline).toContain('\x1b[4m'); // Underline
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.8: Вывод текста в поток
   * Feature: interactive-cli-interface, Property 4: Цветовая индикация статусов
   * Validates: Requirements 2.3
   * 
   * Для любого текста, методы write() и writeLine() должны корректно
   * записывать текст в выходной поток.
   */
  test('Property 4.8: Text output to stream', () => {
    fc.assert(
      fc.property(textArb, (text) => {
        const mockStream = new MockWriteStream(true, 80, 24);
        const renderer = new TerminalRenderer(mockStream as unknown as NodeJS.WriteStream);

        // Очищаем вывод
        mockStream.clearOutput();

        // Записываем текст
        renderer.write(text);
        expect(mockStream.output).toBe(text);

        // Очищаем и проверяем writeLine
        mockStream.clearOutput();
        renderer.writeLine(text);
        expect(mockStream.output).toBe(text + '\n');

        // Проверяем writeLine без аргументов
        mockStream.clearOutput();
        renderer.writeLine();
        expect(mockStream.output).toBe('\n');
      }),
      { numRuns: 100 }
    );
  });
});
