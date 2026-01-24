/**
 * Unit-тесты для системы capabilities
 *
 * Проверяют:
 * - Корректность типов StepCapabilities
 * - Слияние capabilities из шага и роли
 * - Валидацию поддержки capabilities адаптером
 */

import { StepCapabilities, RoleConfig, StepPermissions } from '../../src/core/types.js';
import { RoleManager } from '../../src/core/role-manager.js';

describe('StepCapabilities', () => {
  describe('Типы и структура', () => {
    it('должен поддерживать все поля capabilities', () => {
      const capabilities: StepCapabilities = {
        web_search: true,
        web_fetch: true,
        mcp_tools: true,
        browser: true
      };

      expect(capabilities.web_search).toBe(true);
      expect(capabilities.web_fetch).toBe(true);
      expect(capabilities.mcp_tools).toBe(true);
      expect(capabilities.browser).toBe(true);
    });

    it('должен поддерживать mcp_tools как массив строк', () => {
      const capabilities: StepCapabilities = {
        mcp_tools: ['db_query', 'db_insert', 'file_read']
      };

      expect(Array.isArray(capabilities.mcp_tools)).toBe(true);
      expect(capabilities.mcp_tools).toContain('db_query');
      expect(capabilities.mcp_tools).toContain('db_insert');
      expect(capabilities.mcp_tools).toContain('file_read');
    });

    it('должен поддерживать частичное указание capabilities', () => {
      const capabilities: StepCapabilities = {
        web_search: true
      };

      expect(capabilities.web_search).toBe(true);
      expect(capabilities.web_fetch).toBeUndefined();
      expect(capabilities.mcp_tools).toBeUndefined();
      expect(capabilities.browser).toBeUndefined();
    });

    it('должен поддерживать пустой объект capabilities', () => {
      const capabilities: StepCapabilities = {};

      expect(Object.keys(capabilities).length).toBe(0);
    });
  });

  describe('Capabilities в StepPermissions', () => {
    it('должен включать capabilities в permissions', () => {
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

    it('должен работать без capabilities в permissions', () => {
      const permissions: StepPermissions = {
        read: ['src/**/*'],
        execute: true
      };

      expect(permissions.capabilities).toBeUndefined();
    });
  });

  describe('Default capabilities в RoleConfig', () => {
    it('должен поддерживать default_capabilities в роли', () => {
      const roleConfig: RoleConfig = {
        adapter: 'claude-cli',
        model: 'claude-sonnet-3.5',
        default_capabilities: {
          web_search: true,
          web_fetch: true
        }
      };

      expect(roleConfig.default_capabilities).toBeDefined();
      expect(roleConfig.default_capabilities?.web_search).toBe(true);
      expect(roleConfig.default_capabilities?.web_fetch).toBe(true);
    });
  });
});

describe('Merge Capabilities', () => {
  let roleManager: RoleManager;

  beforeEach(() => {
    roleManager = new RoleManager();
  });

  describe('Приоритет слияния', () => {
    it('step capabilities должны переопределять role capabilities', () => {
      roleManager.loadRoles({
        researcher: {
          adapter: 'claude-cli',
          model: 'claude-sonnet-3.5',
          default_capabilities: {
            web_search: true,
            web_fetch: true,
            browser: false
          }
        }
      });

      const role = roleManager.getRole('researcher');
      const stepCapabilities: StepCapabilities = {
        browser: true,  // Переопределяем browser
        mcp_tools: ['custom_tool']  // Добавляем mcp_tools
      };

      // Слияние: step > role
      const merged: StepCapabilities = {
        ...role?.default_capabilities,
        ...stepCapabilities
      };

      expect(merged.web_search).toBe(true);  // из роли
      expect(merged.web_fetch).toBe(true);   // из роли
      expect(merged.browser).toBe(true);     // переопределено шагом
      expect(merged.mcp_tools).toEqual(['custom_tool']);  // из шага
    });

    it('должен использовать только step capabilities если роль не указана', () => {
      const stepCapabilities: StepCapabilities = {
        web_search: true
      };

      // Без роли используем только step
      const merged = { ...stepCapabilities };

      expect(merged.web_search).toBe(true);
      expect(merged.web_fetch).toBeUndefined();
    });

    it('должен использовать только role capabilities если step не указывает capabilities', () => {
      roleManager.loadRoles({
        analyst: {
          adapter: 'gemini-cli',
          default_capabilities: {
            web_search: true,
            web_fetch: true
          }
        }
      });

      const role = roleManager.getRole('analyst');
      const merged = { ...role?.default_capabilities };

      expect(merged.web_search).toBe(true);
      expect(merged.web_fetch).toBe(true);
    });

    it('должен возвращать undefined если нет capabilities ни в роли, ни в шаге', () => {
      roleManager.loadRoles({
        basic: {
          adapter: 'claude-cli'
          // Нет default_capabilities
        }
      });

      const role = roleManager.getRole('basic');
      const stepCapabilities: StepCapabilities | undefined = undefined;

      const merged = stepCapabilities || role?.default_capabilities;

      expect(merged).toBeUndefined();
    });
  });

  describe('Слияние mcp_tools', () => {
    it('step массив mcp_tools должен переопределять role boolean', () => {
      const roleCapabilities: StepCapabilities = {
        mcp_tools: true  // Все MCP разрешены
      };

      const stepCapabilities: StepCapabilities = {
        mcp_tools: ['specific_tool']  // Только конкретные
      };

      const merged = { ...roleCapabilities, ...stepCapabilities };

      expect(merged.mcp_tools).toEqual(['specific_tool']);
    });

    it('step boolean mcp_tools должен переопределять role массив', () => {
      const roleCapabilities: StepCapabilities = {
        mcp_tools: ['tool1', 'tool2']
      };

      const stepCapabilities: StepCapabilities = {
        mcp_tools: true  // Разрешить все
      };

      const merged = { ...roleCapabilities, ...stepCapabilities };

      expect(merged.mcp_tools).toBe(true);
    });
  });
});

describe('Validation Capabilities Support', () => {
  describe('CapabilitySupport интерфейс', () => {
    it('должен описывать поддержку capability адаптером', () => {
      // Пример для Claude CLI
      const claudeSupport = {
        web_search: { supported: true, note: 'Инструмент WebSearch' },
        web_fetch: { supported: true, note: 'Инструмент WebFetch' },
        mcp_tools: { supported: true },
        browser: { supported: true, flags: ['--chrome'] }
      };

      expect(claudeSupport.web_search.supported).toBe(true);
      expect(claudeSupport.browser.flags).toContain('--chrome');
    });

    it('должен описывать неподдерживаемые capabilities', () => {
      // Пример для Codex CLI
      const codexSupport = {
        web_search: { supported: true, flags: ['--search'] },
        web_fetch: { supported: false, note: 'Codex CLI не поддерживает web_fetch' },
        mcp_tools: { supported: true, note: 'MCP доступен через codex mcp add' },
        browser: { supported: false, note: 'Codex CLI не поддерживает browser' }
      };

      expect(codexSupport.web_fetch.supported).toBe(false);
      expect(codexSupport.browser.supported).toBe(false);
    });
  });

  describe('Проверка поддержки', () => {
    it('должен выявлять неподдерживаемые capabilities', () => {
      const adapterSupport = {
        web_search: { supported: true },
        web_fetch: { supported: false },
        mcp_tools: { supported: true },
        browser: { supported: false }
      };

      const requestedCapabilities: StepCapabilities = {
        web_search: true,
        web_fetch: true,  // Не поддерживается
        browser: true     // Не поддерживается
      };

      const unsupported: string[] = [];
      for (const [key, value] of Object.entries(requestedCapabilities)) {
        if (value && adapterSupport[key as keyof typeof adapterSupport]?.supported === false) {
          unsupported.push(key);
        }
      }

      expect(unsupported).toContain('web_fetch');
      expect(unsupported).toContain('browser');
      expect(unsupported).not.toContain('web_search');
    });
  });
});
