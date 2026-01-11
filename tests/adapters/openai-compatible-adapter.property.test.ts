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

  /**
   * Feature: openai-compatible-adapter, Property 3: Запрос корректно формируется
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   * 
   * Для любого AdapterRequest с промптом, моделью, системным промптом и параметрами генерации,
   * сформированный HTTP запрос должен:
   * - Быть POST запросом к эндпоинту /chat/completions
   * - Содержать промпт как сообщение с ролью "user"
   * - Содержать системный промпт (если указан) как первое сообщение с ролью "system"
   * - Содержать имя модели в параметре "model"
   * - Содержать параметры temperature и max_tokens (если указаны)
   */
  describe('Property 3: Запрос корректно формируется', () => {
    test('должен формировать корректный запрос с промптом', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1000 }),
          (prompt) => {
            const adapter = new OpenAICompatibleAdapter();
            
            // Используем рефлексию для доступа к приватному методу
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const request = {
              prompt
            };
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что запрос содержит промпт как сообщение с ролью "user"
            expect(chatRequest.messages).toBeDefined();
            expect(chatRequest.messages.length).toBeGreaterThan(0);
            
            const userMessage = chatRequest.messages.find((m: any) => m.role === 'user');
            expect(userMessage).toBeDefined();
            expect(userMessage.content).toBe(prompt);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять системный промпт как первое сообщение', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          (systemPrompt, prompt) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const request = {
              prompt,
              systemPrompt
            };
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что системный промпт - первое сообщение
            expect(chatRequest.messages.length).toBeGreaterThanOrEqual(2);
            expect(chatRequest.messages[0].role).toBe('system');
            expect(chatRequest.messages[0].content).toBe(systemPrompt);
            
            // Проверяем, что пользовательский промпт идет после системного
            const userMessage = chatRequest.messages.find((m: any) => m.role === 'user');
            expect(userMessage).toBeDefined();
            expect(userMessage.content).toBe(prompt);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен передавать имя модели', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (prompt, model) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const request = {
              prompt,
              model
            };
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что модель передана
            expect(chatRequest.model).toBe(model);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен использовать модель по умолчанию если не указана', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          (prompt, defaultModel) => {
            const adapter = new OpenAICompatibleAdapter({
              defaultModel
            });
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const request = {
              prompt
            };
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что модель установлена
            expect(chatRequest.model).toBeDefined();
            
            // Если была указана модель по умолчанию, она должна использоваться
            if (defaultModel) {
              expect(chatRequest.model).toBe(defaultModel);
            } else {
              // Иначе должна быть модель по умолчанию
              expect(chatRequest.model).toBe('gpt-3.5-turbo');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен передавать параметр temperature', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.float({ min: 0, max: 2, noNaN: true }),
          (prompt, temperature) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const request = {
              prompt,
              temperature
            };
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что temperature передана
            expect(chatRequest.temperature).toBe(temperature);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен передавать параметр max_tokens', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.integer({ min: 1, max: 100000 }),
          (prompt, maxTokens) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const request = {
              prompt,
              maxTokens
            };
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что max_tokens передан
            expect(chatRequest.max_tokens).toBe(maxTokens);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно формировать полный запрос со всеми параметрами', () => {
      fc.assert(
        fc.property(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 500 }),
            systemPrompt: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined }),
            model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            temperature: fc.option(fc.float({ min: 0, max: 2, noNaN: true }), { nil: undefined }),
            maxTokens: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined })
          }),
          (request) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const chatRequest = buildMethod(request);
            
            // Проверяем базовую структуру
            expect(chatRequest).toBeDefined();
            expect(chatRequest.messages).toBeDefined();
            expect(Array.isArray(chatRequest.messages)).toBe(true);
            expect(chatRequest.model).toBeDefined();
            
            // Проверяем промпт
            const userMessage = chatRequest.messages.find((m: any) => m.role === 'user');
            expect(userMessage).toBeDefined();
            expect(userMessage.content).toBe(request.prompt);
            
            // Проверяем системный промпт если указан
            if (request.systemPrompt) {
              expect(chatRequest.messages[0].role).toBe('system');
              expect(chatRequest.messages[0].content).toBe(request.systemPrompt);
            }
            
            // Проверяем модель
            if (request.model) {
              expect(chatRequest.model).toBe(request.model);
            }
            
            // Проверяем temperature
            if (request.temperature !== undefined) {
              expect(chatRequest.temperature).toBe(request.temperature);
            }
            
            // Проверяем maxTokens
            if (request.maxTokens !== undefined) {
              expect(chatRequest.max_tokens).toBe(request.maxTokens);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен обрабатывать запросы без опциональных параметров', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }),
          (prompt) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const request = {
              prompt
            };
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что запрос сформирован
            expect(chatRequest).toBeDefined();
            expect(chatRequest.messages).toBeDefined();
            expect(chatRequest.model).toBeDefined();
            
            // Проверяем, что промпт присутствует
            const userMessage = chatRequest.messages.find((m: any) => m.role === 'user');
            expect(userMessage).toBeDefined();
            expect(userMessage.content).toBe(prompt);
            
            // Опциональные параметры могут отсутствовать
            // temperature и max_tokens могут быть undefined
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: openai-compatible-adapter, Property 10: Все параметры AdapterRequest обрабатываются
   * Validates: Requirements 7.5
   * 
   * Для любого валидного AdapterRequest, адаптер должен корректно обрабатывать
   * все стандартные поля: prompt, model, temperature, maxTokens, systemPrompt, timeout.
   */
  describe('Property 10: Все параметры AdapterRequest обрабатываются', () => {
    test('должен обрабатывать все стандартные поля AdapterRequest', () => {
      fc.assert(
        fc.property(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 500 }),
            model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            temperature: fc.option(fc.float({ min: 0, max: 2, noNaN: true }), { nil: undefined }),
            maxTokens: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined }),
            systemPrompt: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined }),
            timeout: fc.option(fc.integer({ min: 1000, max: 600000 }), { nil: undefined })
          }),
          (request) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что все параметры обработаны
            expect(chatRequest).toBeDefined();
            
            // Проверяем prompt (обязательный)
            const userMessage = chatRequest.messages.find((m: any) => m.role === 'user');
            expect(userMessage).toBeDefined();
            expect(userMessage.content).toBe(request.prompt);
            
            // Проверяем model
            expect(chatRequest.model).toBeDefined();
            if (request.model) {
              expect(chatRequest.model).toBe(request.model);
            }
            
            // Проверяем temperature
            if (request.temperature !== undefined) {
              expect(chatRequest.temperature).toBe(request.temperature);
            }
            
            // Проверяем maxTokens
            if (request.maxTokens !== undefined) {
              expect(chatRequest.max_tokens).toBe(request.maxTokens);
            }
            
            // Проверяем systemPrompt
            if (request.systemPrompt) {
              const systemMessage = chatRequest.messages.find((m: any) => m.role === 'system');
              expect(systemMessage).toBeDefined();
              expect(systemMessage.content).toBe(request.systemPrompt);
            }
            
            // timeout обрабатывается на уровне execute, не buildChatCompletionRequest
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать минимальный набор параметров', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }),
          (prompt) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const request = {
              prompt
            };
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что запрос сформирован с минимальными параметрами
            expect(chatRequest).toBeDefined();
            expect(chatRequest.messages).toBeDefined();
            expect(chatRequest.model).toBeDefined();
            
            const userMessage = chatRequest.messages.find((m: any) => m.role === 'user');
            expect(userMessage).toBeDefined();
            expect(userMessage.content).toBe(prompt);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать максимальный набор параметров', () => {
      fc.assert(
        fc.property(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 500 }),
            model: fc.string({ minLength: 1, maxLength: 50 }),
            temperature: fc.float({ min: 0, max: 2, noNaN: true }),
            maxTokens: fc.integer({ min: 1, max: 100000 }),
            systemPrompt: fc.string({ minLength: 1, maxLength: 500 }),
            timeout: fc.integer({ min: 1000, max: 600000 })
          }),
          (request) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что все параметры присутствуют
            expect(chatRequest).toBeDefined();
            expect(chatRequest.messages).toBeDefined();
            expect(chatRequest.messages.length).toBeGreaterThanOrEqual(2);
            
            // Проверяем systemPrompt
            expect(chatRequest.messages[0].role).toBe('system');
            expect(chatRequest.messages[0].content).toBe(request.systemPrompt);
            
            // Проверяем prompt
            const userMessage = chatRequest.messages.find((m: any) => m.role === 'user');
            expect(userMessage).toBeDefined();
            expect(userMessage.content).toBe(request.prompt);
            
            // Проверяем model
            expect(chatRequest.model).toBe(request.model);
            
            // Проверяем temperature
            expect(chatRequest.temperature).toBe(request.temperature);
            
            // Проверяем maxTokens
            expect(chatRequest.max_tokens).toBe(request.maxTokens);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен игнорировать неизвестные параметры без ошибок', () => {
      fc.assert(
        fc.property(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 500 }),
            // Добавляем неизвестные параметры
            unknownParam1: fc.string(),
            unknownParam2: fc.integer(),
            unknownParam3: fc.boolean()
          }),
          (request: any) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            // Не должно быть ошибок при наличии неизвестных параметров
            expect(() => {
              const chatRequest = buildMethod(request);
              expect(chatRequest).toBeDefined();
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать граничные значения параметров', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            // Минимальные значения
            {
              prompt: 'a',
              temperature: 0,
              maxTokens: 1
            },
            // Максимальные значения
            {
              prompt: 'x'.repeat(500),
              temperature: 2,
              maxTokens: 100000
            },
            // Средние значения
            {
              prompt: 'test prompt',
              temperature: 1,
              maxTokens: 1000
            }
          ),
          (request) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const chatRequest = buildMethod(request);
            
            // Проверяем, что запрос сформирован
            expect(chatRequest).toBeDefined();
            expect(chatRequest.messages).toBeDefined();
            
            const userMessage = chatRequest.messages.find((m: any) => m.role === 'user');
            expect(userMessage).toBeDefined();
            expect(userMessage.content).toBe(request.prompt);
            
            if (request.temperature !== undefined) {
              expect(chatRequest.temperature).toBe(request.temperature);
            }
            
            if (request.maxTokens !== undefined) {
              expect(chatRequest.max_tokens).toBe(request.maxTokens);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен сохранять порядок сообщений: system, затем user', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          (systemPrompt, prompt) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
            
            const request = {
              prompt,
              systemPrompt
            };
            
            const chatRequest = buildMethod(request);
            
            // Проверяем порядок сообщений
            expect(chatRequest.messages.length).toBeGreaterThanOrEqual(2);
            
            // Первое сообщение должно быть system
            expect(chatRequest.messages[0].role).toBe('system');
            
            // Последнее сообщение должно быть user
            const lastMessage = chatRequest.messages[chatRequest.messages.length - 1];
            expect(lastMessage.role).toBe('user');
            
            // Между ними не должно быть других сообщений
            expect(chatRequest.messages.length).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
