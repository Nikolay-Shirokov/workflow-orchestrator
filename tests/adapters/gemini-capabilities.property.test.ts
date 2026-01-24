/**
 * Property-based тесты для capabilities в Gemini CLI адаптере
 *
 * Проверяют:
 * - Маппинг capabilities на инструменты для --allowed-tools
 * - Объединение capabilities с permissions
 * - Корректность предупреждений для неподдерживаемых capabilities
 */

import * as fc from 'fast-check';
import { GeminiCLIAdapter } from '../../src/adapters/gemini-cli-adapter.js';
import { StepCapabilities, AdapterRequest, StepPermissions, CapabilitySupport } from '../../src/core/types.js';

/**
 * Тестовый адаптер с публичными методами для тестирования
 */
class TestableGeminiCLIAdapter extends GeminiCLIAdapter {
  public testPrepareArguments(request: AdapterRequest): string[] {
    return this.prepareArguments(request);
  }

  public testMapCapabilitiesToTools(capabilities: StepCapabilities): string[] {
    return this.mapCapabilitiesToTools(capabilities);
  }

  public testMapPermissionsToArgs(permissions?: StepPermissions): string[] {
    return this.mapPermissionsToArgs(permissions);
  }

  public testGetCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport> {
    return this.getCapabilitySupport();
  }
}

