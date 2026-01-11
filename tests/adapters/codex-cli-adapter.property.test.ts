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
  
  public testParseResponse(rawOutput: string): string {
    return this.parseResponse(rawOutput);
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

  /**
   * Feature: codex-cli-adapter, Property 4: Парсинг JSON-вывода
   * Validates: Requirements 4.2
   * 
   * Для любого корректного JSONL-вывода, содержащего события типа `message` 
   * с ролью `assistant`, парсер должен извлечь контент последнего сообщения ассистента.
   */
  describe('Property 4: Парсинг JSON-вывода', () => {
    test('должен извлекать контент последнего сообщения ассистента из JSONL', () => {
      fc.assert(
        fc.property(
          // Генерируем массив сообщений ассистента
          fc.array(
            fc.string({ minLength: 1, maxLength: 200 }),
            { minLength: 1, maxLength: 10 }
          ),
          (messages) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Формируем JSONL-вывод с событиями
            const jsonlLines = messages.map(content => 
              JSON.stringify({
                type: 'message',
                role: 'assistant',
                content
              })
            );
            
            const rawOutput = jsonlLines.join('\n');
            const result = adapter.testParseResponse(rawOutput);
            
            // Должен вернуть последнее сообщение
            expect(result).toBe(messages[messages.length - 1]);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен игнорировать события других типов и извлекать только сообщения ассистента', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Сообщение ассистента
          fc.array(
            fc.record({
              type: fc.constantFrom('status', 'tool_use', 'error'),
              message: fc.string({ minLength: 1, maxLength: 100 })
            }),
            { minLength: 0, maxLength: 5 }
          ),
          (assistantMessage, otherEvents) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Формируем JSONL с разными типами событий
            const lines: string[] = [];
            
            // Добавляем другие события
            for (const event of otherEvents) {
              lines.push(JSON.stringify(event));
            }
            
            // Добавляем сообщение ассистента
            lines.push(JSON.stringify({
              type: 'message',
              role: 'assistant',
              content: assistantMessage
            }));
            
            // Добавляем еще несколько других событий после
            for (const event of otherEvents.slice(0, 2)) {
              lines.push(JSON.stringify(event));
            }
            
            const rawOutput = lines.join('\n');
            const result = adapter.testParseResponse(rawOutput);
            
            // Должен вернуть сообщение ассистента, игнорируя остальные события
            expect(result).toBe(assistantMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен игнорировать сообщения пользователя и извлекать только сообщения ассистента', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Сообщение ассистента
          fc.array(
            fc.string({ minLength: 1, maxLength: 100 }),
            { minLength: 0, maxLength: 5 }
          ), // Сообщения пользователя
          (assistantMessage, userMessages) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const lines: string[] = [];
            
            // Добавляем сообщения пользователя
            for (const userMsg of userMessages) {
              lines.push(JSON.stringify({
                type: 'message',
                role: 'user',
                content: userMsg
              }));
            }
            
            // Добавляем сообщение ассистента
            lines.push(JSON.stringify({
              type: 'message',
              role: 'assistant',
              content: assistantMessage
            }));
            
            const rawOutput = lines.join('\n');
            const result = adapter.testParseResponse(rawOutput);
            
            // Должен вернуть только сообщение ассистента
            expect(result).toBe(assistantMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать множественные сообщения ассистента и возвращать последнее', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1, maxLength: 200 }),
            { minLength: 2, maxLength: 10 }
          ),
          (messages) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Формируем JSONL с несколькими сообщениями ассистента
            const lines = messages.map(content =>
              JSON.stringify({
                type: 'message',
                role: 'assistant',
                content
              })
            );
            
            const rawOutput = lines.join('\n');
            const result = adapter.testParseResponse(rawOutput);
            
            // Должен вернуть именно последнее сообщение
            expect(result).toBe(messages[messages.length - 1]);
            
            // Не должен вернуть первое сообщение, если оно отличается от последнего
            if (messages.length > 1 && messages[0] !== messages[messages.length - 1]) {
              expect(result).not.toBe(messages[0]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать JSONL с пустыми строками', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.integer({ min: 0, max: 5 }), // Количество пустых строк до
          fc.integer({ min: 0, max: 5 }), // Количество пустых строк после
          (message, emptyBefore, emptyAfter) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const lines: string[] = [];
            
            // Добавляем пустые строки до
            for (let i = 0; i < emptyBefore; i++) {
              lines.push('');
            }
            
            // Добавляем сообщение
            lines.push(JSON.stringify({
              type: 'message',
              role: 'assistant',
              content: message
            }));
            
            // Добавляем пустые строки после
            for (let i = 0; i < emptyAfter; i++) {
              lines.push('');
            }
            
            const rawOutput = lines.join('\n');
            const result = adapter.testParseResponse(rawOutput);
            
            // Должен корректно извлечь сообщение, игнорируя пустые строки
            expect(result).toBe(message);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать специальные символы в контенте', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 200 }), // Обычная строка
            fc.stringMatching(/.*\n.*/), // Многострочная строка
            fc.stringMatching(/.*['"\\].*/), // Строка со спецсимволами
            fc.unicodeString({ minLength: 1, maxLength: 200 }), // Unicode строка
            fc.constant('{"nested": "json"}'), // JSON внутри строки
            fc.constant('Line 1\nLine 2\nLine 3') // Явно многострочная
          ),
          (content) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const jsonlLine = JSON.stringify({
              type: 'message',
              role: 'assistant',
              content
            });
            
            const result = adapter.testParseResponse(jsonlLine);
            
            // Контент должен быть сохранен без изменений
            expect(result).toBe(content);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать смешанный JSONL с валидными и невалидными строками', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Сообщение ассистента
          fc.array(
            fc.string({ minLength: 1, maxLength: 50 }),
            { minLength: 0, maxLength: 3 }
          ), // Невалидные JSON строки
          (message, invalidLines) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const lines: string[] = [];
            
            // Добавляем невалидные строки
            for (const invalid of invalidLines) {
              lines.push(invalid);
            }
            
            // Добавляем валидное сообщение
            lines.push(JSON.stringify({
              type: 'message',
              role: 'assistant',
              content: message
            }));
            
            // Добавляем еще невалидные строки
            for (const invalid of invalidLines.slice(0, 1)) {
              lines.push(invalid);
            }
            
            const rawOutput = lines.join('\n');
            const result = adapter.testParseResponse(rawOutput);
            
            // Должен извлечь валидное сообщение, игнорируя невалидные строки
            expect(result).toBe(message);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: codex-cli-adapter, Property 5: Парсинг текстового вывода
   * Validates: Requirements 4.3, 4.5
   * 
   * Для любого текстового вывода, содержащего ответ ассистента, парсер должен 
   * извлечь чистый текст ответа без служебной информации и ANSI-кодов.
   */
  describe('Property 5: Парсинг текстового вывода', () => {
    test('должен удалять ANSI escape-коды из текста', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 200 }).filter(s => s.trim().length > 0),
          fc.constantFrom(
            '\x1b[0m',    // Reset
            '\x1b[1m',    // Bold
            '\x1b[31m',   // Red
            '\x1b[32m',   // Green
            '\x1b[33m',   // Yellow
            '\x1b[34m',   // Blue
            '\x1b[35m',   // Magenta
            '\x1b[36m',   // Cyan
            '\x1b[37m'    // White
          ),
          (message, ansiCode) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Добавляем ANSI-код в начало и конец
            const textWithAnsi = `${ansiCode}${message}${ansiCode}`;
            
            const result = adapter.testParseResponse(textWithAnsi);
            
            // Результат не должен содержать ANSI-коды
            expect(result).not.toMatch(/\x1b\[[0-9;]*m/);
            
            // Результат должен содержать оригинальный текст
            expect(result).toContain(message.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен извлекать текст после маркера "Assistant response:"', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Текст до
          fc.string({ minLength: 1, maxLength: 200 }), // Ответ ассистента
          (textBefore, assistantResponse) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const rawOutput = `${textBefore}\n\nAssistant response:\n${assistantResponse}`;
            const result = adapter.testParseResponse(rawOutput);
            
            // Результат должен содержать ответ ассистента
            expect(result).toContain(assistantResponse.trim());
            
            // Результат не должен содержать текст до маркера
            // (если только он не повторяется в ответе)
            if (!assistantResponse.includes(textBefore)) {
              expect(result).not.toContain(textBefore);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен извлекать текст после маркера "Assistant:"', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Текст до
          fc.string({ minLength: 1, maxLength: 200 }), // Ответ ассистента
          (textBefore, assistantResponse) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const rawOutput = `${textBefore}\n\nAssistant:\n${assistantResponse}`;
            const result = adapter.testParseResponse(rawOutput);
            
            // Результат должен содержать ответ ассистента
            expect(result).toContain(assistantResponse.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен использовать последний маркер если их несколько', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Первый ответ
          fc.string({ minLength: 1, maxLength: 100 }), // Второй ответ
          fc.string({ minLength: 1, maxLength: 100 }), // Третий ответ
          (response1, response2, response3) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const rawOutput = `
              Assistant: ${response1}
              
              Some other text
              
              Assistant response: ${response2}
              
              More text
              
              Response: ${response3}
            `;
            
            const result = adapter.testParseResponse(rawOutput);
            
            // Должен вернуть текст после последнего маркера
            expect(result).toContain(response3.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен удалять служебные префиксы вида [Tool: ...]', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Ответ ассистента
          fc.array(
            fc.record({
              tool: fc.constantFrom('bash', 'python', 'node', 'git'),
              command: fc.string({ minLength: 1, maxLength: 50 })
            }),
            { minLength: 0, maxLength: 3 }
          ),
          (assistantResponse, toolCalls) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Формируем вывод с служебными префиксами
            let rawOutput = '';
            for (const call of toolCalls) {
              rawOutput += `[Tool: ${call.tool}] ${call.command}\n`;
            }
            rawOutput += `\nAssistant response:\n${assistantResponse}`;
            
            const result = adapter.testParseResponse(rawOutput);
            
            // Результат не должен содержать служебные префиксы
            expect(result).not.toMatch(/^\[Tool:.*?\].*$/m);
            
            // Результат должен содержать ответ ассистента
            expect(result).toContain(assistantResponse.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен удалять служебные префиксы вида [Status: ...]', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Ответ ассистента
          fc.array(
            fc.string({ minLength: 1, maxLength: 50 }),
            { minLength: 0, maxLength: 3 }
          ), // Статусные сообщения
          (assistantResponse, statusMessages) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Формируем вывод со статусными сообщениями
            let rawOutput = '';
            for (const status of statusMessages) {
              rawOutput += `[Status: ${status}]\n`;
            }
            rawOutput += `\nAssistant response:\n${assistantResponse}`;
            
            const result = adapter.testParseResponse(rawOutput);
            
            // Результат не должен содержать статусные префиксы
            expect(result).not.toMatch(/^\[Status:.*?\].*$/m);
            
            // Результат должен содержать ответ ассистента
            expect(result).toContain(assistantResponse.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен удалять избыточные пустые строки', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 200 }).filter(s => s.trim().length > 0 && !s.trim().startsWith('[')),
          fc.integer({ min: 3, max: 10 }), // Количество пустых строк
          (message, emptyLines) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Создаем текст с множественными пустыми строками
            const emptyBlock = '\n'.repeat(emptyLines);
            const rawOutput = `Assistant response:${emptyBlock}${message}${emptyBlock}`;
            
            const result = adapter.testParseResponse(rawOutput);
            
            // Результат не должен содержать более двух последовательных переводов строк
            expect(result).not.toMatch(/\n{3,}/);
            
            // Результат должен содержать сообщение
            expect(result).toContain(message.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать многострочный текст', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 3, maxLength: 100 }).filter(s => s.trim().length > 0 && !s.trim().startsWith('[')),
            { minLength: 2, maxLength: 10 }
          ),
          (lines) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const multilineMessage = lines.join('\n');
            const rawOutput = `Assistant response:\n${multilineMessage}`;
            
            const result = adapter.testParseResponse(rawOutput);
            
            // Результат должен содержать все строки
            for (const line of lines) {
              if (line.trim()) {
                expect(result).toContain(line.trim());
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать комбинацию ANSI-кодов и служебных префиксов', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (message) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Создаем сложный вывод с ANSI-кодами и служебными префиксами
            const rawOutput = `
              \x1b[32m[Tool: bash]\x1b[0m ls -la
              \x1b[33m[Status: Running...]\x1b[0m
              
              \x1b[1mAssistant response:\x1b[0m
              \x1b[36m${message}\x1b[0m
            `;
            
            const result = adapter.testParseResponse(rawOutput);
            
            // Результат не должен содержать ANSI-коды
            expect(result).not.toMatch(/\x1b\[[0-9;]*m/);
            
            // Результат не должен содержать служебные префиксы
            expect(result).not.toMatch(/^\[Tool:.*?\].*$/m);
            expect(result).not.toMatch(/^\[Status:.*?\].*$/m);
            
            // Результат должен содержать чистое сообщение
            expect(result).toContain(message.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен возвращать весь текст если маркеры не найдены', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (message) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Текст без маркеров
            const rawOutput = message;
            
            const result = adapter.testParseResponse(rawOutput);
            
            // Результат должен содержать оригинальный текст (очищенный)
            expect(result.trim()).toBeTruthy();
            
            // Если в оригинале нет служебной информации, результат должен быть близок к оригиналу
            if (!message.match(/\[.*?\]/) && !message.match(/\x1b\[[0-9;]*m/)) {
              expect(result.trim()).toBe(message.trim());
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: codex-cli-adapter, Property 6: Возобновление сессии с ID
   * Validates: Requirements 5.2
   * 
   * Для любого запроса с указанным ID сессии, подготовленные аргументы должны 
   * содержать команду `resume` и ID сессии.
   */
  describe('Property 6: Возобновление сессии с ID', () => {
    test('должен формировать команду resume с ID сессии', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.uuid(), // ID сессии (UUID)
          (prompt, sessionId) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { 
              prompt, 
              resumeSession: sessionId 
            };
            
            const args = adapter.testPrepareArguments(request);
            
            // Аргументы должны начинаться с 'exec'
            expect(args[0]).toBe('exec');
            
            // Аргументы должны содержать команду 'resume'
            expect(args[1]).toBe('resume');
            
            // Аргументы должны содержать ID сессии
            expect(args[2]).toBe(sessionId);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать различные форматы ID сессий', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.oneof(
            fc.uuid(), // UUID формат
            fc.stringMatching(/^[a-zA-Z0-9-_]+$/), // Буквенно-цифровой ID
            fc.stringMatching(/^[0-9]+$/), // Числовой ID
            fc.string({ minLength: 8, maxLength: 64 }) // Произвольный ID
          ),
          (prompt, sessionId) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { 
              prompt, 
              resumeSession: sessionId 
            };
            
            const args = adapter.testPrepareArguments(request);
            
            // Команда resume должна быть на второй позиции
            expect(args[1]).toBe('resume');
            
            // ID сессии должен быть сохранен без изменений
            expect(args[2]).toBe(sessionId);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять флаг - для промпта после ID сессии', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.uuid(), // ID сессии
          (prompt, sessionId) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { 
              prompt, 
              resumeSession: sessionId 
            };
            
            const args = adapter.testPrepareArguments(request);
            
            // Флаг '-' должен быть в конце для чтения промпта из stdin
            expect(args[args.length - 1]).toBe('-');
            
            // Структура: ['exec', 'resume', sessionId, ..., '-']
            expect(args.length).toBeGreaterThanOrEqual(4);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен комбинировать resume с другими флагами', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          fc.uuid(), // ID сессии
          fc.record({
            model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            fullAuto: fc.option(fc.boolean(), { nil: undefined }),
            jsonOutput: fc.option(fc.boolean(), { nil: undefined })
          }),
          (prompt, sessionId, options) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { 
              prompt, 
              resumeSession: sessionId,
              ...options
            };
            
            const args = adapter.testPrepareArguments(request);
            
            // Команда resume должна быть на второй позиции
            expect(args[1]).toBe('resume');
            expect(args[2]).toBe(sessionId);
            
            // Проверяем наличие других флагов
            if (options.model) {
              expect(args).toContain('-m');
              const modelIndex = args.indexOf('-m');
              expect(args[modelIndex + 1]).toBe(options.model);
            }
            
            if (options.fullAuto) {
              expect(args).toContain('--full-auto');
            }
            
            if (options.jsonOutput) {
              expect(args).toContain('--json');
            }
            
            // Флаг '-' всегда последний
            expect(args[args.length - 1]).toBe('-');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('не должен добавлять resume если resumeSession не указан', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          (prompt) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt };
            
            const args = adapter.testPrepareArguments(request);
            
            // Команда resume не должна присутствовать
            expect(args).not.toContain('resume');
            
            // Должна быть только базовая команда exec
            expect(args[0]).toBe('exec');
            expect(args[1]).not.toBe('resume');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: codex-cli-adapter, Property 7: Передача промпта при возобновлении
   * Validates: Requirements 5.4
   * 
   * Для любого запроса на возобновление сессии с дополнительным промптом, 
   * промпт должен быть передан в аргументах команды.
   */
  describe('Property 7: Передача промпта при возобновлении', () => {
    test('должен передавать промпт через stdin при возобновлении с ID', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Промпт
          fc.uuid(), // ID сессии
          (prompt, sessionId) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { 
              prompt, 
              resumeSession: sessionId 
            };
            
            const args = adapter.testPrepareArguments(request);
            
            // Структура: ['exec', 'resume', sessionId, ..., '-']
            expect(args[0]).toBe('exec');
            expect(args[1]).toBe('resume');
            expect(args[2]).toBe(sessionId);
            
            // Флаг '-' должен быть в конце для передачи промпта через stdin
            expect(args[args.length - 1]).toBe('-');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен передавать промпт через stdin при возобновлении последней сессии', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Промпт
          (prompt) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { 
              prompt, 
              resumeLast: true 
            };
            
            const args = adapter.testPrepareArguments(request);
            
            // Структура: ['exec', 'resume', '--last', ..., '-']
            expect(args[0]).toBe('exec');
            expect(args[1]).toBe('resume');
            expect(args).toContain('--last');
            
            // Флаг '-' должен быть в конце для передачи промпта через stdin
            expect(args[args.length - 1]).toBe('-');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать различные типы промптов при возобновлении', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }), // Обычная строка
            fc.stringMatching(/.*\n.*/), // Многострочная строка
            fc.stringMatching(/.*['"\\].*/), // Строка со спецсимволами
            fc.unicodeString({ minLength: 1, maxLength: 100 }) // Unicode строка
          ),
          fc.uuid(), // ID сессии
          (prompt, sessionId) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { 
              prompt, 
              resumeSession: sessionId 
            };
            
            const args = adapter.testPrepareArguments(request);
            
            // Команда resume должна быть на месте
            expect(args[1]).toBe('resume');
            expect(args[2]).toBe(sessionId);
            
            // Флаг '-' всегда в конце, независимо от типа промпта
            expect(args[args.length - 1]).toBe('-');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен комбинировать промпт с другими флагами при возобновлении', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Промпт
          fc.uuid(), // ID сессии
          fc.record({
            model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            fullAuto: fc.option(fc.boolean(), { nil: undefined }),
            jsonOutput: fc.option(fc.boolean(), { nil: undefined }),
            workingDirectory: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined })
          }),
          (prompt, sessionId, options) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { 
              prompt, 
              resumeSession: sessionId,
              ...options
            };
            
            const args = adapter.testPrepareArguments(request);
            
            // Команда resume должна быть на месте
            expect(args[1]).toBe('resume');
            expect(args[2]).toBe(sessionId);
            
            // Проверяем наличие других флагов
            if (options.model) {
              expect(args).toContain('-m');
            }
            
            if (options.fullAuto) {
              expect(args).toContain('--full-auto');
            }
            
            if (options.jsonOutput) {
              expect(args).toContain('--json');
            }
            
            if (options.workingDirectory) {
              expect(args).toContain('--cd');
            }
            
            // Флаг '-' всегда последний для передачи промпта
            expect(args[args.length - 1]).toBe('-');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен поддерживать возобновление с ID и флагом --last одновременно', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Промпт
          fc.uuid(), // ID сессии
          (prompt, sessionId) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { 
              prompt, 
              resumeSession: sessionId,
              resumeLast: true
            };
            
            const args = adapter.testPrepareArguments(request);
            
            // Команда resume должна быть на месте
            expect(args[1]).toBe('resume');
            
            // ID сессии должен быть указан
            expect(args[2]).toBe(sessionId);
            
            // Флаг --last также должен присутствовать
            expect(args).toContain('--last');
            
            // Флаг '-' всегда последний
            expect(args[args.length - 1]).toBe('-');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать пустые и специальные промпты при возобновлении', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''), // Пустая строка
            fc.constant(' '), // Пробел
            fc.constant('\n'), // Перевод строки
            fc.constant('\t'), // Табуляция
            fc.constant('   \n\t   ') // Смесь пробельных символов
          ),
          fc.uuid(), // ID сессии
          (prompt, sessionId) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { 
              prompt, 
              resumeSession: sessionId 
            };
            
            const args = adapter.testPrepareArguments(request);
            
            // Даже для пустых промптов структура должна быть корректной
            expect(args[1]).toBe('resume');
            expect(args[2]).toBe(sessionId);
            expect(args[args.length - 1]).toBe('-');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: codex-cli-adapter, Property 8: Включение stderr в сообщение об ошибке
   * Validates: Requirements 6.4
   * 
   * Для любой ошибки выполнения с непустым stderr, сообщение об ошибке должно 
   * содержать содержимое stderr.
   */
  describe('Property 8: Включение stderr в сообщение об ошибке', () => {
    test('должен включать stderr в сообщение об ошибке', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // Основное сообщение об ошибке
          fc.string({ minLength: 1, maxLength: 200 }), // Содержимое stderr
          (errorMsg, stderr) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Создаем ошибку с stderr в сообщении (как это делает базовый класс)
            const errorWithStderr = new Error(`${errorMsg}. stderr: ${stderr}`);
            
            const result = adapter.handleError(errorWithStderr);
            
            // Сообщение об ошибке должно содержать stderr
            expect(result.message).toContain(stderr);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен сохранять полное сообщение об ошибке включая stderr', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'Command failed',
            'Execution error',
            'Process terminated',
            'Invalid response'
          ),
          fc.string({ minLength: 10, maxLength: 100 }),
          (baseMsg, stderr) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Формируем сообщение как это делает базовый класс
            const fullMessage = `${baseMsg}. stderr: ${stderr}`;
            const error = new Error(fullMessage);
            
            const result = adapter.handleError(error);
            
            // Полное сообщение должно быть сохранено
            expect(result.message).toBe(fullMessage);
            
            // Должно содержать и базовое сообщение, и stderr
            expect(result.message).toContain(baseMsg);
            expect(result.message).toContain(stderr);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать stderr с различными типами содержимого', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }), // Обычная строка
            fc.stringMatching(/.*\n.*/), // Многострочная строка
            fc.stringMatching(/.*['"\\].*/), // Строка со спецсимволами
            fc.constant('Error: Authentication failed'),
            fc.constant('Warning: Deprecated API'),
            fc.constant('Fatal: Connection timeout')
          ),
          (stderr) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const error = new Error(`Command failed. stderr: ${stderr}`);
            const result = adapter.handleError(error);
            
            // stderr должен быть включен в сообщение без изменений
            expect(result.message).toContain(stderr);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен обрабатывать ошибки без stderr', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (errorMsg) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Ошибка без stderr
            const error = new Error(errorMsg);
            const result = adapter.handleError(error);
            
            // Сообщение должно быть сохранено как есть
            expect(result.message).toBe(errorMsg);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен включать stderr для различных типов ошибок', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'not found',
            'authentication failed',
            'timeout exceeded',
            'invalid request',
            'unknown error'
          ),
          fc.string({ minLength: 10, maxLength: 100 }),
          (errorType, stderr) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const error = new Error(`${errorType}. stderr: ${stderr}`);
            const result = adapter.handleError(error);
            
            // stderr должен быть включен независимо от типа ошибки
            expect(result.message).toContain(stderr);
            
            // Тип ошибки также должен быть в сообщении
            expect(result.message).toContain(errorType);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен сохранять форматирование stderr', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1, maxLength: 50 }),
            { minLength: 2, maxLength: 5 }
          ),
          (stderrLines) => {
            const adapter = new TestableCodexCLIAdapter();
            
            // Создаем многострочный stderr
            const stderr = stderrLines.join('\n');
            const error = new Error(`Command failed. stderr: ${stderr}`);
            
            const result = adapter.handleError(error);
            
            // Все строки stderr должны быть в сообщении
            for (const line of stderrLines) {
              expect(result.message).toContain(line);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: codex-cli-adapter, Property 9: Определение повторяемости ошибки
   * Validates: Requirements 6.5
   * 
   * Для любой ошибки, метод `isRetryableError` должен корректно определять, 
   * можно ли повторить операцию, основываясь на типе ошибки (таймауты и 
   * сетевые ошибки - повторяемые, ошибки аутентификации - нет).
   */
  describe('Property 9: Определение повторяемости ошибки', () => {
    test('должен помечать таймауты как повторяемые ошибки', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'timeout',
            'timed out',
            'operation timeout',
            'request timeout',
            'connection timeout'
          ),
          (timeoutMsg) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const error = new Error(`Command failed: ${timeoutMsg}`);
            const result = adapter.handleError(error);
            
            // Таймауты должны быть повторяемыми
            expect(result.retryable).toBe(true);
            expect(result.code).toBe('ADAPTER_TIMEOUT');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен помечать ошибки аутентификации как неповторяемые', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'authentication failed',
            'unauthorized',
            'auth error',
            'invalid api key',
            'authentication required'
          ),
          (authMsg) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const error = new Error(`Command failed: ${authMsg}`);
            const result = adapter.handleError(error);
            
            // Ошибки аутентификации не должны быть повторяемыми
            expect(result.retryable).toBe(false);
            expect(result.code).toBe('ADAPTER_AUTH_ERROR');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен помечать ошибки "not found" как неповторяемые', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'not found',
            'command not found',
            'enoent',
            'file not found',
            'executable not found'
          ),
          (notFoundMsg) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const error = new Error(`Command failed: ${notFoundMsg}`);
            const result = adapter.handleError(error);
            
            // Ошибки "not found" не должны быть повторяемыми
            expect(result.retryable).toBe(false);
            expect(result.code).toBe('ADAPTER_NOT_FOUND');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен помечать ошибки валидации как неповторяемые', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'invalid request',
            'invalid input',
            'invalid parameter',
            'invalid format',
            'invalid configuration'
          ),
          (invalidMsg) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const error = new Error(`Command failed: ${invalidMsg}`);
            const result = adapter.handleError(error);
            
            // Ошибки валидации не должны быть повторяемыми
            expect(result.retryable).toBe(false);
            expect(result.code).toBe('ADAPTER_INVALID_REQUEST');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен помечать неизвестные ошибки как неповторяемые', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(
            s => !s.toLowerCase().includes('timeout') &&
                 !s.toLowerCase().includes('auth') &&
                 !s.toLowerCase().includes('not found') &&
                 !s.toLowerCase().includes('invalid') &&
                 !s.toLowerCase().includes('enoent')
          ),
          (errorMsg) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const error = new Error(errorMsg);
            const result = adapter.handleError(error);
            
            // Неизвестные ошибки по умолчанию не должны быть повторяемыми
            expect(result.retryable).toBe(false);
            expect(result.code).toBe('ADAPTER_UNKNOWN_ERROR');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно определять повторяемость для различных типов ошибок', () => {
      fc.assert(
        fc.property(
          fc.record({
            errorType: fc.constantFrom(
              'timeout',
              'authentication',
              'not found',
              'invalid',
              'unknown'
            ),
            additionalText: fc.string({ minLength: 0, maxLength: 50 })
          }),
          ({ errorType, additionalText }) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const errorMessages: Record<string, string> = {
              'timeout': `Operation timed out ${additionalText}`,
              'authentication': `Authentication failed ${additionalText}`,
              'not found': `Command not found ${additionalText}`,
              'invalid': `Invalid request ${additionalText}`,
              'unknown': `Some error ${additionalText}`
            };
            
            const error = new Error(errorMessages[errorType]);
            const result = adapter.handleError(error);
            
            // Проверяем корректность флага retryable
            if (errorType === 'timeout') {
              expect(result.retryable).toBe(true);
            } else {
              expect(result.retryable).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен сохранять оригинальную ошибку независимо от повторяемости', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'timeout',
            'authentication failed',
            'not found',
            'invalid request'
          ),
          (errorMsg) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const originalError = new Error(errorMsg);
            const result = adapter.handleError(originalError);
            
            // Оригинальная ошибка должна быть сохранена
            expect(result.originalError).toBe(originalError);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать ошибки с регистронезависимыми сообщениями', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'TIMEOUT',
            'TimeOut',
            'AUTHENTICATION FAILED',
            'Authentication Failed',
            'NOT FOUND',
            'Not Found',
            'INVALID',
            'Invalid'
          ),
          (errorMsg) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const error = new Error(errorMsg);
            const result = adapter.handleError(error);
            
            // Определение типа ошибки должно быть регистронезависимым
            const lowerMsg = errorMsg.toLowerCase();
            if (lowerMsg.includes('timeout')) {
              expect(result.code).toBe('ADAPTER_TIMEOUT');
              expect(result.retryable).toBe(true);
            } else if (lowerMsg.includes('authentication')) {
              expect(result.code).toBe('ADAPTER_AUTH_ERROR');
              expect(result.retryable).toBe(false);
            } else if (lowerMsg.includes('not found')) {
              expect(result.code).toBe('ADAPTER_NOT_FOUND');
              expect(result.retryable).toBe(false);
            } else if (lowerMsg.includes('invalid')) {
              expect(result.code).toBe('ADAPTER_INVALID_REQUEST');
              expect(result.retryable).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать ошибки с дополнительным контекстом', () => {
      fc.assert(
        fc.property(
          fc.record({
            errorType: fc.constantFrom('timeout', 'authentication', 'not found', 'invalid'),
            prefix: fc.string({ minLength: 0, maxLength: 30 }),
            suffix: fc.string({ minLength: 0, maxLength: 30 })
          }),
          ({ errorType, prefix, suffix }) => {
            const adapter = new TestableCodexCLIAdapter();
            
            const errorMessages: Record<string, string> = {
              'timeout': 'timeout',
              'authentication': 'authentication failed',
              'not found': 'not found',
              'invalid': 'invalid'
            };
            
            const fullMessage = `${prefix} ${errorMessages[errorType]} ${suffix}`;
            const error = new Error(fullMessage);
            const result = adapter.handleError(error);
            
            // Тип ошибки должен определяться корректно даже с дополнительным контекстом
            if (errorType === 'timeout') {
              expect(result.code).toBe('ADAPTER_TIMEOUT');
              expect(result.retryable).toBe(true);
            } else {
              expect(result.retryable).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
