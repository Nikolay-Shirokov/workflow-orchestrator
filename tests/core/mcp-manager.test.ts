/**
 * Тесты для MCPManager
 */

import { MCPManager, MCPToolConfig, MCPToolInfo } from '../../src/core/mcp-manager.js';
import { Logger } from '../../src/core/types.js';

// Mock логгер
const mockLogger: Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('MCPManager', () => {
  let mcpManager: MCPManager;

  beforeEach(() => {
    mcpManager = new MCPManager(mockLogger);
    jest.clearAllMocks();
  });

  describe('checkToolAvailability', () => {
    it('должен пометить инструмент как доступный, если команда проверки не указана', async () => {
      const config: MCPToolConfig = {
        name: 'test-tool',
      };

      const result = await mcpManager.checkToolAvailability(config);

      expect(result.name).toBe('test-tool');
      expect(result.available).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'MCP-инструмент test-tool помечен как доступный (нет команды проверки)'
      );
    });

    it('должен использовать кэш при повторной проверке', async () => {
      const config: MCPToolConfig = {
        name: 'cached-tool',
      };

      // Первая проверка
      const result1 = await mcpManager.checkToolAvailability(config);
      expect(result1.available).toBe(true);

      // Вторая проверка (должна использовать кэш)
      const result2 = await mcpManager.checkToolAvailability(config);
      expect(result2.available).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Использование кэшированной информации для cached-tool'
      );
    });

    it('должен выбросить ошибку, если обязательный инструмент недоступен', async () => {
      const config: MCPToolConfig = {
        name: 'required-tool',
        checkCommand: 'nonexistent-command',
        required: true,
      };

      await expect(mcpManager.checkToolAvailability(config)).rejects.toThrow(
        'Обязательный MCP-инструмент required-tool недоступен'
      );
    });
  });

  describe('checkMultipleTools', () => {
    it('должен проверить несколько инструментов', async () => {
      const configs: MCPToolConfig[] = [
        { name: 'tool1' },
        { name: 'tool2' },
        { name: 'tool3' },
      ];

      const results = await mcpManager.checkMultipleTools(configs);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.available)).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Проверка доступности 3 MCP-инструментов'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Доступно 3 из 3 MCP-инструментов'
      );
    });
  });

  describe('createMCPContext', () => {
    it('должен создать контекст с доступными и недоступными инструментами', () => {
      const tools: MCPToolInfo[] = [
        { name: 'tool1', description: 'Tool 1', available: true },
        { name: 'tool2', description: 'Tool 2', available: false },
        { name: 'tool3', description: 'Tool 3', available: true },
      ];

      const context = mcpManager.createMCPContext(tools);

      expect(context.available_tools).toEqual(['tool1', 'tool3']);
      expect(context.unavailable_tools).toEqual(['tool2']);
      expect(context.flags.tool1_available).toBe(true);
      expect(context.flags.tool2_available).toBe(false);
      expect(context.flags.tool3_available).toBe(true);
      expect(context.tools.tool1).toEqual(tools[0]);
    });
  });

  describe('evaluateCondition', () => {
    it('должен оценить MCP-условие на основе флагов', () => {
      const tools: MCPToolInfo[] = [
        { name: 'web_search', description: 'Web Search', available: true },
        { name: 'file_access', description: 'File Access', available: false },
      ];

      const context = mcpManager.createMCPContext(tools);

      expect(mcpManager.evaluateCondition('web_search_available', context)).toBe(true);
      expect(mcpManager.evaluateCondition('file_access_available', context)).toBe(false);
    });

    it('должен оценить специальное условие any_mcp_available', () => {
      const tools: MCPToolInfo[] = [
        { name: 'tool1', description: 'Tool 1', available: true },
      ];

      const context = mcpManager.createMCPContext(tools);

      expect(mcpManager.evaluateCondition('any_mcp_available', context)).toBe(true);
    });

    it('должен оценить специальное условие all_mcp_available', () => {
      const tools: MCPToolInfo[] = [
        { name: 'tool1', description: 'Tool 1', available: true },
        { name: 'tool2', description: 'Tool 2', available: false },
      ];

      const context = mcpManager.createMCPContext(tools);

      expect(mcpManager.evaluateCondition('all_mcp_available', context)).toBe(false);
    });

    it('должен вернуть true для не-MCP условий', () => {
      const tools: MCPToolInfo[] = [];
      const context = mcpManager.createMCPContext(tools);

      expect(mcpManager.evaluateCondition('some_other_condition', context)).toBe(true);
    });
  });

  describe('logUnavailableTools', () => {
    it('должен залогировать недоступные инструменты', () => {
      const tools: MCPToolInfo[] = [
        { name: 'tool1', description: 'Tool 1', available: true },
        { name: 'tool2', description: 'Tool 2', available: false },
        { name: 'tool3', description: 'Tool 3', available: false },
      ];

      mcpManager.logUnavailableTools(tools, 'step1');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Обнаружено 2 недоступных MCP-инструментов для шага step1:'
      );
      expect(mockLogger.warn).toHaveBeenCalledWith('  - tool2: Tool 2');
      expect(mockLogger.warn).toHaveBeenCalledWith('  - tool3: Tool 3');
    });

    it('не должен логировать, если все инструменты доступны', () => {
      const tools: MCPToolInfo[] = [
        { name: 'tool1', description: 'Tool 1', available: true },
      ];

      mcpManager.logUnavailableTools(tools);

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('formatForPrompt', () => {
    it('должен отформатировать информацию о MCP для промпта', () => {
      const tools: MCPToolInfo[] = [
        { name: 'web_search', description: 'Поиск в интернете', available: true },
        { name: 'file_access', description: 'Доступ к файлам', available: false },
      ];

      const context = mcpManager.createMCPContext(tools);
      const formatted = mcpManager.formatForPrompt(context);

      expect(formatted).toContain('Доступные MCP-инструменты:');
      expect(formatted).toContain('web_search: Поиск в интернете');
      expect(formatted).toContain('Недоступные MCP-инструменты:');
      expect(formatted).toContain('file_access: Доступ к файлам');
    });
  });

  describe('clearCache', () => {
    it('должен очистить кэш инструментов', async () => {
      const config: MCPToolConfig = {
        name: 'cached-tool',
      };

      // Создаем кэш
      await mcpManager.checkToolAvailability(config);

      // Очищаем кэш
      mcpManager.clearCache();

      // Проверяем, что кэш очищен
      const cachedInfo = mcpManager.getCachedToolInfo('cached-tool');
      expect(cachedInfo).toBeUndefined();
    });
  });
});
