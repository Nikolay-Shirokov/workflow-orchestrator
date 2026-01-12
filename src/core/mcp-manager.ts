/**
 * Менеджер интеграции с MCP (Model Context Protocol) инструментами
 * 
 * Отвечает за:
 * - Проверку доступности MCP-инструментов
 * - Условное выполнение шагов на основе доступности MCP
 * - Передачу информации о MCP-инструментах в контекст модели
 * - Логирование предупреждений при недоступности MCP
 */

import { Logger } from './types.js';

/**
 * Информация о MCP-инструменте
 */
export interface MCPToolInfo {
  /** Имя инструмента */
  name: string;
  
  /** Описание инструмента */
  description: string;
  
  /** Доступен ли инструмент */
  available: boolean;
  
  /** Версия инструмента (если доступна) */
  version?: string;
  
  /** Дополнительные метаданные */
  metadata?: Record<string, unknown>;
}

/**
 * Конфигурация MCP-инструмента
 */
export interface MCPToolConfig {
  /** Имя инструмента */
  name: string;
  
  /** Команда для проверки доступности */
  checkCommand?: string;
  
  /** Ожидаемый код выхода при успехе */
  expectedExitCode?: number;
  
  /** Таймаут проверки в миллисекундах */
  timeout?: number;
  
  /** Обязателен ли инструмент */
  required?: boolean;
}

/**
 * Контекст MCP для передачи в модель
 */
export interface MCPContext {
  /** Доступные инструменты */
  available_tools: string[];
  
  /** Недоступные инструменты */
  unavailable_tools: string[];
  
  /** Детальная информация об инструментах */
  tools: Record<string, MCPToolInfo>;
  
  /** Флаги доступности для условного выполнения */
  flags: Record<string, boolean>;
}

/**
 * Менеджер MCP-инструментов
 */
export class MCPManager {
  private logger: Logger;
  private toolsCache: Map<string, MCPToolInfo> = new Map();
  private lastCheckTime: number = 0;
  private cacheValidityMs: number = 60000; // 1 минута
  
  constructor(logger: Logger) {
    this.logger = logger;
  }
  
