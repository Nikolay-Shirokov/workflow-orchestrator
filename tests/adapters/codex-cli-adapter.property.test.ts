/**
 * Property-based тесты для Codex CLI адаптера
 * Проверяют универсальные свойства корректности адаптера
 */

import * as fc from 'fast-check';
import { CodexCLIAdapter, CodexAdapterRequest } from '../../src/adapters/codex-cli-adapter.js';
import { AdapterRequest } from '../../src/core/types.js';

/**
 * Тестовый класс для доступа к защищенным методам
 */
class TestableCodexCLIAdapter extends CodexCLIAdapter {
  public testPrepareArguments(request: AdapterRequest): string[] {
    return this.prepareArguments(request);
  }
}

describe('Codex CLI Adapter Property Tests', () => {
  /**
   * Feature: codex-cli-adapter, Property 1: Передача промпта в аргументах
   * Validates: Requirements 1.3, 1.4
   * 
   * Для любого запроса с промптом, подготовленные аргументы команды должны 
   * содержать промпт или флаг '-' для чтения из stdin.
   */
  describe('Property 1: Передача промпта в аргументах', () => {
    test('должен всегда включать флаг "-" для чтения промпта из stdin', () => {
      fc.assert(
        fc.property(
          // Генерируем случайные промпты
          fc.string({ minLength: 1, maxLength: 500 }),
          (prompt) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: AdapterRequest = { prompt };
            
            const args = adapter.testPrepareArguments(request);
            
            // Аргументы должны начинаться с 'exec'
            expect(args[0]).toBe('exec');
            
            // Аргументы должны содержать флаг '-' для чтения из stdin
            expect(args).toContain('-');
          }
        ),
        { numRuns: 100 } // Минимум 100 итераций согласно спецификации
      );
    });

    test('должен формировать корректную структуру аргументов для любого промпта', () => {
      fc.assert(
        fc.property(
          // Генерируем различные типы промптов
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }), // Обычная строка
            fc.stringMatching(/.*\n.*/), // Многострочная строка
            fc.stringMatching(/.*['"\\].*/), // Строка со спецсимволами
            fc.unicodeString({ minLength: 1, maxLength: 100 }) // Unicode строка
          ),
          (prompt) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: AdapterRequest = { prompt };
            
            const args = adapter.testPrepareArguments(request);
            
            // Базовая структура: ['exec', '-']
            expect(args.length).toBeGreaterThanOrEqual(2);
            expect(args[0]).toBe('exec');
            expect(args[args.length - 1]).toBe('-');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен обрабатывать пустые и специальные промпты', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''), // Пустая строка
            fc.constant(' '), // Пробел
            fc.constant('\n'), // Перевод строки
            fc.constant('\t'), // Табуляция
            fc.constant('   \n\t   ') // Смесь пробельных символов
          ),
          (prompt) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: AdapterRequest = { prompt };
            
            const args = adapter.testPrepareArguments(request);
            
            // Даже для пустых промптов структура должна быть корректной
            expect(args[0]).toBe('exec');
            expect(args).toContain('-');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: codex-cli-adapter, Property 2: Добавление флага модели
   * Validates: Requirements 2.1
   * 
   * Для любого запроса с указанной моделью, подготовленные аргументы должны 
   * содержать флаг '-m' или '--model' с именем модели.
   */
  describe('Property 2: Добавление флага модели', () => {
    test('должен добавлять флаг -m с именем модели для любой указанной модели', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.string({ minLength: 1, maxLength: 50 }), // Имя модели
          (prompt, model) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: AdapterRequest = { prompt, model };
            
            const args = adapter.testPrepareArguments(request);
            
            // Аргументы должны содержать флаг -m
            expect(args).toContain('-m');
            
            // После флага -m должно идти имя модели
            const modelFlagIndex = args.indexOf('-m');
            expect(modelFlagIndex).toBeGreaterThanOrEqual(0);
            expect(args[modelFlagIndex + 1]).toBe(model);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('не должен добавлять флаг -m если модель не указана', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          (prompt) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: AdapterRequest = { prompt };
            
            const args = adapter.testPrepareArguments(request);
            
            // Аргументы не должны содержать флаг -m
            expect(args).not.toContain('-m');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать различные форматы имен моделей', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.oneof(
            fc.constant('gpt-4'), // Стандартное имя
            fc.constant('gpt-3.5-turbo'), // С точкой
            fc.constant('gpt-4-turbo-preview'), // Длинное имя
            fc.constant('o1-preview'), // Короткое имя
            fc.stringMatching(/^[a-z0-9-]+$/) // Произвольное валидное имя
          ),
          (prompt, model) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: AdapterRequest = { prompt, model };
            
            const args = adapter.testPrepareArguments(request);
            
            // Флаг -m должен быть перед флагом -
            const modelFlagIndex = args.indexOf('-m');
            const stdinFlagIndex = args.indexOf('-');
            expect(modelFlagIndex).toBeLessThan(stdinFlagIndex);
            
            // Имя модели должно быть сохранено без изменений
            expect(args[modelFlagIndex + 1]).toBe(model);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: codex-cli-adapter, Property 3: Добавление флагов конфигурации
   * Validates: Requirements 3.2, 3.4, 8.3, 8.5
   * 
   * Для любого запроса с дополнительными опциями (sandbox, workingDirectory, 
   * profile, colorMode), подготовленные аргументы должны содержать 
   * соответствующие флаги с правильными значениями.
   */
  describe('Property 3: Добавление флагов конфигурации', () => {
    test('должен добавлять флаг --full-auto когда указан fullAuto', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.boolean(), // fullAuto
          (prompt, fullAuto) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, fullAuto };
            
            const args = adapter.testPrepareArguments(request);
            
            if (fullAuto) {
              expect(args).toContain('--full-auto');
            } else {
              expect(args).not.toContain('--full-auto');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять флаг --sandbox с правильным значением', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.oneof(
            fc.constant('read-only' as const),
            fc.constant('workspace-write' as const),
            fc.constant('danger-full-access' as const)
          ),
          (prompt, sandbox) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, sandbox };
            
            const args = adapter.testPrepareArguments(request);
            
            expect(args).toContain('--sandbox');
            const sandboxIndex = args.indexOf('--sandbox');
            expect(args[sandboxIndex + 1]).toBe(sandbox);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять флаг --cd с рабочей директорией', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.string({ minLength: 1, maxLength: 100 }), // Рабочая директория
          (prompt, workingDirectory) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, workingDirectory };
            
            const args = adapter.testPrepareArguments(request);
            
            expect(args).toContain('--cd');
            const cdIndex = args.indexOf('--cd');
            expect(args[cdIndex + 1]).toBe(workingDirectory);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять флаг -p с профилем', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.string({ minLength: 1, maxLength: 50 }), // Профиль
          (prompt, profile) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, profile };
            
            const args = adapter.testPrepareArguments(request);
            
            expect(args).toContain('-p');
            const profileIndex = args.indexOf('-p');
            expect(args[profileIndex + 1]).toBe(profile);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять флаг --color с режимом цвета', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.oneof(
            fc.constant('always' as const),
            fc.constant('never' as const),
            fc.constant('auto' as const)
          ),
          (prompt, colorMode) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, colorMode };
            
            const args = adapter.testPrepareArguments(request);
            
            expect(args).toContain('--color');
            const colorIndex = args.indexOf('--color');
            expect(args[colorIndex + 1]).toBe(colorMode);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять флаг --search когда указан enableSearch', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.boolean(), // enableSearch
          (prompt, enableSearch) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, enableSearch };
            
            const args = adapter.testPrepareArguments(request);
            
            if (enableSearch) {
              expect(args).toContain('--search');
            } else {
              expect(args).not.toContain('--search');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять флаг --json когда указан jsonOutput', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.boolean(), // jsonOutput
          (prompt, jsonOutput) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, jsonOutput };
            
            const args = adapter.testPrepareArguments(request);
            
            if (jsonOutput) {
              expect(args).toContain('--json');
            } else {
              expect(args).not.toContain('--json');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять флаг --output-last-message с файлом вывода', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.string({ minLength: 1, maxLength: 100 }), // Файл вывода
          (prompt, outputFile) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, outputFile };
            
            const args = adapter.testPrepareArguments(request);
            
            expect(args).toContain('--output-last-message');
            const outputIndex = args.indexOf('--output-last-message');
            expect(args[outputIndex + 1]).toBe(outputFile);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно комбинировать множественные флаги', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.record({
            model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            fullAuto: fc.option(fc.boolean(), { nil: undefined }),
            sandbox: fc.option(
              fc.oneof(
                fc.constant('read-only' as const),
                fc.constant('workspace-write' as const),
                fc.constant('danger-full-access' as const)
              ),
              { nil: undefined }
            ),
            workingDirectory: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
            profile: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            colorMode: fc.option(
              fc.oneof(
                fc.constant('always' as const),
                fc.constant('never' as const),
                fc.constant('auto' as const)
              ),
              { nil: undefined }
            ),
            enableSearch: fc.option(fc.boolean(), { nil: undefined }),
            jsonOutput: fc.option(fc.boolean(), { nil: undefined })
          }),
          (prompt, options) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, ...options };
            
            const args = adapter.testPrepareArguments(request);
            
            // Проверяем, что все указанные опции присутствуют
            if (options.model) {
              expect(args).toContain('-m');
              const modelIndex = args.indexOf('-m');
              expect(args[modelIndex + 1]).toBe(options.model);
            }
            
            if (options.fullAuto) {
              expect(args).toContain('--full-auto');
            }
            
            if (options.sandbox) {
              expect(args).toContain('--sandbox');
              const sandboxIndex = args.indexOf('--sandbox');
              expect(args[sandboxIndex + 1]).toBe(options.sandbox);
            }
            
            if (options.workingDirectory) {
              expect(args).toContain('--cd');
              const cdIndex = args.indexOf('--cd');
              expect(args[cdIndex + 1]).toBe(options.workingDirectory);
            }
            
            if (options.profile) {
              expect(args).toContain('-p');
              const profileIndex = args.indexOf('-p');
              expect(args[profileIndex + 1]).toBe(options.profile);
            }
            
            if (options.colorMode) {
              expect(args).toContain('--color');
              const colorIndex = args.indexOf('--color');
              expect(args[colorIndex + 1]).toBe(options.colorMode);
            }
            
            if (options.enableSearch) {
              expect(args).toContain('--search');
            }
            
            if (options.jsonOutput) {
              expect(args).toContain('--json');
            }
            
            // Флаг '-' всегда должен быть последним
            expect(args[args.length - 1]).toBe('-');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: codex-cli-adapter, Property 10: Добавление конфигурационных переопределений
   * Validates: Requirements 8.4
   * 
   * Для любого набора конфигурационных переопределений, подготовленные аргументы 
   * должны содержать флаги '-c' с парами ключ=значение для каждого переопределения.
   */
  describe('Property 10: Добавление конфигурационных переопределений', () => {
    test('должен добавлять флаги -c для каждого конфигурационного переопределения', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.dictionary(
            fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/), // Ключ конфигурации
            fc.string({ minLength: 1, maxLength: 50 }) // Значение конфигурации
          ),
          (prompt, configOverrides) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, configOverrides };
            
            const args = adapter.testPrepareArguments(request);
            
            // Для каждого переопределения должен быть флаг -c
            const configEntries = Object.entries(configOverrides);
            
            if (configEntries.length > 0) {
              // Подсчитываем количество флагов -c
              const cFlagCount = args.filter(arg => arg === '-c').length;
              expect(cFlagCount).toBe(configEntries.length);
              
              // Проверяем, что каждое переопределение присутствует
              for (const [key, value] of configEntries) {
                const expectedArg = `${key}=${value}`;
                expect(args).toContain(expectedArg);
                
                // Проверяем, что перед значением идет флаг -c
                const argIndex = args.indexOf(expectedArg);
                expect(args[argIndex - 1]).toBe('-c');
              }
            } else {
              // Если переопределений нет, флага -c не должно быть
              expect(args).not.toContain('-c');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно форматировать пары ключ=значение', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/), // Ключ
          fc.string({ minLength: 1, maxLength: 50 }), // Значение
          (prompt, key, value) => {
            const adapter = new TestableCodexCLIAdapter();
            const configOverrides = { [key]: value };
            const request: CodexAdapterRequest = { prompt, configOverrides };
            
            const args = adapter.testPrepareArguments(request);
            
            // Должна быть пара ключ=значение
            const expectedArg = `${key}=${value}`;
            expect(args).toContain(expectedArg);
            
            // Формат должен быть точным (без пробелов вокруг =)
            const argIndex = args.indexOf(expectedArg);
            expect(args[argIndex]).toBe(`${key}=${value}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен обрабатывать специальные символы в значениях', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/), // Ключ
          fc.oneof(
            fc.constant('value with spaces'),
            fc.constant('value/with/slashes'),
            fc.constant('value-with-dashes'),
            fc.constant('value.with.dots'),
            fc.constant('123456')
          ),
          (prompt, key, value) => {
            const adapter = new TestableCodexCLIAdapter();
            const configOverrides = { [key]: value };
            const request: CodexAdapterRequest = { prompt, configOverrides };
            
            const args = adapter.testPrepareArguments(request);
            
            // Значение должно быть сохранено без изменений
            const expectedArg = `${key}=${value}`;
            expect(args).toContain(expectedArg);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять конфигурационные переопределения перед флагом -', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.dictionary(
            fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
            fc.string({ minLength: 1, maxLength: 50 }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (prompt, configOverrides) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, configOverrides };
            
            const args = adapter.testPrepareArguments(request);
            
            // Флаг '-' должен быть последним
            expect(args[args.length - 1]).toBe('-');
            
            // Все флаги -c должны быть перед флагом -
            const stdinFlagIndex = args.indexOf('-');
            const cFlagIndices = args
              .map((arg, index) => arg === '-c' ? index : -1)
              .filter(index => index !== -1);
            
            for (const cIndex of cFlagIndices) {
              expect(cIndex).toBeLessThan(stdinFlagIndex);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно комбинировать конфигурационные переопределения с другими флагами', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.record({
            model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            fullAuto: fc.option(fc.boolean(), { nil: undefined }),
            configOverrides: fc.option(
              fc.dictionary(
                fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
                fc.string({ minLength: 1, maxLength: 50 }),
                { minKeys: 1, maxKeys: 3 }
              ),
              { nil: undefined }
            )
          }),
          (prompt, options) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, ...options };
            
            const args = adapter.testPrepareArguments(request);
            
            // Проверяем наличие всех указанных опций
            if (options.model) {
              expect(args).toContain('-m');
            }
            
            if (options.fullAuto) {
              expect(args).toContain('--full-auto');
            }
            
            if (options.configOverrides) {
              const configEntries = Object.entries(options.configOverrides);
              for (const [key, value] of configEntries) {
                expect(args).toContain(`${key}=${value}`);
              }
            }
            
            // Флаг '-' всегда последний
            expect(args[args.length - 1]).toBe('-');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
