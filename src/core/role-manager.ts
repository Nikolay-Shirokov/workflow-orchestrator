/**
 * Менеджер ролей для управления специализацией моделей
 * 
 * Этот модуль отвечает за:
 * - Загрузку определений ролей из конфигурации
 * - Назначение адаптеров и моделей на роли
 * - Внедрение roleDefinition в контекст запроса
 * - Поддержку customInstructions для ролей
 * - Систему разрешений для ролей
 */

import { RoleConfig, AdapterRequest, WorkflowErrorClass } from './types.js';

/**
 * Разрешения для роли
 */
export interface RolePermissions {
  /** Разрешение на чтение файлов */
  read: boolean;
  
  /** Разрешение на редактирование файлов (с опциональным regex) */
  edit: boolean;
  editFileRegex?: string;
  
  /** Разрешение на выполнение команд */
  command: boolean;
  
  /** Разрешение на использование MCP-инструментов */
  mcp: boolean;
}

/**
 * Менеджер ролей
 */
export class RoleManager {
  private roles: Map<string, RoleConfig>;
  private permissions: Map<string, RolePermissions>;
  
  constructor() {
    this.roles = new Map();
    this.permissions = new Map();
  }
  
  /**
   * Загрузка определений ролей из конфигурации
   * @param rolesConfig - Конфигурация ролей из workflow
   */
  loadRoles(rolesConfig: Record<string, RoleConfig>): void {
    for (const [roleName, roleConfig] of Object.entries(rolesConfig)) {
      this.validateRoleConfig(roleName, roleConfig);
      this.roles.set(roleName, roleConfig);
      this.permissions.set(roleName, this.parsePermissions(roleConfig.permissions || []));
    }
  }
  
  /**
   * Получение конфигурации роли
   * @param roleName - Имя роли
   * @returns RoleConfig или undefined
   */
  getRole(roleName: string): RoleConfig | undefined {
    return this.roles.get(roleName);
  }
  
  /**
   * Проверка существования роли
   * @param roleName - Имя роли
   * @returns boolean
   */
  hasRole(roleName: string): boolean {
    return this.roles.has(roleName);
  }
  
  /**
   * Получение всех ролей
   * @returns Map<string, RoleConfig>
   */
  getAllRoles(): Map<string, RoleConfig> {
    return new Map(this.roles);
  }
  
  /**
   * Получение адаптера для роли
   * @param roleName - Имя роли
   * @returns Имя адаптера
   */
  getAdapterForRole(roleName: string): string {
    const role = this.roles.get(roleName);
    if (!role) {
      throw new WorkflowErrorClass({
        code: 'ROLE_NOT_FOUND',
        category: 'config',
        severity: 'error',
        message: `Роль "${roleName}" не найдена`,
        context: { roleName, availableRoles: Array.from(this.roles.keys()) },
        recoverable: false,
        suggestions: [
          'Проверьте правильность имени роли',
          'Убедитесь, что роль определена в конфигурации workflow',
          `Доступные роли: ${Array.from(this.roles.keys()).join(', ')}`
        ]
      });
    }
    return role.adapter;
  }
  
  /**
   * Получение модели для роли
   * @param roleName - Имя роли
   * @returns Имя модели или undefined
   */
  getModelForRole(roleName: string): string | undefined {
    const role = this.roles.get(roleName);
    return role?.model;
  }
  