  /**
   * Проверка доступности MCP-инструмента
   * 
   * @param config - Конфигурация инструмента
   * @returns Promise<MCPToolInfo> - Информация о доступности
   */
  async checkToolAvailability(config: MCPToolConfig): Promise<MCPToolInfo> {
    this.logger.debug(`Проверка доступности MCP-инструмента: ${config.name}`);
    
    // Проверяем кэш
    const cached = this.toolsCache.get(config.name);
    if (cached && this.isCacheValid()) {
      this.logger.debug(`Использование кэшированной информации для ${config.name}`);
      return cached;
    }
    
    const toolInfo: MCPToolInfo = {
      name: config.name,
      description: `MCP инструмент: ${config.name}`,
      available: false,
    };
    
    try {
      if (config.checkCommand) {
        // Выполняем команду проверки
        const available = await this.executeCheckCommand(
          config.checkCommand,
          config.expectedExitCode ?? 0,
          config.timeout ?? 5000
        );
        
        toolInfo.available = available;
        
        if (available) {
          this.logger.info(`MCP-инструмент ${config.name} доступен`);
        } else {
          this.logger.warn(`MCP-инструмент ${config.name} недоступен`);
          
          // Если инструмент обязателен и недоступен, выбрасываем ошибку
          if (config.required) {
            throw new Error(
              `Обязательный MCP-инструмент ${config.name} недоступен`
            );
          }
        }
      } else {
        // Если команда проверки не указана, считаем инструмент доступным
        toolInfo.available = true;
        this.logger.debug(`MCP-инструмент ${config.name} помечен как доступный (нет команды проверки)`);
      }
    } catch (error) {
      toolInfo.available = false;
      this.logger.error(`Ошибка при проверке MCP-инструмента ${config.name}:`, error);
      
      if (config.required) {
        throw new Error(
          `Обязательный MCP-инструмент ${config.name} недоступен: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    
    // Сохраняем в кэш
    this.toolsCache.set(config.name, toolInfo);
    this.lastCheckTime = Date.now();
    
    return toolInfo;
  }
  
  /**
   * Проверка доступности нескольких инструментов
   * 
   * @param configs - Массив конфигураций инструментов
   * @returns Promise<MCPToolInfo[]> - Информация о всех инструментах
   */
  async checkMultipleTools(configs: MCPToolConfig[]): Promise<MCPToolInfo[]> {
    this.logger.info(`Проверка доступности ${configs.length} MCP-инструментов`);
    
    const results = await Promise.all(
      configs.map(config => this.checkToolAvailability(config))
    );
    
    const availableCount = results.filter(r => r.available).length;
    this.logger.info(
      `Доступно ${availableCount} из ${configs.length} MCP-инструментов`
    );
    
    return results;
  }
  
  /**
   * Создание контекста MCP для передачи в модель
   * 
   * @param tools - Информация об инструментах
   * @returns MCPContext - Контекст для модели
   */
  createMCPContext(tools: MCPToolInfo[]): MCPContext {
    const context: MCPContext = {
      available_tools: [],
      unavailable_tools: [],
      tools: {},
      flags: {},
    };
    
    for (const tool of tools) {
      // Добавляем в соответствующий список
      if (tool.available) {
        context.available_tools.push(tool.name);
      } else {
        context.unavailable_tools.push(tool.name);
      }
      
      // Добавляем детальную информацию
      context.tools[tool.name] = tool;
      
      // Создаем флаг доступности для условного выполнения
      // Формат: {tool_name}_available
      const flagName = `${tool.name}_available`;
      context.flags[flagName] = tool.available;
    }
    
    this.logger.debug('Создан MCP-контекст:', {
      available: context.available_tools.length,
      unavailable: context.unavailable_tools.length,
    });
    
    return context;
  }
  
  /**
   * Проверка условия выполнения шага на основе доступности MCP
   * 
   * @param condition - Условие (например, "web_search_available")
   * @param mcpContext - Контекст MCP
   * @returns boolean - Результат проверки условия
   */
  evaluateCondition(condition: string, mcpContext: MCPContext): boolean {
    // Проверяем флаги доступности
    if (condition in mcpContext.flags) {
      const result = mcpContext.flags[condition];
      this.logger.debug(`Оценка MCP-условия "${condition}": ${result}`);
      return result;
    }
    
    // Проверяем специальные условия
    if (condition === 'any_mcp_available') {
      return mcpContext.available_tools.length > 0;
    }
    
    if (condition === 'all_mcp_available') {
      return mcpContext.unavailable_tools.length === 0;
    }
    
    // Если условие не связано с MCP, возвращаем true
    this.logger.debug(`Условие "${condition}" не является MCP-условием`);
    return true;
  }
  
  /**
   * Логирование предупреждений о недоступных инструментах
   * 
   * @param tools - Информация об инструментах
   * @param stepId - ID шага (опционально)
   */
  logUnavailableTools(tools: MCPToolInfo[], stepId?: string): void {
    const unavailable = tools.filter(t => !t.available);
    
    if (unavailable.length === 0) {
      return;
    }
    
    const stepInfo = stepId ? ` для шага ${stepId}` : '';
    this.logger.warn(
      `Обнаружено ${unavailable.length} недоступных MCP-инструментов${stepInfo}:`
    );
    
    for (const tool of unavailable) {
      this.logger.warn(`  - ${tool.name}: ${tool.description}`);
    }
    
    this.logger.warn(
      'Шаги, зависящие от этих инструментов, могут быть пропущены'
    );
  }
  
  /**
   * Форматирование информации о MCP-инструментах для промпта
   * 
   * @param mcpContext - Контекст MCP
   * @returns string - Отформатированная информация
   */
  formatForPrompt(mcpContext: MCPContext): string {
    const lines: string[] = [];
    
    if (mcpContext.available_tools.length > 0) {
      lines.push('Доступные MCP-инструменты:');
      for (const toolName of mcpContext.available_tools) {
        const tool = mcpContext.tools[toolName];
        lines.push(`  - ${tool.name}: ${tool.description}`);
      }
    }
    
    if (mcpContext.unavailable_tools.length > 0) {
      lines.push('');
      lines.push('Недоступные MCP-инструменты:');
      for (const toolName of mcpContext.unavailable_tools) {
        const tool = mcpContext.tools[toolName];
        lines.push(`  - ${tool.name}: ${tool.description}`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Очистка кэша инструментов
   */
  clearCache(): void {
    this.logger.debug('Очистка кэша MCP-инструментов');
    this.toolsCache.clear();
    this.lastCheckTime = 0;
  }
  
  /**
   * Получение информации об инструменте из кэша
   * 
   * @param toolName - Имя инструмента
   * @returns MCPToolInfo | undefined
   */
  getCachedToolInfo(toolName: string): MCPToolInfo | undefined {
    if (!this.isCacheValid()) {
      return undefined;
    }
    return this.toolsCache.get(toolName);
  }
  
  // ========================================================================
  // Приватные методы
  // ========================================================================
  
  /**
   * Выполнение команды проверки доступности
   * 
   * @param command - Команда для выполнения
   * @param expectedExitCode - Ожидаемый код выхода
   * @param timeout - Таймаут в миллисекундах
   * @returns Promise<boolean> - Доступен ли инструмент
   */
  private async executeCheckCommand(
    command: string,
    expectedExitCode: number,
    timeout: number
  ): Promise<boolean> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Адаптация команды для Windows
    let adaptedCommand = command;
    if (process.platform === 'win32') {
      // На Windows заменяем 'which' на 'where'
      adaptedCommand = command.replace(/^which\s+/, 'where ');
    }
    
    try {
      const { stdout, stderr } = await execAsync(adaptedCommand, {
        timeout,
        windowsHide: true,
      });
      
      this.logger.debug(`Команда проверки выполнена: ${adaptedCommand}`);
      if (stdout) {
        this.logger.debug(`stdout: ${stdout.trim()}`);
      }
      if (stderr) {
        this.logger.debug(`stderr: ${stderr.trim()}`);
      }
      
      return true;
    } catch (error: unknown) {
      // Проверяем код выхода
      if (error && typeof error === 'object' && 'code' in error) {
        const exitCode = (error as { code?: number }).code;
        if (exitCode === expectedExitCode) {
          return true;
        }
      }
      
      this.logger.debug(`Команда проверки завершилась с ошибкой: ${adaptedCommand}`, error);
      return false;
    }
  }
  
  /**
   * Проверка валидности кэша
   * 
   * @returns boolean - Валиден ли кэш
   */
  private isCacheValid(): boolean {
    const now = Date.now();
    return (now - this.lastCheckTime) < this.cacheValidityMs;
  }
}
