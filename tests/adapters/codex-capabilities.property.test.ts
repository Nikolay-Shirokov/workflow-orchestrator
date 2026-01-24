/**
 * Property-based тесты для capabilities в Codex CLI адаптере
 *
 * Проверяют:
 * - Маппинг capabilities на CLI флаги
 * - Корректность предупреждений для неподдерживаемых capabilities
 */

import * as fc from 'fast-check';
import { CodexCLIAdapter } from '../../src/adapters/codex-cli-adapter.js';
import { StepCapabilities, AdapterRequest, StepPermissions, CapabilitySupport } from '../../src/core/types.js';

/**
 * Тестовый адаптер с публичными методами для тестирования
 */
class TestableCodexCLIAdapter extends CodexCLIAdapter {
  public testPrepareArguments(request: AdapterRequest): string[] {
    return this.prepareArguments(request);
  }

  public testMapCapabilitiesToArgs(capabilities: StepCapabilities): string[] {
    return this.mapCapabilitiesToArgs(capabilities);
  }

  public testGetCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport> {
    return this.getCapabilitySupport();
  }
}

describe('Codex CLI Adapter Capabilities Property Tests', () => {
  let adapter: TestableCodexCLIAdapter;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    adapter = new TestableCodexCLIAdapter();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  /**
   * Property 1: web_search: true должен добавлять флаг --search
   */
  describe('Property 1: web_search → --search', () => {
    it('при web_search: true должен добавлять --search', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.constant(true),
            web_fetch: fc.boolean(),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.boolean()
          }),
          (capabilities) => {
            const args = adapter.testMapCapabilitiesToArgs(capabilities);

            expect(args).toContain('--search');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('при web_search: false не должен добавлять --search', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.constant(false),
            web_fetch: fc.boolean(),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.boolean()
          }),
          (capabilities) => {
            const args = adapter.testMapCapabilitiesToArgs(capabilities);

            expect(args).not.toContain('--search');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 2: mcp_tools должен логировать информацию (не добавлять флаги)
   */
  describe('Property 2: mcp_tools → логирование', () => {
    it('при mcp_tools: true должен логировать информацию', () => {
      const capabilities: StepCapabilities = {
        mcp_tools: true
      };

      adapter.testMapCapabilitiesToArgs(capabilities);

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls.find(
        call => call[0].includes('MCP-инструменты')
      );
      expect(logCall).toBeDefined();
    });

    it('при mcp_tools массиве должен логировать список инструментов', () => {
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

            const args = adapter.testMapCapabilitiesToArgs(capabilities);

            // mcp_tools не добавляет аргументы в Codex
            expect(args.filter(a => a.includes('mcp')).length).toBe(0);

            // Но должен логировать
            expect(consoleLogSpy).toHaveBeenCalled();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 3: browser: true должен логировать предупреждение
   */
  describe('Property 3: browser → warning', () => {
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

            adapter.testMapCapabilitiesToArgs(capabilities);

            // Должен вывести предупреждение о browser
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
   * Property 4: web_fetch: true должен логировать предупреждение
   */
  describe('Property 4: web_fetch → warning', () => {
    it('при web_fetch: true должен выводить предупреждение', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.boolean(),
            web_fetch: fc.constant(true),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.boolean()
          }),
          (capabilities) => {
            consoleWarnSpy.mockClear();

            adapter.testMapCapabilitiesToArgs(capabilities);

            // Должен вывести предупреждение о web_fetch
            const warnCall = consoleWarnSpy.mock.calls.find(
              call => call[0].includes('web_fetch') && call[0].includes('не поддерживается')
            );
            expect(warnCall).toBeDefined();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 5: getCapabilitySupport должен корректно описывать поддержку
   */
  describe('Property 5: getCapabilitySupport', () => {
    it('должен корректно описывать поддерживаемые capabilities', () => {
      const support = adapter.testGetCapabilitySupport();

      // web_search поддерживается
      expect(support.web_search.supported).toBe(true);
      expect(support.web_search.flags).toContain('--search');

      // mcp_tools поддерживается (через codex mcp)
      expect(support.mcp_tools.supported).toBe(true);

      // web_fetch НЕ поддерживается
      expect(support.web_fetch.supported).toBe(false);

      // browser НЕ поддерживается
      expect(support.browser.supported).toBe(false);
    });
  });

  /**
   * Property 6: Интеграция capabilities с prepareArguments
   */
  describe('Property 6: Интеграция с prepareArguments', () => {
    it('capabilities должны интегрироваться с permissions', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (webSearch) => {
            const permissions: StepPermissions = {
              read: ['src/**/*'],
              capabilities: {
                web_search: webSearch
              }
            };

            const request: AdapterRequest = {
              prompt: 'Test prompt',
              permissions
            };

            const args = adapter.testPrepareArguments(request);
            const argsStr = args.join(' ');

            if (webSearch) {
              expect(argsStr).toContain('--search');
            } else {
              expect(argsStr).not.toContain('--search');
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 7: --search не должен дублироваться
   */
  describe('Property 7: Нет дубликатов флагов', () => {
    it('--search не должен дублироваться при множественных вызовах', () => {
      const capabilities: StepCapabilities = {
        web_search: true
      };

      const permissions: StepPermissions = {
        read: ['**/*'],
        capabilities
      };

      const request: AdapterRequest = {
        prompt: 'Test prompt',
        permissions
      };

      const args = adapter.testPrepareArguments(request);

      // Считаем количество --search
      const searchCount = args.filter(arg => arg === '--search').length;
      expect(searchCount).toBeLessThanOrEqual(1);
    });
  });
});