describe('Gemini CLI Adapter Capabilities Property Tests', () => {
  let adapter: TestableGeminiCLIAdapter;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    adapter = new TestableGeminiCLIAdapter();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  /**
   * Property 1: web_search: true должен добавлять google_web_search
   */
  describe('Property 1: web_search → google_web_search', () => {
    it('при web_search: true должен добавлять google_web_search в --allowed-tools', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.constant(true),
            web_fetch: fc.boolean(),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.boolean()
          }),
          (capabilities) => {
            const tools = adapter.testMapCapabilitiesToTools(capabilities);

            expect(tools).toContain('google_web_search');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('при web_search: false не должен добавлять google_web_search', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.constant(false),
            web_fetch: fc.boolean(),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.boolean()
          }),
          (capabilities) => {
            const tools = adapter.testMapCapabilitiesToTools(capabilities);

            expect(tools).not.toContain('google_web_search');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 2: web_fetch: true должен добавлять web_fetch
   */
  describe('Property 2: web_fetch → web_fetch', () => {
    it('при web_fetch: true должен добавлять web_fetch в инструменты', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.boolean(),
            web_fetch: fc.constant(true),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.boolean()
          }),
          (capabilities) => {
            const tools = adapter.testMapCapabilitiesToTools(capabilities);

            expect(tools).toContain('web_fetch');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 3: web_search + write должен объединять tools и добавлять --yolo
   */
  describe('Property 3: web_search + write → объединение tools + --yolo', () => {
    it('при web_search + write должен объединять все tools и добавлять --yolo', () => {
      fc.assert(
        fc.property(
          // Генерируем валидные паттерны записи (без path traversal)
          fc.array(
            fc.stringMatching(/^[a-zA-Z0-9_\-\.\/\*]+$/).filter(s => !s.includes('..') && s.length > 0),
            { minLength: 1, maxLength: 3 }
          ),
          (writePatterns) => {
            const permissions: StepPermissions = {
              write: writePatterns,
              capabilities: {
                web_search: true
              }
            };

            // Используем prepareArguments с полным request для корректной обработки capabilities
            const request: AdapterRequest = {
              prompt: 'Test prompt',
              permissions
            };

            const args = adapter.testPrepareArguments(request);
            const argsStr = args.join(' ');

            // Должен содержать write_file
            expect(argsStr).toContain('write_file');

            // Должен содержать google_web_search
            expect(argsStr).toContain('google_web_search');

            // Должен содержать --yolo (потому что есть tools)
            expect(args).toContain('--yolo');
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 4: mcp_tools должен логировать информацию
   */
  describe('Property 4: mcp_tools → логирование', () => {
    it('при mcp_tools: true должен логировать информацию', () => {
      const capabilities: StepCapabilities = {
        mcp_tools: true
      };

      adapter.testMapCapabilitiesToTools(capabilities);

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls.find(
        call => call[0].includes('MCP')
      );
      expect(logCall).toBeDefined();
    });

    it('при mcp_tools массиве должен логировать информацию', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), {
            minLength: 1,
            maxLength: 5
          }),
          (mcpTools) => {
            consoleLogSpy.mockClear();

            const capabilities: StepCapabilities = {
              mcp_tools: mcpTools
            };

            adapter.testMapCapabilitiesToTools(capabilities);

            expect(consoleLogSpy).toHaveBeenCalled();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 5: browser: true должен логировать предупреждение
   */
  describe('Property 5: browser → warning', () => {
    it('при browser: true должен выводить предупреждение', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.boolean(),
            web_fetch: fc.boolean(),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.constant(true)
          }),
          (capabilities) => {
            consoleWarnSpy.mockClear();

            adapter.testMapCapabilitiesToTools(capabilities);

            const warnCall = consoleWarnSpy.mock.calls.find(
              call => call[0].includes('browser') && call[0].includes('не поддерживается')
            );
            expect(warnCall).toBeDefined();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 6: getCapabilitySupport должен корректно описывать поддержку
   */
  describe('Property 6: getCapabilitySupport', () => {
    it('должен корректно описывать поддерживаемые capabilities', () => {
      const support = adapter.testGetCapabilitySupport();

      // web_search поддерживается
      expect(support.web_search.supported).toBe(true);
      expect(support.web_search.flags).toContain('google_web_search');

      // web_fetch поддерживается
      expect(support.web_fetch.supported).toBe(true);
      expect(support.web_fetch.flags).toContain('web_fetch');

      // mcp_tools поддерживается (через settings.json)
      expect(support.mcp_tools.supported).toBe(true);

      // browser НЕ поддерживается
      expect(support.browser.supported).toBe(false);
    });
  });

  /**
   * Property 7: --yolo добавляется только при наличии tools
   */
  describe('Property 7: --yolo только при наличии tools', () => {
    it('без write/execute/capabilities не должен добавлять --yolo', () => {
      const request: AdapterRequest = {
        prompt: 'Test prompt',
        permissions: {
          read: ['src/**/*']
        }
      };

      const args = adapter.testPrepareArguments(request);

      expect(args).not.toContain('--yolo');
    });

    it('при capabilities без write должен добавлять --yolo', () => {
      const request: AdapterRequest = {
        prompt: 'Test prompt',
        permissions: {
          read: ['src/**/*'],
          capabilities: {
            web_search: true
          }
        }
      };

      const args = adapter.testPrepareArguments(request);
      const argsStr = args.join(' ');

      // google_web_search должен быть в --allowed-tools
      expect(argsStr).toContain('google_web_search');

      // --yolo должен быть добавлен
      expect(args).toContain('--yolo');
    });
  });

  /**
   * Property 8: Инструменты не дублируются
   */
  describe('Property 8: Нет дубликатов инструментов', () => {
    it('инструменты не должны дублироваться', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.boolean(),
            web_fetch: fc.boolean()
          }),
          (capabilitiesFlags) => {
            const capabilities: StepCapabilities = {
              ...capabilitiesFlags
            };

            const tools = adapter.testMapCapabilitiesToTools(capabilities);

            // Проверяем уникальность
            const uniqueTools = [...new Set(tools)];
            expect(tools.length).toBe(uniqueTools.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 9: Интеграция с prepareArguments
   */
  describe('Property 9: Интеграция с prepareArguments', () => {
    it('capabilities должны интегрироваться в полный набор аргументов', () => {
      const permissions: StepPermissions = {
        write: ['docs/**/*.md'],
        capabilities: {
          web_search: true,
          web_fetch: true
        }
      };

      const request: AdapterRequest = {
        prompt: 'Test prompt',
        permissions
      };

      const args = adapter.testPrepareArguments(request);
      const argsStr = args.join(' ');

      // Должен содержать инструменты записи
      expect(argsStr).toContain('write_file');

      // Должен содержать web capabilities
      expect(argsStr).toContain('google_web_search');
      expect(argsStr).toContain('web_fetch');

      // Должен содержать --yolo
      expect(args).toContain('--yolo');
    });
  });
});