  /**
   * Внедрение roleDefinition и customInstructions в запрос
   * @param roleName - Имя роли
   * @param baseRequest - Базовый запрос к адаптеру
   * @returns AdapterRequest с внедренными инструкциями роли
   */
  enrichRequestWithRole(roleName: string, baseRequest: AdapterRequest): AdapterRequest {
    const role = this.roles.get(roleName);
    if (!role) {
      throw new WorkflowErrorClass({
        code: 'ROLE_NOT_FOUND',
        category: 'execution',
        severity: 'error',
        message: `Роль "${roleName}" не найдена при обогащении запроса`,
        context: { roleName, availableRoles: Array.from(this.roles.keys()) },
        recoverable: false,
        suggestions: [
          'Проверьте правильность имени роли в конфигурации шага',
          'Убедитесь, что роль определена в секции roles конфигурации workflow'
        ]
      });
    }
    
    // Строим системный промпт с учетом роли
    let systemPrompt = baseRequest.systemPrompt || '';
    
    // Добавляем определение роли
    if (role.role_definition) {
      systemPrompt = this.combinePrompts(systemPrompt, role.role_definition);
    }
    
    // Добавляем пользовательские инструкции
    if (role.custom_instructions) {
      systemPrompt = this.combinePrompts(systemPrompt, role.custom_instructions);
    }
    
    // Создаем обогащенный запрос
    const enrichedRequest: AdapterRequest = {
      ...baseRequest,
      systemPrompt: systemPrompt || undefined,
      model: role.model || baseRequest.model,
      temperature: role.temperature ?? baseRequest.temperature,
      maxTokens: role.max_tokens ?? baseRequest.maxTokens
    };
    
    return enrichedRequest;
  }
  
  /**
   * Получение разрешений для роли
   * @param roleName - Имя роли
   * @returns RolePermissions
   */
  getPermissions(roleName: string): RolePermissions {
    const permissions = this.permissions.get(roleName);
    if (!permissions) {
      // Возвращаем разрешения по умолчанию (только чтение)
      return {
        read: true,
        edit: false,
        command: false,
        mcp: false
      };
    }
    return permissions;
  }
  
  /**
   * Проверка разрешения на редактирование файла
   * @param roleName - Имя роли
   * @param filePath - Путь к файлу
   * @returns boolean
   */
  canEditFile(roleName: string, filePath: string): boolean {
    const permissions = this.getPermissions(roleName);
    
    if (!permissions.edit) {
      return false;
    }
    
    // Если нет regex, разрешено редактирование всех файлов
    if (!permissions.editFileRegex) {
      return true;
    }
    
    // Проверяем соответствие regex
    try {
      const regex = new RegExp(permissions.editFileRegex);
      return regex.test(filePath);
    } catch (error) {
      throw new WorkflowErrorClass({
        code: 'INVALID_FILE_REGEX',
        category: 'config',
        severity: 'error',
        message: `Невалидное регулярное выражение для файлов роли "${roleName}"`,
        context: { roleName, regex: permissions.editFileRegex, error },
        recoverable: false,
        suggestions: [
          'Проверьте синтаксис регулярного выражения в конфигурации роли',
          'Используйте валидный JavaScript regex синтаксис'
        ]
      });
    }
  }
  
  /**
   * Проверка разрешения на выполнение команд
   * @param roleName - Имя роли
   * @returns boolean
   */
  canExecuteCommands(roleName: string): boolean {
    return this.getPermissions(roleName).command;
  }
  
  /**
   * Проверка разрешения на использование MCP
   * @param roleName - Имя роли
   * @returns boolean
   */
  canUseMCP(roleName: string): boolean {
    return this.getPermissions(roleName).mcp;
  }
  
