/**
 * Property-based тесты для capabilities в Claude CLI адаптере
 *
 * Проверяют:
 * - Маппинг capabilities на CLI флаги и инструменты
 * - Корректность обработки комбинаций capabilities
 */

import * as fc from 'fast-check';
import { ClaudeCLIAdapter } from '../../src/adapters/claude-cli-adapter.js';
import { StepCapabilities, AdapterRequest, StepPermissions } from '../../src/core/types.js';

/**
 * Тестовый адаптер с публичными методами для тестирования
 */
class TestableClaudeCLIAdapter extends ClaudeCLIAdapter {
  public testPrepareArguments(request: AdapterRequest): string[] {
    return this.prepareArguments(request);
  }

  public testMapCapabilitiesToToolsAndFlags(capabilities: StepCapabilities): {
    tools: string[];
    allowedTools: string[];
    flags: string[];
  } {
    return this.mapCapabilitiesToToolsAndFlags(capabilities);
  }

  public testGetCapabilitySupport() {
    return this.getCapabilitySupport();
  }
}

describe('Claude CLI Adapter Capabilities Property Tests', () => {
  let adapter: TestableClaudeCLIAdapter;

  beforeEach(() => {
    adapter = new TestableClaudeCLIAdapter();
  });

  /**
   * Property 1: browser: true должен добавлять флаг --chrome
   */
  describe('Property 1: browser → --chrome', () => {
    it('при browser: true должен добавлять --chrome в flags', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.boolean(),
            web_fetch: fc.boolean(),
            mcp_tools: fc.oneof(
              fc.boolean(),
              fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 })
            ),
            browser: fc.constant(true)  // Всегда true для этого теста
          }),
          (capabilities) => {
            const result = adapter.testMapCapabilitiesToToolsAndFlags(capabilities);

            // browser: true → --chrome должен быть в flags
            expect(result.flags).toContain('--chrome');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('при browser: false или undefined не должен добавлять --chrome', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.boolean(),
            web_fetch: fc.boolean(),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.oneof(fc.constant(false), fc.constant(undefined))
          }),
          (capabilities) => {
            const result = adapter.testMapCapabilitiesToToolsAndFlags(capabilities);

            expect(result.flags).not.toContain('--chrome');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 2: web_search: true должен добавлять WebSearch в tools и allowedTools
   */
  describe('Property 2: web_search → WebSearch', () => {
    it('при web_search: true должен добавлять WebSearch', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.constant(true),
            web_fetch: fc.boolean(),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.boolean()
          }),
          (capabilities) => {
            const result = adapter.testMapCapabilitiesToToolsAndFlags(capabilities);

            expect(result.tools).toContain('WebSearch');
            expect(result.allowedTools).toContain('WebSearch');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('при web_search: false не должен добавлять WebSearch', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.constant(false),
            web_fetch: fc.boolean(),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.boolean()
          }),
          (capabilities) => {
            const result = adapter.testMapCapabilitiesToToolsAndFlags(capabilities);

            expect(result.tools).not.toContain('WebSearch');
            expect(result.allowedTools).not.toContain('WebSearch');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 3: web_fetch: true должен добавлять WebFetch в tools и allowedTools
   */
  describe('Property 3: web_fetch → WebFetch', () => {
    it('при web_fetch: true должен добавлять WebFetch', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.boolean(),
            web_fetch: fc.constant(true),
            mcp_tools: fc.oneof(fc.boolean(), fc.array(fc.string(), { maxLength: 3 })),
            browser: fc.boolean()
          }),
          (capabilities) => {
            const result = adapter.testMapCapabilitiesToToolsAndFlags(capabilities);

            expect(result.tools).toContain('WebFetch');
            expect(result.allowedTools).toContain('WebFetch');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 4: mcp_tools массив должен добавляться в allowedTools
   */
  describe('Property 4: mcp_tools массив → allowedTools', () => {
    it('при mcp_tools массиве должен добавлять элементы в allowedTools', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes(',') && s.trim().length > 0), {
            minLength: 1,
            maxLength: 5
          }),
          (mcpTools) => {
            const capabilities: StepCapabilities = {
              mcp_tools: mcpTools
            };

            const result = adapter.testMapCapabilitiesToToolsAndFlags(capabilities);

            // Каждый инструмент из массива должен быть в allowedTools
            for (const tool of mcpTools) {
              expect(result.allowedTools).toContain(tool);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('при mcp_tools: true не должен добавлять конкретные инструменты', () => {
      const capabilities: StepCapabilities = {
        mcp_tools: true
      };

      const result = adapter.testMapCapabilitiesToToolsAndFlags(capabilities);

      // mcp_tools: true не добавляет конкретные инструменты
      // (все MCP разрешены без ограничений)
      expect(result.allowedTools.length).toBe(0);
      expect(result.tools.length).toBe(0);
    });
  });

  /**
   * Property 5: getCapabilitySupport должен возвращать корректные значения
   */
  describe('Property 5: getCapabilitySupport', () => {
    it('должен сообщать о поддержке всех capabilities', () => {
      const support = adapter.testGetCapabilitySupport();

      expect(support.web_search.supported).toBe(true);
      expect(support.web_fetch.supported).toBe(true);
      expect(support.mcp_tools.supported).toBe(true);
      expect(support.browser.supported).toBe(true);
      expect(support.browser.flags).toContain('--chrome');
    });
  });

  /**
   * Property 6: Комбинация capabilities + permissions должна корректно объединяться
   */
  describe('Property 6: Интеграция capabilities с permissions', () => {
    it('capabilities должны добавлять инструменты к permissions', () => {
      fc.assert(
        fc.property(
          fc.record({
            web_search: fc.boolean(),
            web_fetch: fc.boolean(),
            browser: fc.boolean()
          }),
          (capabilities) => {
            const permissions: StepPermissions = {
              write: ['docs/**/*.md'],
              capabilities
            };

            const request: AdapterRequest = {
              prompt: 'Test prompt',
              permissions
            };

            const args = adapter.testPrepareArguments(request);
            const argsStr = args.join(' ');

            // Если write указан, должен быть Write в tools
            expect(argsStr).toContain('--tools');

            // Проверяем наличие capabilities-инструментов
            if (capabilities.web_search) {
              expect(argsStr).toContain('WebSearch');
            }
            if (capabilities.web_fetch) {
              expect(argsStr).toContain('WebFetch');
            }
            if (capabilities.browser) {
              expect(argsStr).toContain('--chrome');
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 7: Capabilities не должны дублироваться при повторном указании
   */
  describe('Property 7: Нет дубликатов инструментов', () => {
    it('инструменты не должны дублироваться', () => {
      const capabilities: StepCapabilities = {
        web_search: true,
        web_fetch: true
      };

      const result = adapter.testMapCapabilitiesToToolsAndFlags(capabilities);

      // Проверяем уникальность
      const uniqueTools = [...new Set(result.tools)];
      const uniqueAllowedTools = [...new Set(result.allowedTools)];

      expect(result.tools.length).toBe(uniqueTools.length);
      expect(result.allowedTools.length).toBe(uniqueAllowedTools.length);
    });
  });
});
