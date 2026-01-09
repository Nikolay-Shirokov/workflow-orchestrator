/**
 * Тесты для RoleManager
 */

import { RoleManager } from '../../src/core/role-manager';
import { RoleConfig, AdapterRequest } from '../../src/core/types';

describe('RoleManager', () => {
  let roleManager: RoleManager;

  beforeEach(() => {
    roleManager = new RoleManager();
  });

  describe('Загрузка ролей', () => {
    it('должен загружать роли из конфигурации', () => {
      const rolesConfig: Record<string, RoleConfig> = {
        architect: {
          adapter: 'claude-cli',
          model: 'claude-sonnet-3.5',
          role_definition: 'Вы - архитектор',
          permissions: ['read', 'edit:.*\\.md$']
        },
        copilot: {
          adapter: 'gpt-cli',
          model: 'gpt-4',
          permissions: ['read']
        }
      };

      roleManager.loadRoles(rolesConfig);

      expect(roleManager.hasRole('architect')).toBe(true);
      expect(roleManager.hasRole('copilot')).toBe(true);
      expect(roleManager.hasRole('nonexistent')).toBe(false);
    });

    it('должен выбрасывать ошибку при отсутствии адаптера в роли', () => {
      const rolesConfig: Record<string, RoleConfig> = {
        invalid: {
          adapter: '', // Пустой адаптер
          model: 'test-model'
        }
      };

      expect(() => roleManager.loadRoles(rolesConfig)).toThrow('не имеет указанного адаптера');
    });

    it('должен валидировать regex в разрешениях', () => {
      const rolesConfig: Record<string, RoleConfig> = {
        invalid: {
          adapter: 'test-adapter',
          permissions: ['edit:[invalid(regex']
        }
      };

      expect(() => roleManager.loadRoles(rolesConfig)).toThrow('Невалидное регулярное выражение');
    });
  });

  describe('Получение информации о роли', () => {
    beforeEach(() => {
      roleManager.loadRoles({
        architect: {
          adapter: 'claude-cli',
          model: 'claude-sonnet-3.5',
          role_definition: 'Вы - архитектор',
          custom_instructions: 'Будьте кратки',
          permissions: ['read', 'edit:.*\\.md$', 'command']
        }
      });
    });

    it('должен возвращать конфигурацию роли', () => {
      const role = roleManager.getRole('architect');
      expect(role).toBeDefined();
      expect(role?.adapter).toBe('claude-cli');
      expect(role?.model).toBe('claude-sonnet-3.5');
    });

    it('должен возвращать адаптер для роли', () => {
      const adapter = roleManager.getAdapterForRole('architect');
      expect(adapter).toBe('claude-cli');
    });

    it('должен возвращать модель для роли', () => {
      const model = roleManager.getModelForRole('architect');
      expect(model).toBe('claude-sonnet-3.5');
    });

    it('должен выбрасывать ошибку для несуществующей роли', () => {
      expect(() => roleManager.getAdapterForRole('nonexistent')).toThrow('Роль "nonexistent" не найдена');
    });
  });

  describe('Обогащение запроса инструкциями роли', () => {
    beforeEach(() => {
      roleManager.loadRoles({
        architect: {
          adapter: 'claude-cli',
          model: 'claude-sonnet-3.5',
          role_definition: 'Вы - архитектор системы',
          custom_instructions: 'Отвечайте кратко и по делу',
          temperature: 0.7,
          max_tokens: 2000,
          permissions: ['read', 'edit']
        }
      });
    });

    it('должен добавлять role_definition в системный промпт', () => {
      const baseRequest: AdapterRequest = {
        prompt: 'Создайте дизайн системы'
      };

      const enrichedRequest = roleManager.enrichRequestWithRole('architect', baseRequest);

      expect(enrichedRequest.systemPrompt).toContain('Вы - архитектор системы');
    });

    it('должен добавлять custom_instructions в системный промпт', () => {
      const baseRequest: AdapterRequest = {
        prompt: 'Создайте дизайн системы'
      };

      const enrichedRequest = roleManager.enrichRequestWithRole('architect', baseRequest);

      expect(enrichedRequest.systemPrompt).toContain('Отвечайте кратко и по делу');
    });

    it('должен комбинировать существующий системный промпт с инструкциями роли', () => {
      const baseRequest: AdapterRequest = {
        prompt: 'Создайте дизайн системы',
        systemPrompt: 'Вы - помощник разработчика'
      };

      const enrichedRequest = roleManager.enrichRequestWithRole('architect', baseRequest);

      expect(enrichedRequest.systemPrompt).toContain('Вы - помощник разработчика');
      expect(enrichedRequest.systemPrompt).toContain('Вы - архитектор системы');
      expect(enrichedRequest.systemPrompt).toContain('Отвечайте кратко и по делу');
    });

    it('должен переопределять модель из роли', () => {
      const baseRequest: AdapterRequest = {
        prompt: 'Создайте дизайн системы',
        model: 'gpt-3.5'
      };

      const enrichedRequest = roleManager.enrichRequestWithRole('architect', baseRequest);

      expect(enrichedRequest.model).toBe('claude-sonnet-3.5');
    });

    it('должен переопределять temperature из роли', () => {
      const baseRequest: AdapterRequest = {
        prompt: 'Создайте дизайн системы',
        temperature: 0.5
      };

      const enrichedRequest = roleManager.enrichRequestWithRole('architect', baseRequest);

      expect(enrichedRequest.temperature).toBe(0.7);
    });

    it('должен переопределять maxTokens из роли', () => {
      const baseRequest: AdapterRequest = {
        prompt: 'Создайте дизайн системы',
        maxTokens: 1000
      };

      const enrichedRequest = roleManager.enrichRequestWithRole('architect', baseRequest);

      expect(enrichedRequest.maxTokens).toBe(2000);
    });
  });

  describe('Система разрешений', () => {
    beforeEach(() => {
      roleManager.loadRoles({
        reader: {
          adapter: 'test-adapter',
          permissions: ['read']
        },
        editor: {
          adapter: 'test-adapter',
          permissions: ['read', 'edit']
        },
        mdEditor: {
          adapter: 'test-adapter',
          permissions: ['read', 'edit:.*\\.md$']
        },
        commander: {
          adapter: 'test-adapter',
          permissions: ['read', 'command']
        },
        mcpUser: {
          adapter: 'test-adapter',
          permissions: ['read', 'mcp']
        }
      });
    });

    it('должен корректно парсить разрешения на чтение', () => {
      const permissions = roleManager.getPermissions('reader');
      expect(permissions.read).toBe(true);
      expect(permissions.edit).toBe(false);
      expect(permissions.command).toBe(false);
      expect(permissions.mcp).toBe(false);
    });

    it('должен корректно парсить разрешения на редактирование', () => {
      const permissions = roleManager.getPermissions('editor');
      expect(permissions.read).toBe(true);
      expect(permissions.edit).toBe(true);
      expect(permissions.editFileRegex).toBeUndefined();
    });

    it('должен корректно парсить разрешения на редактирование с regex', () => {
      const permissions = roleManager.getPermissions('mdEditor');
      expect(permissions.edit).toBe(true);
      expect(permissions.editFileRegex).toBe('.*\\.md$');
    });

    it('должен проверять разрешение на редактирование файла', () => {
      expect(roleManager.canEditFile('editor', 'any-file.txt')).toBe(true);
      expect(roleManager.canEditFile('reader', 'any-file.txt')).toBe(false);
    });

    it('должен проверять разрешение на редактирование файла с regex', () => {
      expect(roleManager.canEditFile('mdEditor', 'document.md')).toBe(true);
      expect(roleManager.canEditFile('mdEditor', 'script.js')).toBe(false);
    });

    it('должен проверять разрешение на выполнение команд', () => {
      expect(roleManager.canExecuteCommands('commander')).toBe(true);
      expect(roleManager.canExecuteCommands('reader')).toBe(false);
    });

    it('должен проверять разрешение на использование MCP', () => {
      expect(roleManager.canUseMCP('mcpUser')).toBe(true);
      expect(roleManager.canUseMCP('reader')).toBe(false);
    });

    it('должен возвращать разрешения по умолчанию для несуществующей роли', () => {
      const permissions = roleManager.getPermissions('nonexistent');
      expect(permissions.read).toBe(true);
      expect(permissions.edit).toBe(false);
      expect(permissions.command).toBe(false);
      expect(permissions.mcp).toBe(false);
    });
  });

  describe('Получение всех ролей', () => {
    it('должен возвращать все загруженные роли', () => {
      roleManager.loadRoles({
        role1: { adapter: 'adapter1' },
        role2: { adapter: 'adapter2' },
        role3: { adapter: 'adapter3' }
      });

      const allRoles = roleManager.getAllRoles();
      expect(allRoles.size).toBe(3);
      expect(allRoles.has('role1')).toBe(true);
      expect(allRoles.has('role2')).toBe(true);
      expect(allRoles.has('role3')).toBe(true);
    });
  });
});
