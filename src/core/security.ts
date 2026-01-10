/**
 * Модуль безопасности для Workflow Orchestrator
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger, WorkflowErrorClass } from './types.js';

export interface SecurityConfig {
  baseDir: string;
  allowedDirs?: string[];
  forbiddenPathPatterns?: RegExp[];
  maxInputLength?: number;
  allowedEnvVars?: string[];
  forbiddenEnvVars?: string[];
  enableAuditLog?: boolean;
  auditLogPath?: string;
  defaultFileMode?: number;
  defaultDirMode?: number;
  logger?: Logger;
}

export interface AuditLogEntry {
  timestamp: string;
  eventType: 'file_access' | 'env_access' | 'input_sanitized' | 'security_violation' | 'permission_change';
  severity: 'info' | 'warning' | 'error';
  message: string;
  context: Record<string, unknown>;
  sessionId?: string;
  result: 'success' | 'denied' | 'error';
}

export interface PathValidationResult {
  valid: boolean;
  normalizedPath?: string;
  reason?: string;
  errorCode?: string;
}

export interface SanitizationResult {
  sanitized: string;
  modified: boolean;
  removedPatterns: string[];
}

export class SecurityManager {
  private config: Required<SecurityConfig>;
  private auditLogStream?: fs.FileHandle;
  
  private readonly DANGEROUS_PATTERNS = [
    /\.\.[\/\\]/g,
    /\.\.\\/g,
    /\.\.%2[fF]/g,
    /\.\.%5[cC]/g,
    /[;&|`$(){}[\]<>]/g,
    /\x00/g,
    /[\x00-\x1F\x7F]/g,
  ];
  
  private readonly DEFAULT_FORBIDDEN_ENV_VARS = [
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
  ];

  constructor(config: SecurityConfig) {
    this.config = {
      baseDir: path.resolve(config.baseDir),
      allowedDirs: config.allowedDirs?.map(dir => path.resolve(dir)) || [],
      forbiddenPathPatterns: config.forbiddenPathPatterns || [],
      maxInputLength: config.maxInputLength || 10000,
      allowedEnvVars: config.allowedEnvVars || [],
      forbiddenEnvVars: config.forbiddenEnvVars || this.DEFAULT_FORBIDDEN_ENV_VARS,
      enableAuditLog: config.enableAuditLog ?? true,
      auditLogPath: config.auditLogPath || path.join(config.baseDir, 'audit.log'),
      defaultFileMode: config.defaultFileMode || 0o644,
      defaultDirMode: config.defaultDirMode || 0o755,
      logger: config.logger || console as unknown as Logger,
    };
    
    if (!this.config.allowedDirs.includes(this.config.baseDir)) {
      this.config.allowedDirs.push(this.config.baseDir);
    }
  }

  async initialize(): Promise<void> {
    if (this.config.enableAuditLog) {
      const auditLogDir = path.dirname(this.config.auditLogPath);
      await fs.mkdir(auditLogDir, { recursive: true, mode: this.config.defaultDirMode });
      this.auditLogStream = await fs.open(this.config.auditLogPath, 'a');
      await this.setFilePermissions(this.config.auditLogPath, 0o600);
      this.config.logger.info('Аудит логирование инициализировано');
    }
  }

  async close(): Promise<void> {
    if (this.auditLogStream) {
      await this.auditLogStream.close();
      this.auditLogStream = undefined;
    }
  }

  sanitizeInput(input: string, context?: Record<string, unknown>): SanitizationResult {
    const original = input;
    const removedPatterns: string[] = [];
    
    if (input.length > this.config.maxInputLength) {
      input = input.substring(0, this.config.maxInputLength);
      removedPatterns.push('excessive_length');
      this.config.logger.warn(`Ввод обрезан до ${this.config.maxInputLength} символов`);
    }
    
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(input)) {
        removedPatterns.push(pattern.toString());
        input = input.replace(pattern, '');
      }
    }
    
    const modified = original !== input;
    
    if (modified) {
      this.logAudit({
        eventType: 'input_sanitized',
        severity: 'warning',
        message: 'Пользовательский ввод был санитизирован',
        context: { originalLength: original.length, sanitizedLength: input.length, removedPatterns, ...context },
        result: 'success',
      });
    }
    
    return { sanitized: input, modified, removedPatterns };
  }

  sanitizeInputs(inputs: Record<string, unknown>, context?: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value === 'string') {
        const result = this.sanitizeInput(value, { ...context, field: key });
        sanitized[key] = result.sanitized;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeInputs(value as Record<string, unknown>, context);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  validatePath(filePath: string, operation: 'read' | 'write' = 'read'): PathValidationResult {
    try {
      const normalizedPath = path.normalize(filePath);
      const resolvedPath = path.resolve(normalizedPath);
      
      if (normalizedPath.includes('..')) {
        this.logAudit({
          eventType: 'security_violation',
          severity: 'error',
          message: 'Попытка обхода директорий',
          context: { filePath, normalizedPath, operation },
          result: 'denied',
        });
        
        return {
          valid: false,
          reason: 'Путь содержит попытку обхода директорий (..)',
          errorCode: 'PATH_TRAVERSAL_ATTEMPT',
        };
      }
      
      for (const pattern of this.config.forbiddenPathPatterns) {
        if (pattern.test(resolvedPath)) {
          this.logAudit({
            eventType: 'security_violation',
            severity: 'error',
            message: 'Путь соответствует запрещенному паттерну',
            context: { filePath, resolvedPath, pattern: pattern.toString(), operation },
            result: 'denied',
          });
          
          return {
            valid: false,
            reason: `Путь соответствует запрещенному паттерну: ${pattern.toString()}`,
            errorCode: 'FORBIDDEN_PATH_PATTERN',
          };
        }
      }
      
      const isInAllowedDir = this.config.allowedDirs.some(allowedDir =>
        resolvedPath.startsWith(allowedDir)
      );
      
      if (!isInAllowedDir) {
        this.logAudit({
          eventType: 'security_violation',
          severity: 'error',
          message: 'Доступ к пути вне разрешенных директорий',
          context: { filePath, resolvedPath, allowedDirs: this.config.allowedDirs, operation },
          result: 'denied',
        });
        
        return {
          valid: false,
          reason: 'Путь находится вне разрешенных директорий',
          errorCode: 'PATH_OUTSIDE_ALLOWED_DIRS',
        };
      }
      
      this.logAudit({
        eventType: 'file_access',
        severity: 'info',
        message: `Доступ к файлу разрешен: ${operation}`,
        context: { filePath, resolvedPath, operation },
        result: 'success',
      });
      
      return { valid: true, normalizedPath: resolvedPath };
      
    } catch (error) {
      this.config.logger.error('Ошибка валидации пути:', error);
      return {
        valid: false,
        reason: `Ошибка валидации пути: ${(error as Error).message}`,
        errorCode: 'PATH_VALIDATION_ERROR',
      };
    }
  }

  resolveSafePath(relativePath: string, baseDir?: string): string {
    const base = baseDir || this.config.baseDir;
    const resolved = path.resolve(base, relativePath);
    
    if (!resolved.startsWith(base)) {
      throw new WorkflowErrorClass({
        code: 'PATH_TRAVERSAL_DETECTED',
        category: 'execution',
        severity: 'error',
        message: 'Обнаружена попытка обхода директорий',
        context: { relativePath, baseDir: base, resolved },
        recoverable: false,
        suggestions: ['Используйте только относительные пути без ".."', 'Проверьте правильность пути'],
      });
    }
    
    return resolved;
  }

  validateEnvVars(envVars: Record<string, string>): Record<string, string> {
    const validated: Record<string, string> = {};
    const violations: string[] = [];
    
    for (const [key, value] of Object.entries(envVars)) {
      if (this.config.forbiddenEnvVars.includes(key)) {
        violations.push(key);
        this.config.logger.warn(`Запрещенная переменная окружения: ${key}`);
        continue;
      }
      
      if (this.config.allowedEnvVars.length > 0 && !this.config.allowedEnvVars.includes(key)) {
        violations.push(key);
        this.config.logger.warn(`Переменная окружения не в whitelist: ${key}`);
        continue;
      }
      
      const sanitized = this.sanitizeInput(value, { envVar: key });
      validated[key] = sanitized.sanitized;
    }
    
    if (violations.length > 0) {
      this.logAudit({
        eventType: 'security_violation',
        severity: 'warning',
        message: 'Обнаружены запрещенные переменные окружения',
        context: { violations, requestedVars: Object.keys(envVars) },
        result: 'denied',
      });
    }
    
    this.logAudit({
      eventType: 'env_access',
      severity: 'info',
      message: 'Переменные окружения валидированы',
      context: { validatedCount: Object.keys(validated).length, violationsCount: violations.length },
      result: 'success',
    });
    
    return validated;
  }

  getEnvVar(key: string, defaultValue?: string): string | undefined {
    if (this.config.forbiddenEnvVars.includes(key)) {
      this.logAudit({
        eventType: 'security_violation',
        severity: 'warning',
        message: 'Попытка доступа к запрещенной переменной окружения',
        context: { key },
        result: 'denied',
      });
      return defaultValue;
    }
    
    if (this.config.allowedEnvVars.length > 0 && !this.config.allowedEnvVars.includes(key)) {
      this.logAudit({
        eventType: 'security_violation',
        severity: 'warning',
        message: 'Попытка доступа к переменной окружения не из whitelist',
        context: { key },
        result: 'denied',
      });
      return defaultValue;
    }
    
    const value = process.env[key];
    if (value !== undefined) {
      const sanitized = this.sanitizeInput(value, { envVar: key });
      return sanitized.sanitized;
    }
    
    return defaultValue;
  }

  async setFilePermissions(filePath: string, mode?: number): Promise<void> {
    const fileMode = mode || this.config.defaultFileMode;
    const validation = this.validatePath(filePath, 'write');
    
    if (!validation.valid) {
      throw new WorkflowErrorClass({
        code: validation.errorCode || 'PATH_VALIDATION_FAILED',
        category: 'execution',
        severity: 'error',
        message: validation.reason || 'Невалидный путь к файлу',
        context: { filePath, mode: fileMode },
        recoverable: false,
        suggestions: ['Проверьте правильность пути', 'Убедитесь, что путь находится в разрешенных директориях'],
      });
    }
    
    try {
      await fs.chmod(validation.normalizedPath!, fileMode);
      this.logAudit({
        eventType: 'permission_change',
        severity: 'info',
        message: 'Права доступа к файлу изменены',
        context: { filePath: validation.normalizedPath, mode: fileMode.toString(8) },
        result: 'success',
      });
      this.config.logger.debug(`Установлены права ${fileMode.toString(8)} для ${filePath}`);
    } catch (error) {
      this.logAudit({
        eventType: 'permission_change',
        severity: 'error',
        message: 'Не удалось изменить права доступа к файлу',
        context: { filePath: validation.normalizedPath, mode: fileMode.toString(8), error },
        result: 'error',
      });
      throw new WorkflowErrorClass({
        code: 'PERMISSION_CHANGE_FAILED',
        category: 'execution',
        severity: 'error',
        message: `Не удалось установить права доступа: ${(error as Error).message}`,
        context: { filePath, mode: fileMode, error },
        recoverable: true,
        suggestions: ['Проверьте права доступа к файлу', 'Убедитесь, что у процесса есть права на изменение прав доступа'],
      });
    }
  }

  async setDirectoryPermissions(dirPath: string, mode?: number): Promise<void> {
    const dirMode = mode || this.config.defaultDirMode;
    const validation = this.validatePath(dirPath, 'write');
    
    if (!validation.valid) {
      throw new WorkflowErrorClass({
        code: validation.errorCode || 'PATH_VALIDATION_FAILED',
        category: 'execution',
        severity: 'error',
        message: validation.reason || 'Невалидный путь к директории',
        context: { dirPath, mode: dirMode },
        recoverable: false,
        suggestions: ['Проверьте правильность пути', 'Убедитесь, что путь находится в разрешенных директориях'],
      });
    }
    
    try {
      await fs.chmod(validation.normalizedPath!, dirMode);
      this.logAudit({
        eventType: 'permission_change',
        severity: 'info',
        message: 'Права доступа к директории изменены',
        context: { dirPath: validation.normalizedPath, mode: dirMode.toString(8) },
        result: 'success',
      });
      this.config.logger.debug(`Установлены права ${dirMode.toString(8)} для ${dirPath}`);
    } catch (error) {
      this.logAudit({
        eventType: 'permission_change',
        severity: 'error',
        message: 'Не удалось изменить права доступа к директории',
        context: { dirPath: validation.normalizedPath, mode: dirMode.toString(8), error },
        result: 'error',
      });
      throw new WorkflowErrorClass({
        code: 'PERMISSION_CHANGE_FAILED',
        category: 'execution',
        severity: 'error',
        message: `Не удалось установить права доступа: ${(error as Error).message}`,
        context: { dirPath, mode: dirMode, error },
        recoverable: true,
        suggestions: ['Проверьте права доступа к директории', 'Убедитесь, что у процесса есть права на изменение прав доступа'],
      });
    }
  }

  private logAudit(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    if (!this.config.enableAuditLog) return;
    
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    
    const logLine = JSON.stringify(fullEntry) + '\n';
    
    if (this.auditLogStream) {
      this.auditLogStream.write(logLine, null, 'utf-8').catch(error => {
        this.config.logger.error('Ошибка записи в аудит лог:', error);
      });
    }
  }
}

export function createSecurityManager(config: Partial<SecurityConfig> = {}): SecurityManager {
  const defaultConfig: SecurityConfig = {
    baseDir: config.baseDir || process.cwd(),
    allowedDirs: config.allowedDirs,
    forbiddenPathPatterns: config.forbiddenPathPatterns,
    maxInputLength: config.maxInputLength,
    allowedEnvVars: config.allowedEnvVars,
    forbiddenEnvVars: config.forbiddenEnvVars,
    enableAuditLog: config.enableAuditLog ?? true,
    auditLogPath: config.auditLogPath,
    defaultFileMode: config.defaultFileMode,
    defaultDirMode: config.defaultDirMode,
    logger: config.logger,
  };
  
  return new SecurityManager(defaultConfig);
}
