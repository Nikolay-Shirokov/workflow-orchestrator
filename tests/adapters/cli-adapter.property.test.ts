/**
 * Property-based тесты для CLI-адаптеров
 * Проверяют универсальные свойства корректности адаптеров
 */

import * as fc from 'fast-check';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import { MockCLIAdapter } from '../../src/adapters/mock-cli-adapter.js';
import { BaseCLIAdapter } from '../../src/adapters/base-cli-adapter.js';
import {
  AdapterConfig,
  AdapterRequest
} from '../../src/core/types.js';

/**
 * Тестовый адаптер для проверки подстановки параметров
 */
class TestCLIAdapter extends BaseCLIAdapter {
  name = 'test-adapter';
  version = '1.0.0';
  
  // Делаем метод публичным для тестирования
  public testPrepareArguments(request: AdapterRequest): string[] {
    return this.prepareArguments(request);
  }
  
  // Делаем метод публичным для тестирования
  public testSubstituteVariables(
    template: string,
    context: Record<string, string>
  ): string {
    return this.substituteVariables(template, context);
  }
}

describe('CLI Adapter Property Tests', () => {
  /**
   * Feature: workflow-orchestrator, Property 2: Подстановка параметров команды
   * Validates: Requirements 1.2
   * 
   * Для любого CLI-адаптера с параметрами, вызов адаптера должен генерировать
   * строку команды, содержащую все подставленные значения параметров.
   */
  describe('Property 2: Подстановка параметров команды', () => {
    test('должен подставлять все параметры в аргументы команды', () => {
      fc.assert(
        fc.property(
          // Генерируем случайные параметры запроса
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 100 }),
            model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            temperature: fc.option(fc.double({ min: 0, max: 2 }), { nil: undefined }),
            maxTokens: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: undefined }),
            systemPrompt: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined })
          }),
          // Генерируем конфигурацию с шаблонами аргументов
          fc.array(
            fc.oneof(
              fc.constant('--prompt'),
              fc.constant('${prompt}'),
              fc.constant('--model'),
              fc.constant('${model}'),
              fc.constant('--temperature'),
              fc.constant('${temperature}'),
              fc.constant('--max-tokens'),
              fc.constant('${maxTokens}')
            ),
            { minLength: 1, maxLength: 10 }
          ),
          (request, args) => {
            // Создаем конфигурацию адаптера
            const config: AdapterConfig = {
              name: 'test',
              command: 'test-command',
              args
            };
            
            const adapter = new TestCLIAdapter(config);
            const preparedArgs = adapter.testPrepareArguments(request);
            
            // Проверяем, что все переменные были подставлены
            for (const arg of preparedArgs) {
              // Если в аргументе есть ${prompt}, он должен содержать значение prompt
              if (args.some(a => a.includes('${prompt}'))) {
                const hasPrompt = preparedArgs.some(a => a.includes(request.prompt));
                expect(hasPrompt || !request.prompt).toBe(true);
              }
              
              // Если в аргументе есть ${model} и model определен, он должен содержать значение model
              if (args.some(a => a.includes('${model}')) && request.model) {
                const hasModel = preparedArgs.some(a => a.includes(request.model!));
                expect(hasModel).toBe(true);
              }
              
              // Не должно остаться неподставленных переменных (кроме тех, для которых нет значений)
              const hasUnsubstitutedVars = /\$\{(\w+)\}/.test(arg);
              if (hasUnsubstitutedVars) {
                const match = arg.match(/\$\{(\w+)\}/);
                if (match) {
                  const varName = match[1];
                  // Переменная может остаться неподставленной только если значение не было предоставлено
                  const valueProvided = 
                    (varName === 'model' && request.model) ||
                    (varName === 'temperature' && request.temperature !== undefined) ||
                    (varName === 'maxTokens' && request.maxTokens !== undefined) ||
                    (varName === 'systemPrompt' && request.systemPrompt);
                  
                  expect(valueProvided).toBe(false);
                }
              }
            }
          }
        ),
        { numRuns: 100 } // Минимум 100 итераций согласно спецификации
      );
    });

    test('должен корректно подставлять переменные в шаблоны', () => {
      fc.assert(
        fc.property(
          // Генерируем валидное имя переменной (буквы, цифры, подчеркивания)
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/).chain(varName =>
            fc.tuple(
              fc.constant(`prefix_\${${varName}}_suffix`),
              fc.constant(varName),
              fc.string({ minLength: 1, maxLength: 50 })
            )
          ),
          ([template, varName, value]) => {
            const config: AdapterConfig = {
              name: 'test',
              command: 'test-command'
            };
            
            const adapter = new TestCLIAdapter(config);
            const context = { [varName]: value };
            const result = adapter.testSubstituteVariables(template, context);
            
            // Результат должен содержать подставленное значение
            expect(result).toContain(value);
            
            // Результат не должен содержать неподставленную переменную
            expect(result).not.toContain(`\${${varName}}`);
            
            // Префикс и суффикс должны остаться
            expect(result).toContain('prefix_');
            expect(result).toContain('_suffix');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен сохранять неопределенные переменные как есть', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
          (varName, otherVarName) => {
            fc.pre(varName !== otherVarName); // Убеждаемся, что имена разные
            
            const config: AdapterConfig = {
              name: 'test',
              command: 'test-command'
            };
            
            const adapter = new TestCLIAdapter(config);
            const template = `\${${varName}}`;
            const context = { [otherVarName]: 'value' };
            const result = adapter.testSubstituteVariables(template, context);
            
            // Неопределенная переменная должна остаться как есть
            expect(result).toBe(template);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: workflow-orchestrator, Property 3: Полнота захвата вывода
   * Validates: Requirements 1.3
   * 
   * Для любого выполнения CLI-команды, система должна полностью захватывать
   * потоки stdout и stderr без потерь.
   */
  describe('Property 3: Полнота захвата вывода', () => {
    test('должен захватывать весь stdout и stderr', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          async (expectedOutput) => {
            const adapter = new MockCLIAdapter('test-adapter', '1.0.0');
            
            // Настраиваем мок для возврата ожидаемого вывода
            adapter.setResponse(/.*/, expectedOutput);
            
            const request: AdapterRequest = {
              prompt: 'test prompt'
            };
            
            const response = await adapter.execute(request);
            
            // Весь вывод должен быть захвачен
            expect(response.content).toBe(expectedOutput);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен сохранять многострочный вывод полностью', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
          async (lines) => {
            const expectedOutput = lines.join('\n');
            const adapter = new MockCLIAdapter('test-adapter', '1.0.0');
            
            adapter.setResponse(/.*/, expectedOutput);
            
            const request: AdapterRequest = {
              prompt: 'test prompt'
            };
            
            const response = await adapter.execute(request);
            
            // Все строки должны быть захвачены
            const responseLines = response.content.split('\n');
            expect(responseLines.length).toBe(lines.length);
            
            // Каждая строка должна присутствовать
            for (const line of lines) {
              expect(response.content).toContain(line);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: workflow-orchestrator, Property 4: Поддержка множественных адаптеров
   * Validates: Requirements 1.4
   * 
   * Для любых N конфигураций адаптеров (N > 0), после регистрации все N адаптеров
   * должны быть доступны и извлекаемы по имени.
   */
  describe('Property 4: Поддержка множественных адаптеров', () => {
    test('должен регистрировать и извлекать множественные адаптеры', () => {
      fc.assert(
        fc.property(
          // Генерируем массив уникальных имен адаптеров
          fc.uniqueArray(
            fc.string({ minLength: 1, maxLength: 20 }),
            { minLength: 1, maxLength: 10 }
          ),
          (adapterNames) => {
            const registry = new AdapterRegistry();
            
            // Регистрируем все адаптеры
            const adapters = adapterNames.map(name => 
              new MockCLIAdapter(name, '1.0.0')
            );
            
            for (const adapter of adapters) {
              registry.register(adapter);
            }
            
            // Все адаптеры должны быть доступны
            expect(registry.size()).toBe(adapterNames.length);
            
            // Каждый адаптер должен быть извлекаем по имени
            for (const name of adapterNames) {
              const retrieved = registry.get(name);
              expect(retrieved).toBeDefined();
              expect(retrieved?.name).toBe(name);
            }
            
            // getAll должен вернуть все адаптеры
            const allAdapters = registry.getAll();
            expect(allAdapters.length).toBe(adapterNames.length);
            
            // Все имена должны присутствовать
            const retrievedNames = allAdapters.map(a => a.name).sort();
            const expectedNames = [...adapterNames].sort();
            expect(retrievedNames).toEqual(expectedNames);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен проверять наличие адаптеров через has()', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(
            fc.string({ minLength: 1, maxLength: 20 }),
            { minLength: 1, maxLength: 10 }
          ),
          fc.string({ minLength: 1, maxLength: 20 }),
          (registeredNames, unregisteredName) => {
            fc.pre(!registeredNames.includes(unregisteredName)); // Убеждаемся, что имя не зарегистрировано
            
            const registry = new AdapterRegistry();
            
            // Регистрируем адаптеры
            for (const name of registeredNames) {
              registry.register(new MockCLIAdapter(name, '1.0.0'));
            }
            
            // Зарегистрированные адаптеры должны быть найдены
            for (const name of registeredNames) {
              expect(registry.has(name)).toBe(true);
            }
            
            // Незарегистрированный адаптер не должен быть найден
            expect(registry.has(unregisteredName)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('не должен допускать дублирование имен адаптеров', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (adapterName) => {
            const registry = new AdapterRegistry();
            
            // Первая регистрация должна пройти успешно
            const adapter1 = new MockCLIAdapter(adapterName, '1.0.0');
            registry.register(adapter1);
            
            // Вторая регистрация с тем же именем должна вызвать ошибку
            const adapter2 = new MockCLIAdapter(adapterName, '2.0.0');
            expect(() => registry.register(adapter2)).toThrow();
            
            // Должен остаться только первый адаптер
            expect(registry.size()).toBe(1);
            expect(registry.get(adapterName)?.version).toBe('1.0.0');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
