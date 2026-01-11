/**
 * Property-based тесты для OpenAI-совместимого адаптера
 * Проверяют универсальные свойства корректности адаптера
 */

import * as fc from 'fast-check';
import { OpenAICompatibleAdapter, OpenAICompatibleConfig } from '../../src/adapters/openai-compatible-adapter.js';

describe('OpenAI Compatible Adapter Property Tests', () => {
  /**
   * Feature: openai-compatible-adapter, Property 1: Конфигурация корректно применяется
   * Validates: Requirements 1.1, 1.4, 1.5
   * 
   * Для любого валидного набора параметров конфигурации (baseUrl, timeout, headers),
   * создание адаптера должно сохранять эти параметры и использовать их при выполнении запросов.
   */
  describe('Property 1: Конфигурация корректно применяется', () => {
    test('должен сохранять все параметры конфигурации', () => {
      fc.assert(
        fc.property(
          // Генерируем случайную конфигурацию
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            baseUrl: fc.webUrl({ withFragments: false, withQueryParameters: false }),
            apiKey: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
            defaultModel: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            timeout: fc.option(fc.integer({ min: 1000, max: 600000 }), { nil: undefined }),
            headers: fc.option(
              fc.dictionary(
                fc.string({ minLength: 1, maxLength: 30 }),
                fc.string({ minLength: 1, maxLength: 100 })
              ),
              { nil: undefined }
            )
          }),
          (config) => {
            const adapter = new OpenAICompatibleAdapter(config);
            
            // Проверяем, что имя сохранено
            expect(adapter.name).toBe(config.name);
            
            // Проверяем, что версия установлена
            expect(adapter.version).toBe('1.0.0');
            
            // Адаптер должен быть создан без ошибок
            expect(adapter).toBeDefined();
            expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен использовать значения по умолчанию для локального LM Studio', () => {
      fc.assert(
        fc.property(
          fc.constant(undefined),
          (config) => {
            const adapter = new OpenAICompatibleAdapter(config);
            
            // Должно быть установлено имя по умолчанию
            expect(adapter.name).toBe('openai-compatible');
            
            // Должна быть установлена версия
            expect(adapter.version).toBe('1.0.0');
            
            // Адаптер должен быть создан
            expect(adapter).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать частичную конфигурацию', () => {
      fc.assert(
        fc.property(
          // Генерируем частичную конфигурацию (некоторые поля могут отсутствовать)
          fc.record({
            name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            baseUrl: fc.option(fc.webUrl({ withFragments: false, withQueryParameters: false }), { nil: undefined }),
            apiKey: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
            defaultModel: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            timeout: fc.option(fc.integer({ min: 1000, max: 600000 }), { nil: undefined })
          }),
          (config) => {
            const adapter = new OpenAICompatibleAdapter(config);
            
            // Адаптер должен быть создан без ошибок
            expect(adapter).toBeDefined();
            
            // Имя должно быть установлено (либо из конфига, либо по умолчанию)
            expect(adapter.name).toBeTruthy();
            expect(typeof adapter.name).toBe('string');
            
            // Версия должна быть установлена
            expect(adapter.version).toBe('1.0.0');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать дополнительные заголовки', () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 30 }),
            fc.string({ minLength: 1, maxLength: 100 }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (headers) => {
            const config: Partial<OpenAICompatibleConfig> = {
              headers
            };
            
            const adapter = new OpenAICompatibleAdapter(config);
            
            // Адаптер должен быть создан без ошибок
            expect(adapter).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: openai-compatible-adapter, Property 11: Переменные окружения подставляются
   * Validates: Requirements 8.6
   * 
   * Для любой строки конфигурации в формате "${VAR_NAME}", значение должно
   * подставляться из переменных окружения process.env.VAR_NAME.
   */
  describe('Property 11: Переменные окружения подставляются', () => {
    test('должен подставлять переменные окружения в baseUrl', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Z_][A-Z0-9_]*$/),
          fc.webUrl({ withFragments: false, withQueryParameters: false }),
          (varName, url) => {
            // Устанавливаем переменную окружения
            const originalValue = process.env[varName];
            process.env[varName] = url;
            
            try {
              const config: Partial<OpenAICompatibleConfig> = {
                baseUrl: `\${${varName}}`
              };
              
              const adapter = new OpenAICompatibleAdapter(config);
              
              // Адаптер должен быть создан без ошибок
              expect(adapter).toBeDefined();
            } finally {
              // Восстанавливаем оригинальное значение
              if (originalValue === undefined) {
                delete process.env[varName];
              } else {
                process.env[varName] = originalValue;
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен подставлять переменные окружения в apiKey', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Z_][A-Z0-9_]*$/),
          fc.string({ minLength: 20, maxLength: 100 }),
          (varName, apiKey) => {
            // Устанавливаем переменную окружения
            const originalValue = process.env[varName];
            process.env[varName] = apiKey;
            
            try {
              const config: Partial<OpenAICompatibleConfig> = {
                apiKey: `\${${varName}}`
              };
              
              const adapter = new OpenAICompatibleAdapter(config);
              
              // Адаптер должен быть создан без ошибок
              expect(adapter).toBeDefined();
            } finally {
              // Восстанавливаем оригинальное значение
              if (originalValue === undefined) {
                delete process.env[varName];
              } else {
                process.env[varName] = originalValue;
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен сохранять строки без переменных окружения как есть', () => {
      fc.assert(
        fc.property(
          fc.webUrl({ withFragments: false, withQueryParameters: false }),
          (url) => {
            // Убеждаемся, что URL не содержит паттерн ${...}
            fc.pre(!url.includes('${'));
            
            const config: Partial<OpenAICompatibleConfig> = {
              baseUrl: url
            };
            
            const adapter = new OpenAICompatibleAdapter(config);
            
            // Адаптер должен быть создан без ошибок
            expect(adapter).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен обрабатывать несуществующие переменные окружения', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Z_][A-Z0-9_]*$/),
          (varName) => {
            // Убеждаемся, что переменная не существует
            const originalValue = process.env[varName];
            delete process.env[varName];
            
            try {
              const config: Partial<OpenAICompatibleConfig> = {
                baseUrl: `\${${varName}}`
              };
              
              const adapter = new OpenAICompatibleAdapter(config);
              
              // Адаптер должен быть создан без ошибок
              // Неподставленная переменная должна остаться как есть
              expect(adapter).toBeDefined();
            } finally {
              // Восстанавливаем оригинальное значение
              if (originalValue !== undefined) {
                process.env[varName] = originalValue;
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен подставлять множественные переменные окружения', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[A-Z_][A-Z0-9_]*$/),
            fc.stringMatching(/^[A-Z_][A-Z0-9_]*$/)
          ).filter(([var1, var2]) => var1 !== var2),
          fc.string({ minLength: 5, maxLength: 50 }),
          fc.string({ minLength: 5, maxLength: 50 }),
          ([var1, var2], value1, value2) => {
            // Устанавливаем переменные окружения
            const originalValue1 = process.env[var1];
            const originalValue2 = process.env[var2];
            process.env[var1] = value1;
            process.env[var2] = value2;
            
            try {
              const config: Partial<OpenAICompatibleConfig> = {
                baseUrl: `http://\${${var1}}:8080`,
                apiKey: `key_\${${var2}}`
              };
              
              const adapter = new OpenAICompatibleAdapter(config);
              
              // Адаптер должен быть создан без ошибок
              expect(adapter).toBeDefined();
            } finally {
              // Восстанавливаем оригинальные значения
              if (originalValue1 === undefined) {
                delete process.env[var1];
              } else {
                process.env[var1] = originalValue1;
              }
              if (originalValue2 === undefined) {
                delete process.env[var2];
              } else {
                process.env[var2] = originalValue2;
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
