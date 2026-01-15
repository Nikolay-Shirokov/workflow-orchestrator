/**
 * Модуль логирования для Workflow Orchestrator
 * Предоставляет настраиваемую систему логирования с различными уровнями
 */

import winston from 'winston';

/**
 * Уровни логирования
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warn',
  ERROR = 'error'
}

/**
 * Конфигурация логгера
 */
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logFilePath?: string;
}

/**
 * Класс для управления логированием
 */
export class Logger {
  private logger: winston.Logger;

  constructor(config: LoggerConfig) {
    const transports: winston.transport[] = [];

    // Консольный транспорт с цветным выводом
    if (config.enableConsole) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            })
          )
        })
      );
    }

    // Файловый транспорт
    if (config.enableFile && config.logFilePath) {
      transports.push(
        new winston.transports.File({
          filename: config.logFilePath,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.json()
          )
        })
      );
    }

    this.logger = winston.createLogger({
      level: config.level,
      transports
    });
  }

  /**
   * Логирование отладочной информации
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  /**
   * Логирование информационных сообщений
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  /**
   * Логирование предупреждений
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  /**
   * Логирование ошибок
   */
  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.logger.error(message, {
      ...meta,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined
    });
  }

  /**
   * Изменение уровня логирования
   */
  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }
}

/**
 * Глобальный экземпляр логгера по умолчанию
 */
let defaultLogger: Logger | null = null;

/**
 * Инициализация глобального логгера
 */
export function initializeLogger(config: LoggerConfig): Logger {
  defaultLogger = new Logger(config);
  return defaultLogger;
}

/**
 * Получение глобального логгера
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    // Читаем уровень логирования из переменной окружения
    const envLogLevel = process.env.LOG_LEVEL?.toLowerCase();
    
    // Если LOG_LEVEL=silent, отключаем консольный вывод полностью
    const enableConsole = envLogLevel !== 'silent';
    
    const logLevel = envLogLevel === 'debug' ? LogLevel.DEBUG :
                     envLogLevel === 'info' ? LogLevel.INFO :
                     envLogLevel === 'warn' ? LogLevel.WARNING :
                     envLogLevel === 'error' ? LogLevel.ERROR :
                     LogLevel.INFO;
    
    // Создаем логгер по умолчанию, если не инициализирован
    defaultLogger = new Logger({
      level: logLevel,
      enableConsole: enableConsole,
      enableFile: false
    });
  }
  return defaultLogger;
}
