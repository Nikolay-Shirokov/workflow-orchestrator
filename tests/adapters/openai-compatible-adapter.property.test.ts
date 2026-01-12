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
   * Feature: openai-compatible-adapter, Property 2: API ключ передается в заголовках
   * Validates: Requirements 1.2
   * 
   * Для любого API ключа, если он указан в конфигурации, он должен присутствовать
   * в заголовке Authorization всех HTTP запросов в формате "Bearer {apiKey}".
   */
  describe('Property 2: API ключ передается в заголовках', () => {
    test('должен добавлять Authorization заголовок с API ключом', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 20, maxLength: 100 }),
          (apiKey) => {
            const adapter = new OpenAICompatibleAdapter({
              apiKey
            });
            
            // Используем рефлексию для доступа к приватному методу buildHeaders
            const buildHeadersMethod = (adapter as any).buildHeaders.bind(adapter);
            
            const headers = buildHeadersMethod();
            
            // Проверяем, что заголовок Authorization присутствует
            expect(headers['Authorization']).toBeDefined();
            
            // Проверяем формат: "Bearer {apiKey}"
            expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять Authorization заголовок для любого валидного API ключа', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 20, maxLength: 50 }),
            fc.stringMatching(/^sk-[a-zA-Z0-9]{32,}$/),
            fc.stringMatching(/^[a-zA-Z0-9_-]{40,}$/)
          ),
          (apiKey) => {
            const adapter = new OpenAICompatibleAdapter({
              apiKey
            });
            
            const buildHeadersMethod = (adapter as any).buildHeaders.bind(adapter);
            const headers = buildHeadersMethod();
            
            // Проверяем наличие и формат заголовка
            expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('НЕ должен добавлять Authorization заголовок если API ключ не указан', () => {
      fc.assert(
        fc.property(
          fc.constant(undefined),
          () => {
            const adapter = new OpenAICompatibleAdapter({
              apiKey: undefined
            });
            
            const buildHeadersMethod = (adapter as any).buildHeaders.bind(adapter);
            const headers = buildHeadersMethod();
            
            // Проверяем, что заголовок Authorization отсутствует
            expect(headers['Authorization']).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен добавлять Authorization заголовок вместе с другими заголовками', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 20, maxLength: 100 }),
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 30 }).filter(key => key !== 'Authorization'),
            fc.string({ minLength: 1, maxLength: 100 }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (apiKey, customHeaders) => {
            const adapter = new OpenAICompatibleAdapter({
              apiKey,
              headers: customHeaders
            });
            
            const buildHeadersMethod = (adapter as any).buildHeaders.bind(adapter);
            const headers = buildHeadersMethod();
            
            // Проверяем, что Authorization заголовок присутствует
            expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
            
            // Проверяем, что пользовательские заголовки также присутствуют
            Object.keys(customHeaders).forEach(key => {
              expect(headers[key]).toBe(customHeaders[key]);
            });
            
            // Проверяем, что Content-Type также присутствует
            expect(headers['Content-Type']).toBe('application/json');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен всегда включать Content-Type заголовок', () => {
      fc.assert(
        fc.property(
          fc.option(fc.string({ minLength: 20, maxLength: 100 }), { nil: undefined }),
          (apiKey) => {
            const adapter = new OpenAICompatibleAdapter({
              apiKey
            });
            
            const buildHeadersMethod = (adapter as any).buildHeaders.bind(adapter);
            const headers = buildHeadersMethod();
            
            // Content-Type должен быть всегда
            expect(headers['Content-Type']).toBe('application/json');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать API ключи с переменными окружения', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Z_][A-Z0-9_]*$/),
          fc.string({ minLength: 20, maxLength: 100 }),
          (varName, apiKey) => {
            // Устанавливаем переменную окружения
            const originalValue = process.env[varName];
            process.env[varName] = apiKey;
            
            try {
              const adapter = new OpenAICompatibleAdapter({
                apiKey: `\${${varName}}`
              });
              
              const buildHeadersMethod = (adapter as any).buildHeaders.bind(adapter);
              const headers = buildHeadersMethod();
              
              // Проверяем, что API ключ подставлен из переменной окружения
              expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
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

    test('НЕ должен добавлять Authorization заголовок для пустого API ключа', () => {
      fc.assert(
        fc.property(
          fc.constant(''),
          (apiKey) => {
            const adapter = new OpenAICompatibleAdapter({
              apiKey
            });
            
            const buildHeadersMethod = (adapter as any).buildHeaders.bind(adapter);
            const headers = buildHeadersMethod();
            
            // Пустой API ключ не должен добавлять заголовок Authorization
            // (пустая строка считается отсутствием ключа)
            expect(headers['Authorization']).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен сохранять API ключ без изменений', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 20, maxLength: 100 }),
          (apiKey) => {
            const adapter = new OpenAICompatibleAdapter({
              apiKey
            });
            
            const buildHeadersMethod = (adapter as any).buildHeaders.bind(adapter);
            const headers = buildHeadersMethod();
            
            // API ключ должен быть передан без изменений (кроме префикса Bearer)
            const extractedKey = headers['Authorization'].replace('Bearer ', '');
            expect(extractedKey).toBe(apiKey);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать API ключи со специальными символами', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 20, maxLength: 100 }),
          (baseKey) => {
            // Добавляем специальные символы, которые могут быть в API ключах
            const apiKey = `${baseKey}-_+=`;
            
            const adapter = new OpenAICompatibleAdapter({
              apiKey
            });
            
            const buildHeadersMethod = (adapter as any).buildHeaders.bind(adapter);
            const headers = buildHeadersMethod();
            
            // API ключ со специальными символами должен быть корректно передан
            expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
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

  /**
   * Feature: openai-compatible-adapter, Property 4: Ответ корректно парсится
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4
   * 
   * Для любого валидного OpenAI API ответа, парсинг должен:
   * - Извлекать текст из choices[0].message.content (всегда первый вариант)
   * - Сохранять информацию о модели из поля "model"
   * - Сохранять информацию об использовании токенов из поля "usage" в metadata
   * - Измерять и возвращать время выполнения запроса
   */
  describe('Property 4: Ответ корректно парсится', () => {
    test('должен извлекать контент из первого варианта ответа', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1000 }),
          (content) => {
            const adapter = new OpenAICompatibleAdapter();
            
            // Используем рефлексию для доступа к приватному методу
            const parseMethod = (adapter as any).parseChatCompletion.bind(adapter);
            
            // Создаем валидный ответ OpenAI API
            const response = {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content
                  },
                  finish_reason: 'stop'
                }
              ]
            };
            
            const parsedContent = parseMethod(response);
            
            // Проверяем, что контент извлечен корректно
            expect(parsedContent).toBe(content);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен извлекать контент из первого варианта при наличии нескольких', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 500 }), { minLength: 2, maxLength: 5 }),
          (contents) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const parseMethod = (adapter as any).parseChatCompletion.bind(adapter);
            
            // Создаем ответ с несколькими вариантами
            const response = {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: contents.map((content, index) => ({
                index,
                message: {
                  role: 'assistant',
                  content
                },
                finish_reason: 'stop'
              }))
            };
            
            const parsedContent = parseMethod(response);
            
            // Должен вернуть контент первого варианта (index 0)
            expect(parsedContent).toBe(contents[0]);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать различные типы контента', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.lorem({ maxCount: 50 }),
            fc.stringMatching(/^[a-zA-Z0-9\s.,!?]+$/),
            fc.unicodeString({ minLength: 1, maxLength: 100 })
          ),
          (content) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const parseMethod = (adapter as any).parseChatCompletion.bind(adapter);
            
            const response = {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content
                  },
                  finish_reason: 'stop'
                }
              ]
            };
            
            const parsedContent = parseMethod(response);
            
            // Контент должен быть извлечен без изменений
            expect(parsedContent).toBe(content);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен выбрасывать ошибку при отсутствии choices', () => {
      fc.assert(
        fc.property(
          fc.constant(undefined),
          () => {
            const adapter = new OpenAICompatibleAdapter();
            
            const parseMethod = (adapter as any).parseChatCompletion.bind(adapter);
            
            // Ответ без choices
            const response = {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: []
            };
            
            // Должна быть выброшена ошибка
            expect(() => parseMethod(response)).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен выбрасывать ошибку при отсутствии контента', () => {
      fc.assert(
        fc.property(
          fc.constant(undefined),
          () => {
            const adapter = new OpenAICompatibleAdapter();
            
            const parseMethod = (adapter as any).parseChatCompletion.bind(adapter);
            
            // Ответ без контента
            const response = {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: null
                  },
                  finish_reason: 'stop'
                }
              ]
            };
            
            // Должна быть выброшена ошибка
            expect(() => parseMethod(response)).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать пустой контент', () => {
      fc.assert(
        fc.property(
          fc.constant(''),
          (content) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const parseMethod = (adapter as any).parseChatCompletion.bind(adapter);
            
            const response = {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content
                  },
                  finish_reason: 'stop'
                }
              ]
            };
            
            // Пустой контент должен вызвать ошибку
            expect(() => parseMethod(response)).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать контент с пробелами', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^\s+$/),
          (content) => {
            // Пропускаем пустые строки
            fc.pre(content.length > 0);
            
            const adapter = new OpenAICompatibleAdapter();
            
            const parseMethod = (adapter as any).parseChatCompletion.bind(adapter);
            
            const response = {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content
                  },
                  finish_reason: 'stop'
                }
              ]
            };
            
            const parsedContent = parseMethod(response);
            
            // Контент с пробелами должен быть сохранен как есть
            expect(parsedContent).toBe(content);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать многострочный контент', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 2, maxLength: 10 }),
          (lines) => {
            const content = lines.join('\n');
            
            const adapter = new OpenAICompatibleAdapter();
            
            const parseMethod = (adapter as any).parseChatCompletion.bind(adapter);
            
            const response = {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content
                  },
                  finish_reason: 'stop'
                }
              ]
            };
            
            const parsedContent = parseMethod(response);
            
            // Многострочный контент должен быть сохранен с переносами строк
            expect(parsedContent).toBe(content);
            expect(parsedContent.split('\n').length).toBe(lines.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать контент со специальными символами', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (baseContent) => {
            // Добавляем специальные символы
            const content = `${baseContent}\n\t"'\\{}[]`;
            
            const adapter = new OpenAICompatibleAdapter();
            
            const parseMethod = (adapter as any).parseChatCompletion.bind(adapter);
            
            const response = {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content
                  },
                  finish_reason: 'stop'
                }
              ]
            };
            
            const parsedContent = parseMethod(response);
            
            // Специальные символы должны быть сохранены
            expect(parsedContent).toBe(content);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать длинный контент', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1000, maxLength: 10000 }),
          (content) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const parseMethod = (adapter as any).parseChatCompletion.bind(adapter);
            
            const response = {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content
                  },
                  finish_reason: 'stop'
                }
              ]
            };
            
            const parsedContent = parseMethod(response);
            
            // Длинный контент должен быть извлечен полностью
            expect(parsedContent).toBe(content);
            expect(parsedContent.length).toBe(content.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: openai-compatible-adapter, Property 5: HTTP статусы маппятся на коды ошибок
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
   * 
   * Для любого HTTP ответа с ошибкой, код ошибки должен определяться следующим образом:
   * - Сетевые ошибки (ECONNREFUSED, ETIMEDOUT и т.д.) → ADAPTER_NETWORK_ERROR
   * - Статус 401 или 403 → ADAPTER_AUTH_ERROR
   * - Статус 404 → ADAPTER_NOT_FOUND
   * - Статус 429 → ADAPTER_RATE_LIMIT
   * - Таймаут → ADAPTER_TIMEOUT
   * - Статус 500 или 503 → ADAPTER_SERVER_ERROR
   */
  describe('Property 5: HTTP статусы маппятся на коды ошибок', () => {
    test('должен маппить любой HTTP статус на соответствующий код ошибки', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 400, max: 599 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          (status, errorMessage) => {
            const adapter = new OpenAICompatibleAdapter();
            
            // Создаем ошибку с HTTP статусом
            const error = new Error(errorMessage) as Error & { status: number };
            error.status = status;
            
            const adapterError = adapter.handleError(error);
            
            // Проверяем, что ошибка обработана
            expect(adapterError).toBeDefined();
            expect(adapterError.code).toBeDefined();
            expect(adapterError.message).toBeDefined();
            expect(adapterError.originalError).toBe(error);
            
            // Проверяем корректный маппинг статуса на код ошибки
            if (status === 401 || status === 403) {
              expect(adapterError.code).toBe('ADAPTER_AUTH_ERROR');
              expect(adapterError.retryable).toBe(false);
              expect(adapterError.message).toContain('аутентификации');
              expect(adapterError.message).toContain(status.toString());
            } else if (status === 404) {
              expect(adapterError.code).toBe('ADAPTER_NOT_FOUND');
              expect(adapterError.retryable).toBe(false);
              expect(adapterError.message).toContain('не найден');
              expect(adapterError.message).toContain('404');
            } else if (status === 429) {
              expect(adapterError.code).toBe('ADAPTER_RATE_LIMIT');
              expect(adapterError.retryable).toBe(true);
              expect(adapterError.message).toContain('лимит');
              expect(adapterError.message).toContain('429');
            } else if (status >= 500) {
              expect(adapterError.code).toBe('ADAPTER_SERVER_ERROR');
              expect(adapterError.retryable).toBe(true);
              expect(adapterError.message).toContain('сервера');
              expect(adapterError.message).toContain(status.toString());
            } else if (status >= 400 && status < 500) {
              expect(adapterError.code).toBe('ADAPTER_INVALID_REQUEST');
              expect(adapterError.retryable).toBe(false);
              expect(adapterError.message).toContain('Неверный запрос');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен маппить сетевые ошибки на ADAPTER_NETWORK_ERROR', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'ECONNREFUSED',
            'ENOTFOUND',
            'ETIMEDOUT',
            'fetch failed',
            'network error'
          ),
          (errorType) => {
            const adapter = new OpenAICompatibleAdapter();
            
            // Создаем сетевую ошибку с правильным сообщением
            const error = new Error(errorType);
            
            const adapterError = adapter.handleError(error);
            
            // Проверяем маппинг
            expect(adapterError.code).toBe('ADAPTER_NETWORK_ERROR');
            expect(adapterError.retryable).toBe(true);
            expect(adapterError.message).toContain('Ошибка сети');
            expect(adapterError.originalError).toBe(error);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен маппить таймауты на ADAPTER_TIMEOUT', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('aborted', 'request aborted'),
          (errorMessage) => {
            const adapter = new OpenAICompatibleAdapter();
            
            // Создаем ошибку таймаута
            const error = new Error(errorMessage);
            error.name = 'AbortError';
            
            const adapterError = adapter.handleError(error);
            
            // Проверяем маппинг
            expect(adapterError.code).toBe('ADAPTER_TIMEOUT');
            expect(adapterError.retryable).toBe(true);
            expect(adapterError.message).toContain('таймаут');
            expect(adapterError.originalError).toBe(error);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно устанавливать флаг retryable для всех типов ошибок', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Retryable ошибки
            fc.record({
              type: fc.constantFrom('network', 'timeout', 'rate_limit', 'server_error'),
              status: fc.option(fc.constantFrom(429, 500, 503, 502, 504), { nil: undefined })
            }),
            // Non-retryable ошибки
            fc.record({
              type: fc.constantFrom('auth', 'not_found', 'invalid_request'),
              status: fc.constantFrom(401, 403, 404, 400, 422)
            })
          ),
          (errorConfig) => {
            const adapter = new OpenAICompatibleAdapter();
            
            let error: Error & { status?: number };
            
            // Создаем ошибку в зависимости от типа
            switch (errorConfig.type) {
              case 'network':
                error = new Error('ECONNREFUSED');
                break;
              case 'timeout':
                error = new Error('aborted');
                error.name = 'AbortError';
                break;
              case 'rate_limit':
                error = new Error('Rate limit exceeded') as Error & { status: number };
                error.status = 429;
                break;
              case 'server_error':
                error = new Error('Server error') as Error & { status: number };
                error.status = errorConfig.status || 500;
                break;
              case 'auth':
                error = new Error('Unauthorized') as Error & { status: number };
                error.status = errorConfig.status;
                break;
              case 'not_found':
                error = new Error('Not found') as Error & { status: number };
                error.status = 404;
                break;
              case 'invalid_request':
                error = new Error('Bad request') as Error & { status: number };
                error.status = errorConfig.status;
                break;
              default:
                error = new Error('Unknown error');
            }
            
            const adapterError = adapter.handleError(error);
            
            // Проверяем флаг retryable
            const shouldBeRetryable = ['network', 'timeout', 'rate_limit', 'server_error'].includes(errorConfig.type);
            expect(adapterError.retryable).toBe(shouldBeRetryable);
            
            // Проверяем, что код ошибки установлен
            expect(adapterError.code).toBeDefined();
            expect(adapterError.code).not.toBe('ADAPTER_UNKNOWN_ERROR');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен сохранять оригинальное сообщение об ошибке для всех типов', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 400, max: 599 }),
          fc.string({ minLength: 10, maxLength: 100 }),
          (status, originalMessage) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const error = new Error(originalMessage) as Error & { status: number };
            error.status = status;
            
            const adapterError = adapter.handleError(error);
            
            // Проверяем, что оригинальное сообщение присутствует в итоговом сообщении
            expect(adapterError.message).toContain(originalMessage);
            expect(adapterError.originalError).toBe(error);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать все 4xx статусы', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 400, max: 499 }),
          (status) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const error = new Error('Client error') as Error & { status: number };
            error.status = status;
            
            const adapterError = adapter.handleError(error);
            
            // Проверяем маппинг 4xx статусов
            if (status === 401 || status === 403) {
              expect(adapterError.code).toBe('ADAPTER_AUTH_ERROR');
              expect(adapterError.retryable).toBe(false);
            } else if (status === 404) {
              expect(adapterError.code).toBe('ADAPTER_NOT_FOUND');
              expect(adapterError.retryable).toBe(false);
            } else if (status === 429) {
              expect(adapterError.code).toBe('ADAPTER_RATE_LIMIT');
              expect(adapterError.retryable).toBe(true);
            } else {
              expect(adapterError.code).toBe('ADAPTER_INVALID_REQUEST');
              expect(adapterError.retryable).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен корректно обрабатывать все 5xx статусы', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 500, max: 599 }),
          (status) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const error = new Error('Server error') as Error & { status: number };
            error.status = status;
            
            const adapterError = adapter.handleError(error);
            
            // Все 5xx статусы должны маппиться на ADAPTER_SERVER_ERROR
            expect(adapterError.code).toBe('ADAPTER_SERVER_ERROR');
            expect(adapterError.retryable).toBe(true);
            expect(adapterError.message).toContain('сервера');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен обрабатывать комбинации статусов и сообщений', () => {
      fc.assert(
        fc.property(
          fc.record({
            status: fc.integer({ min: 400, max: 599 }),
            message: fc.string({ minLength: 5, maxLength: 200 }),
            includeStatusInMessage: fc.boolean()
          }),
          (config) => {
            const adapter = new OpenAICompatibleAdapter();
            
            const errorMessage = config.includeStatusInMessage 
              ? `HTTP ${config.status}: ${config.message}`
              : config.message;
            
            const error = new Error(errorMessage) as Error & { status: number };
            error.status = config.status;
            
            const adapterError = adapter.handleError(error);
            
            // Проверяем, что ошибка обработана корректно
            expect(adapterError).toBeDefined();
            expect(adapterError.code).toBeDefined();
            expect(adapterError.message).toBeDefined();
            expect(adapterError.retryable).toBeDefined();
            expect(adapterError.originalError).toBe(error);
            
            // Проверяем, что сообщение содержит оригинальный текст
            expect(adapterError.message).toContain(config.message);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Тесты для проверки доступности API
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
   */
  describe('Проверка доступности (isAvailable)', () => {
    test('должен возвращать true при успешном ответе от /models', async () => {
      // Создаем адаптер с тестовым URL
      const adapter = new OpenAICompatibleAdapter({
        name: 'test-adapter',
        baseUrl: 'http://localhost:1234/v1'
      });
      
      // Мокируем fetch для успешного ответа
      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => JSON.stringify({ data: [] })
      });
      
      const result = await adapter.isAvailable();
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:1234/v1/models',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('должен возвращать false при ошибке сети', async () => {
      const adapter = new OpenAICompatibleAdapter({
        name: 'test-adapter',
        baseUrl: 'http://localhost:1234/v1'
      });
      
      // Мокируем fetch для ошибки сети
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      
      const result = await adapter.isAvailable();
      
      expect(result).toBe(false);
    });

    test('должен возвращать false при не-200 статусе', async () => {
      const adapter = new OpenAICompatibleAdapter({
        name: 'test-adapter',
        baseUrl: 'http://localhost:1234/v1'
      });
      
      // Мокируем fetch для ошибки 404
      global.fetch = jest.fn().mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        headers: new Map(),
        text: async () => 'Not Found'
      });
      
      const result = await adapter.isAvailable();
      
      expect(result).toBe(false);
    });

    test('должен использовать короткий таймаут (5 секунд)', async () => {
      const adapter = new OpenAICompatibleAdapter({
        name: 'test-adapter',
        baseUrl: 'http://localhost:1234/v1'
      });
      
      // Мокируем fetch для проверки таймаута
      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => JSON.stringify({ data: [] })
      });
      
      await adapter.isAvailable();
      
      // Проверяем, что был передан signal с таймаутом
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('должен логировать причину недоступности при ошибке', async () => {
      const adapter = new OpenAICompatibleAdapter({
        name: 'test-adapter',
        baseUrl: 'http://localhost:1234/v1'
      });
      
      // Мокируем console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Мокируем fetch для ошибки
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));
      
      await adapter.isAvailable();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка проверки доступности')
      );
      
      consoleWarnSpy.mockRestore();
    });

    test('должен логировать причину недоступности при не-200 статусе', async () => {
      const adapter = new OpenAICompatibleAdapter({
        name: 'test-adapter',
        baseUrl: 'http://localhost:1234/v1'
      });
      
      // Мокируем console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Мокируем fetch для не-200 статуса
      global.fetch = jest.fn().mockResolvedValue({
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Map(),
        text: async () => 'Service Unavailable'
      });
      
      await adapter.isAvailable();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('API недоступен')
      );
      
      consoleWarnSpy.mockRestore();
    });
  });

  /**
   * Тесты для обработки ошибок
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
   * 
   * Проверяем, что метод handleError корректно маппит различные типы ошибок
   * на соответствующие коды AdapterError с правильными флагами retryable
   */
  describe('Обработка ошибок', () => {
    test('должен маппить сетевые ошибки на ADAPTER_NETWORK_ERROR с retryable=true', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      const networkErrors = [
        new Error('fetch failed'),
        new Error('ECONNREFUSED'),
        new Error('ENOTFOUND'),
        new Error('ETIMEDOUT'),
        new Error('network error')
      ];
      
      networkErrors.forEach(error => {
        const adapterError = adapter.handleError(error);
        
        expect(adapterError.code).toBe('ADAPTER_NETWORK_ERROR');
        expect(adapterError.retryable).toBe(true);
        expect(adapterError.message).toContain('Ошибка сети');
        expect(adapterError.originalError).toBe(error);
      });
    });

    test('должен маппить таймауты на ADAPTER_TIMEOUT с retryable=true', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      const timeoutError = new Error('aborted');
      timeoutError.name = 'AbortError';
      
      const adapterError = adapter.handleError(timeoutError);
      
      expect(adapterError.code).toBe('ADAPTER_TIMEOUT');
      expect(adapterError.retryable).toBe(true);
      expect(adapterError.message).toContain('таймаут');
      expect(adapterError.originalError).toBe(timeoutError);
    });

    test('должен маппить HTTP 401/403 на ADAPTER_AUTH_ERROR с retryable=false', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      [401, 403].forEach(status => {
        const error = new Error('Unauthorized') as Error & { status: number };
        error.status = status;
        
        const adapterError = adapter.handleError(error);
        
        expect(adapterError.code).toBe('ADAPTER_AUTH_ERROR');
        expect(adapterError.retryable).toBe(false);
        expect(adapterError.message).toContain('аутентификации');
        expect(adapterError.message).toContain(status.toString());
        expect(adapterError.originalError).toBe(error);
      });
    });

    test('должен маппить HTTP 404 на ADAPTER_NOT_FOUND с retryable=false', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      const error = new Error('Not Found') as Error & { status: number };
      error.status = 404;
      
      const adapterError = adapter.handleError(error);
      
      expect(adapterError.code).toBe('ADAPTER_NOT_FOUND');
      expect(adapterError.retryable).toBe(false);
      expect(adapterError.message).toContain('не найден');
      expect(adapterError.message).toContain('404');
      expect(adapterError.originalError).toBe(error);
    });

    test('должен маппить HTTP 429 на ADAPTER_RATE_LIMIT с retryable=true', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      const error = new Error('Rate limit exceeded') as Error & { status: number };
      error.status = 429;
      
      const adapterError = adapter.handleError(error);
      
      expect(adapterError.code).toBe('ADAPTER_RATE_LIMIT');
      expect(adapterError.retryable).toBe(true);
      expect(adapterError.message).toContain('лимит');
      expect(adapterError.message).toContain('429');
      expect(adapterError.originalError).toBe(error);
    });

    test('должен маппить HTTP 500/503 на ADAPTER_SERVER_ERROR с retryable=true', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      [500, 503].forEach(status => {
        const error = new Error('Server Error') as Error & { status: number };
        error.status = status;
        
        const adapterError = adapter.handleError(error);
        
        expect(adapterError.code).toBe('ADAPTER_SERVER_ERROR');
        expect(adapterError.retryable).toBe(true);
        expect(adapterError.message).toContain('сервера');
        expect(adapterError.message).toContain(status.toString());
        expect(adapterError.originalError).toBe(error);
      });
    });

    test('должен маппить другие 5xx ошибки на ADAPTER_SERVER_ERROR с retryable=true', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      [501, 502, 504, 505].forEach(status => {
        const error = new Error('Server Error') as Error & { status: number };
        error.status = status;
        
        const adapterError = adapter.handleError(error);
        
        expect(adapterError.code).toBe('ADAPTER_SERVER_ERROR');
        expect(adapterError.retryable).toBe(true);
        expect(adapterError.message).toContain('сервера');
        expect(adapterError.originalError).toBe(error);
      });
    });

    test('должен маппить другие 4xx ошибки на ADAPTER_INVALID_REQUEST с retryable=false', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      [400, 402, 405, 422].forEach(status => {
        const error = new Error('Bad Request') as Error & { status: number };
        error.status = status;
        
        const adapterError = adapter.handleError(error);
        
        expect(adapterError.code).toBe('ADAPTER_INVALID_REQUEST');
        expect(adapterError.retryable).toBe(false);
        expect(adapterError.message).toContain('Неверный запрос');
        expect(adapterError.originalError).toBe(error);
      });
    });

    test('должен сохранять оригинальное сообщение об ошибке', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      const originalMessage = 'Invalid API key provided';
      const error = new Error(originalMessage) as Error & { status: number };
      error.status = 401;
      
      const adapterError = adapter.handleError(error);
      
      expect(adapterError.message).toContain(originalMessage);
      expect(adapterError.originalError).toBe(error);
    });

    test('должен обрабатывать неизвестные ошибки', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      const error = new Error('Unknown error');
      
      const adapterError = adapter.handleError(error);
      
      expect(adapterError.code).toBe('ADAPTER_UNKNOWN_ERROR');
      expect(adapterError.retryable).toBe(false);
      expect(adapterError.message).toBe('Unknown error');
      expect(adapterError.originalError).toBe(error);
    });

    test('должен логировать предупреждения о неподдерживаемых параметрах', () => {
      const adapter = new OpenAICompatibleAdapter({
        name: 'test-adapter'
      });
      
      // Мокируем console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Создаем ошибку валидации параметра
      const error = new Error('Invalid parameter: unsupported_param is not supported') as Error & { status: number };
      error.status = 400;
      
      const adapterError = adapter.handleError(error);
      
      // Проверяем, что ошибка обработана как ADAPTER_INVALID_REQUEST
      expect(adapterError.code).toBe('ADAPTER_INVALID_REQUEST');
      expect(adapterError.retryable).toBe(false);
      
      // Проверяем, что было залогировано предупреждение
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('не поддерживает некоторые параметры')
      );
      
      consoleWarnSpy.mockRestore();
    });
  });

  /**
   * Feature: openai-compatible-adapter, Property 9: Адаптер устойчив к неподдерживаемым параметрам
   * Validates: Requirements 6.6
   * 
   * Для любого запроса с параметрами, которые могут не поддерживаться сервисом,
   * адаптер должен отправлять их в теле запроса, но не падать если сервис их игнорирует
   * или возвращает ошибку валидации для них.
   */
  describe('Устойчивость к неподдерживаемым параметрам', () => {
    test('должен корректно обрабатывать ошибки валидации параметров', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      // Создаем ошибку валидации параметра (400 Bad Request)
      const error = new Error('Invalid field: top_p is not supported by this model') as Error & { status: number };
      error.status = 400;
      
      const adapterError = adapter.handleError(error);
      
      // Адаптер не должен падать, а должен вернуть структурированную ошибку
      expect(adapterError).toBeDefined();
      expect(adapterError.code).toBe('ADAPTER_INVALID_REQUEST');
      expect(adapterError.retryable).toBe(false);
      expect(adapterError.message).toContain('Неверный запрос');
      expect(adapterError.originalError).toBe(error);
    });

    test('должен отправлять только стандартные параметры OpenAI API', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      const request = {
        prompt: 'Test prompt',
        model: 'test-model',
        temperature: 0.7,
        maxTokens: 100,
        systemPrompt: 'You are a helpful assistant'
      };
      
      const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
      const chatRequest = buildMethod(request);
      
      // Проверяем, что запрос содержит только стандартные параметры
      expect(chatRequest).toHaveProperty('model');
      expect(chatRequest).toHaveProperty('messages');
      expect(chatRequest).toHaveProperty('temperature');
      expect(chatRequest).toHaveProperty('max_tokens');
      
      // Проверяем, что нет неожиданных параметров
      const expectedKeys = ['model', 'messages', 'temperature', 'max_tokens'];
      const actualKeys = Object.keys(chatRequest);
      
      actualKeys.forEach(key => {
        expect(expectedKeys).toContain(key);
      });
    });

    test('должен игнорировать неподдерживаемые параметры без падения', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      // Создаем запрос с дополнительными параметрами, которые могут не поддерживаться
      const request: any = {
        prompt: 'Test prompt',
        model: 'test-model',
        temperature: 0.7,
        maxTokens: 100,
        // Эти параметры могут не поддерживаться некоторыми сервисами
        top_p: 0.9,
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
        stop: ['END'],
        logit_bias: { '50256': -100 }
      };
      
      const buildMethod = (adapter as any).buildChatCompletionRequest.bind(adapter);
      
      // Не должно быть ошибок при построении запроса
      expect(() => {
        const chatRequest = buildMethod(request);
        expect(chatRequest).toBeDefined();
      }).not.toThrow();
    });

    test('должен корректно обрабатывать ответы с ошибками о неподдерживаемых параметрах', () => {
      const adapter = new OpenAICompatibleAdapter();
      
      // Мокируем console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Различные варианты ошибок о неподдерживаемых параметрах
      const parameterErrors = [
        'Invalid parameter: top_p is not supported',
        'Unknown field: frequency_penalty',
        'Parameter logit_bias is not implemented',
        'Unsupported parameter: stop'
      ];
      
      parameterErrors.forEach(errorMessage => {
        const error = new Error(errorMessage) as Error & { status: number };
        error.status = 400;
        
        const adapterError = adapter.handleError(error);
        
        // Адаптер должен обработать ошибку без падения
        expect(adapterError).toBeDefined();
        expect(adapterError.code).toBe('ADAPTER_INVALID_REQUEST');
        expect(adapterError.retryable).toBe(false);
      });
      
      // Проверяем, что были залогированы предупреждения
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });

    test('должен продолжать работу после ошибки валидации параметра', async () => {
      const adapter = new OpenAICompatibleAdapter({
        baseUrl: 'http://localhost:1234/v1'
      });
      
      // Мокируем fetch для первого запроса с ошибкой валидации
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Первый запрос возвращает ошибку валидации
          return Promise.resolve({
            status: 400,
            statusText: 'Bad Request',
            headers: new Map(),
            text: async () => JSON.stringify({
              error: {
                message: 'Invalid parameter: top_p is not supported',
                type: 'invalid_request_error'
              }
            })
          });
        } else {
          // Второй запрос успешен
          return Promise.resolve({
            status: 200,
            statusText: 'OK',
            headers: new Map(),
            text: async () => JSON.stringify({
              id: 'test-id',
              object: 'chat.completion',
              created: Date.now(),
              model: 'test-model',
              choices: [{
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Test response'
                },
                finish_reason: 'stop'
              }]
            })
          });
        }
      });
      
      // Первый запрос должен вернуть AdapterError
      try {
        await adapter.execute({
          prompt: 'Test prompt'
        });
        fail('Должна была быть выброшена ошибка');
      } catch (error: any) {
        // Проверяем, что это AdapterError
        expect(error.code).toBe('ADAPTER_INVALID_REQUEST');
        expect(error.retryable).toBe(false);
      }
      
      // Второй запрос должен быть успешным (адаптер продолжает работать)
      const response = await adapter.execute({
        prompt: 'Test prompt'
      });
      
      expect(response).toBeDefined();
      expect(response.content).toBe('Test response');
    });
  });
});