  /**
   * Валидация конфигурации роли
   * @param roleName - Имя роли
   * @param roleConfig - Конфигурация роли
   */
  private validateRoleConfig(roleName: string, roleConfig: RoleConfig): void {
    if (!roleConfig.adapter) {
      throw new WorkflowErrorClass({
        code: 'ROLE_MISSING_ADAPTER',
        category: 'config',
        severity: 'error',
        message: `Роль "${roleName}" не имеет указанного адаптера`,
        context: { roleName, roleConfig },
        recoverable: false,
        suggestions: [
          'Добавьте поле "adapter" в конфигурацию роли',
          'Укажите имя CLI-адаптера (например, "claude-cli", "openai-cli")'
        ]
      });
    }
    
    // Валидация regex для разрешений на редактирование
    if (roleConfig.permissions) {
      for (const permission of roleConfig.permissions) {
        // Обработка строковых разрешений
        if (typeof permission === 'string' && permission.startsWith('edit:')) {
          const pattern = permission.substring(5);
          try {
            // Если паттерн уже regex, валидируем напрямую
            if (pattern.startsWith('^') || pattern.endsWith('$') || pattern.includes('(') || pattern.includes('[')) {
              new RegExp(pattern);
            } else {
              // Иначе конвертируем glob в regex и проверяем
              const regex = this.globToRegex(pattern);
              new RegExp(regex);
            }
          } catch (error) {
            throw new WorkflowErrorClass({
              code: 'INVALID_PERMISSION_REGEX',
              category: 'config',
              severity: 'error',
              message: `Невалидное регулярное выражение в разрешениях роли "${roleName}": ${pattern}`,
              context: { roleName, permission, pattern, error },
              recoverable: false,
              suggestions: [
                'Проверьте синтаксис регулярного выражения',
                'Используйте формат: edit:pattern (например, edit:*.md или edit:.*\\.md$)'
              ]
            });
          }
        }
        // Обработка объектных разрешений (из YAML: edit: "*.md")
        else if (typeof permission === 'object' && permission !== null && 'edit' in permission) {
          const pattern = (permission as Record<string, string>).edit;
          try {
            // Если паттерн уже regex, валидируем напрямую
            if (pattern.startsWith('^') || pattern.endsWith('$') || pattern.includes('(') || pattern.includes('[')) {
              new RegExp(pattern);
            } else {
              // Иначе конвертируем glob в regex и проверяем
              const regex = this.globToRegex(pattern);
              new RegExp(regex);
            }
          } catch (error) {
            throw new WorkflowErrorClass({
              code: 'INVALID_PERMISSION_REGEX',
              category: 'config',
              severity: 'error',
              message: `Невалидное регулярное выражение в разрешениях роли "${roleName}": ${pattern}`,
              context: { roleName, permission, pattern, error },
              recoverable: false,
              suggestions: [
                'Проверьте синтаксис регулярного выражения',
                'Используйте формат: edit: "pattern" (например, edit: "*.md" или edit: ".*\\.md$")'
              ]
            });
          }
        }
      }
    }
  }
  
  /**
   * Конвертация glob-паттерна в регулярное выражение
   * @param glob - Glob-паттерн (например, "*.md", "src/**\/*.ts")
   * @returns Строка регулярного выражения
   */
  private globToRegex(glob: string): string {
    // Если паттерн уже является regex (содержит ^ в начале или $ в конце), возвращаем как есть
    if (glob.startsWith('^') || glob.endsWith('$')) {
      return glob;
    }
    
    // Экранируем специальные символы regex, кроме * и ?
    let regex = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Экранируем спецсимволы
      .replace(/\*/g, '.*')                   // * -> .*
      .replace(/\?/g, '.');                   // ? -> .
    
    // Добавляем якоря начала и конца
    return `^${regex}$`;
  }

  /**
   * Парсинг разрешений из массива строк или объектов
   * @param permissionsArray - Массив разрешений
   * @returns RolePermissions
   */
  private parsePermissions(permissionsArray: (string | Record<string, string>)[]): RolePermissions {
    const permissions: RolePermissions = {
      read: false,
      edit: false,
      command: false,
      mcp: false
    };
    
    for (const permission of permissionsArray) {
      // Обработка строковых разрешений
      if (typeof permission === 'string') {
        if (permission === 'read') {
          permissions.read = true;
        } else if (permission === 'command') {
          permissions.command = true;
        } else if (permission === 'mcp') {
          permissions.mcp = true;
        } else if (permission.startsWith('edit:')) {
          permissions.edit = true;
          const pattern = permission.substring(5);
          // Конвертируем glob в regex
          permissions.editFileRegex = this.globToRegex(pattern);
        } else if (permission === 'edit') {
          permissions.edit = true;
        }
      } 
      // Обработка объектных разрешений (из YAML: edit: "*.md")
      else if (typeof permission === 'object' && permission !== null) {
        if ('edit' in permission) {
          permissions.edit = true;
          // Конвертируем glob в regex
          permissions.editFileRegex = this.globToRegex(permission.edit);
        }
      }
    }
    
    return permissions;
  }
  
  /**
   * Комбинирование промптов
   * @param existing - Существующий промпт
   * @param additional - Дополнительный промпт
   * @returns Объединенный промпт
   */
  private combinePrompts(existing: string, additional: string): string {
    if (!existing) {
      return additional;
    }
    if (!additional) {
      return existing;
    }
    return `${existing}\n\n${additional}`;
  }
}
