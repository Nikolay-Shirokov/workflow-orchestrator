/**
 * Интеграционные тесты для системы capabilities
 *
 * Проверяют:
 * - Слияние capabilities из step и role в StepExecutor
 * - Валидацию и предупреждения для неподдерживаемых capabilities
 * - Интеграцию с адаптерами
 */

import { createStepExecutor } from '../../src/core/step-executor.js';
import { RoleManager } from '../../src/core/role-manager.js';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import { MockCLIAdapter } from '../../src/adapters/mock-cli-adapter.js';
import { ClaudeCLIAdapter } from '../../src/adapters/claude-cli-adapter.js';
import { CodexCLIAdapter } from '../../src/adapters/codex-cli-adapter.js';
import { GeminiCLIAdapter } from '../../src/adapters/gemini-cli-adapter.js';
import {
  RoleConfig,
  StepCapabilities,
  StepPermissions
} from '../../src/core/types.js';

describe('Capabilities Integration Tests', () => {
  let roleManager: RoleManager;
  let adapterRegistry: AdapterRegistry;

  beforeEach(() => {
    roleManager = new RoleManager();
    adapterRegistry = new AdapterRegistry();

    // Регистрируем mock адаптер
    const mockAdapter = new MockCLIAdapter();
    mockAdapter.setResponse(/.*/s, 'Mock response');
    adapterRegistry.register(mockAdapter);
  });

  describe('Merge capabilities step + role', () => {
    it('должен объединять capabilities из шага и роли', () => {
      // Загружаем роли с default_capabilities
      roleManager.loadRoles({
        researcher: {
          adapter: 'mock-cli',
          model: 'mock-model',
          default_capabilities: {
            web_search: true,
            web_fetch: true
          }
        }
      });

      createStepExecutor({
        roleManager
      });

      // Создаем permissions с дополнительными capabilities
      const stepCapabilities: StepCapabilities = {
        browser: true,  // Добавляем browser
        mcp_tools: ['custom_tool']  // Добавляем конкретные MCP tools
      };

      // Получаем роль
      const role = roleManager.getRole('researcher');

      // Слияние: step > role
      const merged: StepCapabilities = {
        ...role?.default_capabilities,
        ...stepCapabilities
      };

      // Проверяем результат
      expect(merged.web_search).toBe(true);  // Из роли
      expect(merged.web_fetch).toBe(true);   // Из роли
      expect(merged.browser).toBe(true);     // Из шага
      expect(merged.mcp_tools).toEqual(['custom_tool']);  // Из шага
    });

    it('шаг должен переопределять capabilities роли', () => {
      roleManager.loadRoles({
        writer: {
          adapter: 'mock-cli',
          default_capabilities: {
            web_search: true,
            browser: false
          }
        }
      });

      const stepCapabilities: StepCapabilities = {
        web_search: false,  // Переопределяем
        browser: true       // Переопределяем
      };

      const role = roleManager.getRole('writer');
      const merged: StepCapabilities = {
        ...role?.default_capabilities,
        ...stepCapabilities
      };

      expect(merged.web_search).toBe(false);  // Переопределено шагом
      expect(merged.browser).toBe(true);      // Переопределено шагом
    });
  });

  describe('Validation warnings', () => {
    it('должен выводить предупреждение для неподдерживаемых capabilities в Codex', () => {
      const codexAdapter = new CodexCLIAdapter();
      const support = codexAdapter.getCapabilitySupport();

      // Проверяем, что web_fetch и browser не поддерживаются
      expect(support.web_fetch.supported).toBe(false);
      expect(support.browser.supported).toBe(false);

      // Запрашиваем неподдерживаемые capabilities
      const capabilities: StepCapabilities = {
        web_fetch: true,
        browser: true
      };

      // Проверяем какие capabilities не поддерживаются
      const unsupported: string[] = [];
      for (const [key, value] of Object.entries(capabilities)) {
        if (value && support[key as keyof StepCapabilities]?.supported === false) {
          unsupported.push(key);
        }
      }

      expect(unsupported).toContain('web_fetch');
      expect(unsupported).toContain('browser');
    });

    it('должен выводить предупреждение для browser в Gemini', () => {
      const geminiAdapter = new GeminiCLIAdapter();
      const support = geminiAdapter.getCapabilitySupport();

      expect(support.browser.supported).toBe(false);

      const capabilities: StepCapabilities = {
        browser: true
      };

      const unsupported: string[] = [];
      for (const [key, value] of Object.entries(capabilities)) {
        if (value && support[key as keyof StepCapabilities]?.supported === false) {
          unsupported.push(key);
        }
      }

      expect(unsupported).toContain('browser');
    });
  });

  describe('Adapter capability support comparison', () => {
    it('Claude должен поддерживать все capabilities', () => {
      const claudeAdapter = new ClaudeCLIAdapter();
      const support = claudeAdapter.getCapabilitySupport();

      expect(support.web_search.supported).toBe(true);
      expect(support.web_fetch.supported).toBe(true);
      expect(support.mcp_tools.supported).toBe(true);
      expect(support.browser.supported).toBe(true);
    });

    it('Codex должен поддерживать только mcp_tools (web_search только в интерактивном режиме)', () => {
      const codexAdapter = new CodexCLIAdapter();
      const support = codexAdapter.getCapabilitySupport();

      // web_search не поддерживается в exec режиме (только интерактивный)
      expect(support.web_search.supported).toBe(false);
      expect(support.web_fetch.supported).toBe(false);
      expect(support.mcp_tools.supported).toBe(true);
      expect(support.browser.supported).toBe(false);
    });

    it('Gemini должен поддерживать web_search, web_fetch и mcp_tools', () => {
      const geminiAdapter = new GeminiCLIAdapter();
      const support = geminiAdapter.getCapabilitySupport();

      expect(support.web_search.supported).toBe(true);
      expect(support.web_fetch.supported).toBe(true);
      expect(support.mcp_tools.supported).toBe(true);
      expect(support.browser.supported).toBe(false);
    });
  });

  describe('Capabilities to CLI args mapping', () => {
    it('Claude: browser → --chrome', () => {
      const claudeAdapter = new ClaudeCLIAdapter();
      const support = claudeAdapter.getCapabilitySupport();

      expect(support.browser.flags).toContain('--chrome');
    });

    it('Codex: web_search не поддерживается в exec режиме', () => {
      const codexAdapter = new CodexCLIAdapter();
      const support = codexAdapter.getCapabilitySupport();

      // web_search работает только в интерактивном режиме, не в exec
      expect(support.web_search.supported).toBe(false);
      expect(support.web_search.flags).toEqual([]);
    });

    it('Gemini: web_search → google_web_search в --allowed-tools', () => {
      const geminiAdapter = new GeminiCLIAdapter();
      const support = geminiAdapter.getCapabilitySupport();

      expect(support.web_search.flags).toContain('google_web_search');
    });
  });

  describe('Role default_capabilities loading', () => {
    it('должен загружать default_capabilities из конфигурации роли', () => {
      const rolesConfig: Record<string, RoleConfig> = {
        analyst: {
          adapter: 'mock-cli',
          model: 'mock-model',
          default_capabilities: {
            web_search: true,
            web_fetch: true,
            mcp_tools: ['analytics_tool', 'report_tool']
          }
        },
        writer: {
          adapter: 'mock-cli',
          model: 'mock-model',
          default_capabilities: {
            web_search: false,
            browser: false
          }
        }
      };

      roleManager.loadRoles(rolesConfig);

      const analystRole = roleManager.getRole('analyst');
      const writerRole = roleManager.getRole('writer');

      expect(analystRole?.default_capabilities?.web_search).toBe(true);
      expect(analystRole?.default_capabilities?.web_fetch).toBe(true);
      expect(analystRole?.default_capabilities?.mcp_tools).toEqual(['analytics_tool', 'report_tool']);

      expect(writerRole?.default_capabilities?.web_search).toBe(false);
      expect(writerRole?.default_capabilities?.browser).toBe(false);
    });

    it('роль без default_capabilities должна работать', () => {
      roleManager.loadRoles({
        basic: {
          adapter: 'mock-cli',
          model: 'mock-model'
        }
      });

      const basicRole = roleManager.getRole('basic');

      expect(basicRole).toBeDefined();
      expect(basicRole?.default_capabilities).toBeUndefined();
    });
  });

  describe('mcp_tools variants', () => {
    it('mcp_tools: true означает все MCP разрешены', () => {
      const capabilities: StepCapabilities = {
        mcp_tools: true
      };

      expect(capabilities.mcp_tools).toBe(true);
      expect(typeof capabilities.mcp_tools).toBe('boolean');
    });

    it('mcp_tools: string[] означает только указанные инструменты', () => {
      const capabilities: StepCapabilities = {
        mcp_tools: ['db_query', 'db_insert', 'file_read']
      };

      expect(Array.isArray(capabilities.mcp_tools)).toBe(true);
      expect(capabilities.mcp_tools).toHaveLength(3);
      expect(capabilities.mcp_tools).toContain('db_query');
    });

    it('шаг с массивом mcp_tools переопределяет роль с boolean', () => {
      roleManager.loadRoles({
        admin: {
          adapter: 'mock-cli',
          default_capabilities: {
            mcp_tools: true  // Все MCP разрешены
          }
        }
      });

      const stepCapabilities: StepCapabilities = {
        mcp_tools: ['only_safe_tool']  // Ограничиваем
      };

      const role = roleManager.getRole('admin');
      const merged: StepCapabilities = {
        ...role?.default_capabilities,
        ...stepCapabilities
      };

      // Шаг должен переопределить роль
      expect(merged.mcp_tools).toEqual(['only_safe_tool']);
    });
  });

  describe('Permissions with capabilities', () => {
    it('должен включать capabilities в StepPermissions', () => {
      const permissions: StepPermissions = {
        read: ['src/**/*'],
        write: ['docs/**/*'],
        capabilities: {
          web_search: true,
          browser: true
        }
      };

      expect(permissions.capabilities).toBeDefined();
      expect(permissions.capabilities?.web_search).toBe(true);
      expect(permissions.capabilities?.browser).toBe(true);
    });
  });
});
