/**
 * Property-based тесты для системы обработки ошибок
 * 
 * Feature: workflow-orchestrator, Property 5: Логирование ошибок и варианты восстановления
 * Validates: Requirements 1.5
 * 
 * Feature: workflow-orchestrator, Property 30: Сообщения об ошибках валидации состояния
 * Validates: Requirements 6.5
 */

import fc from 'fast-check';
import {
  ErrorCodes,
  createErrorHandler,
  Logger,
  LogLevel,
} from '../../src/core/index.js';

/**
 * Мок-логгер для тестирования
 */
class MockLogger extends Logger {
  public logs: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];
  
  constructor() {
    super({
      level: LogLevel.DEBUG,
      enableConsole: false,
      enableFile: false,
    });
  }
  
  debug(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', message, meta });
  }
  
  info(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', message, meta });
  }
  
  warn(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', message, meta });
  }
  
  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'error', message, meta: { ...meta, error } });
  }
  
  clear(): void {
    this.logs = [];
  }
  
  hasErrorLog(): boolean {
    return this.logs.some(log => log.level === 'error');
  }
  
  hasInfoLog(): boolean {
    return this.logs.some(log => log.level === 'info');
  }
  
  getErrorLogs(): Array<{ level: string; message: string; meta?: Record<string, unknown> }> {
    return this.logs.filter(log => log.level === 'error');
  }
}

/**
 * Генератор кодов ошибок
 */
const errorCodeArb = fc.constantFrom(
  ...Object.values(ErrorCodes)
);

/**
 * Генератор сообщений об ошибках
 */
const errorMessageArb = fc.string({ minLength: 10, maxLength: 200 });

/**
 * Генератор контекста ошибки
 */
const errorContextArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null)
  )
);

/**
 * Генератор предложений
 */
const suggestionsArb = fc.array(
  fc.string({ minLength: 10, maxLength: 100 }),
  { minLength: 0, maxLength: 5 }
);

describe('ErrorHandler Property Tests', () => {
  describe('Property 5: Логирование ошибок и варианты восстановления', () => {
    /**
     * Feature: workflow-orchestrator, Property 5: Логирование ошибок и варианты восстановления
     * Validates: Requirements 1.5
     * 
     * Для любой CLI-команды, возвращающей ненулевой код выхода,
     * система должна залогировать ошибку и предоставить варианты повтора или пропуска.
     */
    test('должен логировать все ошибки выполнения с вариантами восстановления', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          errorContextArb,
          fc.boolean(), // recoverable
          suggestionsArb,
          (message, context, recoverable, suggestions) => {
            // Arrange
            const logger = new MockLogger();
            const errorHandler = createErrorHandler(logger);
            
            // Act
            const error = errorHandler.createExecutionError(
              ErrorCodes.EXEC_COMMAND_FAILED,
              message,
              context,
              recoverable,
              suggestions
            );
            
            errorHandler.logError(error);
            
            // Assert
            // 1. Ошибка должна быть залогирована
            expect(logger.hasErrorLog()).toBe(true);
            
            // 2. Лог должен содержать код ошибки
            const errorLogs = logger.getErrorLogs();
            expect(errorLogs.length).toBeGreaterThan(0);
            const errorLog = errorLogs[0];
            expect(JSON.stringify(errorLog)).toContain(ErrorCodes.EXEC_COMMAND_FAILED);
            
            // 3. Если есть предложения, они должны быть залогированы
            if (suggestions.length > 0 || error.suggestions.length > 0) {
              expect(logger.hasInfoLog()).toBe(true);
            }
            
            // 4. Должны быть доступны варианты восстановления
            const recoveryOptions = errorHandler.getRecoveryOptions(error);
            expect(recoveryOptions).toBeDefined();
            expect(recoveryOptions.recommendedAction).toBeDefined();
            
            // 5. Для восстанавливаемых ошибок должны быть опции
            if (recoverable) {
              expect(
                recoveryOptions.canRetry || 
                recoveryOptions.canSkip || 
                recoveryOptions.canRollback
              ).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('должен предоставлять варианты повтора для ошибок таймаута', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          errorContextArb,
          (message, context) => {
            // Arrange
            const logger = new MockLogger();
            const errorHandler = createErrorHandler(logger);
            
            // Act
            const error = errorHandler.createExecutionError(
              ErrorCodes.EXEC_TIMEOUT,
              message,
              context,
              true
            );
            
            const recoveryOptions = errorHandler.getRecoveryOptions(error);
            
            // Assert
            // Для таймаутов должна быть возможность повтора
            expect(recoveryOptions.canRetry).toBe(true);
            expect(recoveryOptions.recommendedAction).toBe('retry');
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('должен предоставлять варианты пропуска для недоступных адаптеров', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          errorContextArb,
          fc.boolean(), // recoverable - не влияет на опции восстановления
          (message, context, recoverable) => {
            // Arrange
            const logger = new MockLogger();
            const errorHandler = createErrorHandler(logger);
            
            // Act
            const error = errorHandler.createExecutionError(
              ErrorCodes.EXEC_ADAPTER_UNAVAILABLE,
              message,
              context,
              recoverable // Флаг recoverable не влияет на опции - код ошибки определяет поведение
            );
            
            const recoveryOptions = errorHandler.getRecoveryOptions(error);
            
            // Assert
            // Для недоступных адаптеров должна быть возможность пропуска
            // независимо от флага recoverable
            expect(recoveryOptions.canSkip).toBe(true);
            expect(recoveryOptions.recommendedAction).toBe('skip');
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('фатальные ошибки не должны иметь вариантов восстановления', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          errorContextArb,
          (message, context) => {
            // Arrange
            const logger = new MockLogger();
            const errorHandler = createErrorHandler(logger);
            
            // Act
            const error = errorHandler.createConfigError(
              ErrorCodes.CONFIG_INVALID_YAML,
              message,
              context
            );
            
            const recoveryOptions = errorHandler.getRecoveryOptions(error);
            
            // Assert
            // Фатальные ошибки не восстанавливаются
            expect(error.severity).toBe('fatal');
            expect(recoveryOptions.canRetry).toBe(false);
            expect(recoveryOptions.canSkip).toBe(false);
            expect(recoveryOptions.canRollback).toBe(false);
            expect(recoveryOptions.recommendedAction).toBe('abort');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Property 30: Сообщения об ошибках валидации состояния', () => {
    /**
     * Feature: workflow-orchestrator, Property 30: Сообщения об ошибках валидации состояния
     * Validates: Requirements 6.5
     * 
     * Для любого файла состояния с невалидными данными,
     * валидация должна производить детальное сообщение об ошибке,
     * идентифицирующее конкретный сбой валидации.
     */
    
    /**
     * Генератор ошибок валидации
     */
    const validationErrorArb = fc.record({
      message: fc.string({ minLength: 10, maxLength: 100 }),
      code: fc.string({ minLength: 5, maxLength: 30 }),
      line: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
      column: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
    });
    
    /**
     * Генератор частичного состояния
     */
    const partialStateArb = fc.record({
      sessionId: fc.option(fc.string(), { nil: undefined }),
      workflowName: fc.option(fc.string(), { nil: undefined }),
      currentStep: fc.option(fc.string(), { nil: undefined }),
    });
    
    test('должен создавать детальные сообщения об ошибках валидации', () => {
      fc.assert(
        fc.property(
          fc.array(validationErrorArb, { minLength: 1, maxLength: 10 }),
          partialStateArb,
          (validationErrors, state) => {
            // Arrange
            const logger = new MockLogger();
            const errorHandler = createErrorHandler(logger);
            
            // Act
            const error = errorHandler.createStateValidationError(
              validationErrors,
              state
            );
            
            // Assert
            // 1. Ошибка должна содержать код валидации
            expect(error.code).toBe(ErrorCodes.STATE_VALIDATION_FAILED);
            
            // 2. Сообщение должно указывать количество ошибок
            expect(error.message).toContain(validationErrors.length.toString());
            
            // 3. Контекст должен содержать список ошибок
            expect(error.context.errors).toBeDefined();
            expect(Array.isArray(error.context.errors)).toBe(true);
            expect((error.context.errors as unknown[]).length).toBe(validationErrors.length);
            
            // 4. Каждая ошибка валидации должна быть в контексте
            validationErrors.forEach(valError => {
              const errorMessages = error.context.errors as string[];
              const found = errorMessages.some(msg => 
                msg.includes(valError.code) && msg.includes(valError.message)
              );
              expect(found).toBe(true);
            });
            
            // 5. Должны быть предложения по исправлению
            expect(error.suggestions.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('сообщения об ошибках должны включать номера строк если доступны', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              message: fc.string({ minLength: 10, maxLength: 100 }),
              code: fc.string({ minLength: 5, maxLength: 30 }),
              line: fc.integer({ min: 1, max: 1000 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          partialStateArb,
          (validationErrors, state) => {
            // Arrange
            const logger = new MockLogger();
            const errorHandler = createErrorHandler(logger);
            
            // Act
            const error = errorHandler.createStateValidationError(
              validationErrors,
              state
            );
            
            // Assert
            // Каждая ошибка с номером строки должна включать его в сообщение
            validationErrors.forEach(valError => {
              const errorMessages = error.context.errors as string[];
              const found = errorMessages.some(msg => 
                msg.includes(`line ${valError.line}`)
              );
              expect(found).toBe(true);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('форматированное сообщение должно быть читаемым и информативным', () => {
      fc.assert(
        fc.property(
          errorCodeArb,
          errorMessageArb,
          errorContextArb,
          suggestionsArb,
          (code, message, context, suggestions) => {
            // Arrange
            const logger = new MockLogger();
            const errorHandler = createErrorHandler(logger);
            
            // Act
            const error = errorHandler.createExecutionError(
              code,
              message,
              context,
              true,
              suggestions
            );
            
            const formatted = errorHandler.formatErrorMessage(error);
            
            // Assert
            // 1. Должно содержать код ошибки
            expect(formatted).toContain(code);
            
            // 2. Должно содержать сообщение
            expect(formatted).toContain(message);
            
            // 3. Должно содержать категорию
            expect(formatted).toContain(error.category);
            
            // 4. Если есть предложения, они должны быть в сообщении
            if (suggestions.length > 0) {
              expect(formatted).toContain('Suggestions');
              suggestions.forEach(suggestion => {
                expect(formatted).toContain(suggestion);
              });
            }
            
            // 5. Для восстанавливаемых ошибок должны быть опции восстановления
            if (error.recoverable) {
              expect(formatted).toContain('Recovery options');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('должен включать контекст состояния в ошибки валидации', () => {
      fc.assert(
        fc.property(
          fc.array(validationErrorArb, { minLength: 1, maxLength: 5 }),
          fc.record({
            sessionId: fc.string({ minLength: 10, maxLength: 50 }),
            currentStep: fc.string({ minLength: 5, maxLength: 30 }),
          }),
          (validationErrors, state) => {
            // Arrange
            const logger = new MockLogger();
            const errorHandler = createErrorHandler(logger);
            
            // Act
            const error = errorHandler.createStateValidationError(
              validationErrors,
              state
            );
            
            // Assert
            // Контекст должен включать информацию о состоянии
            expect(error.context.sessionId).toBe(state.sessionId);
            expect(error.context.currentStep).toBe(state.currentStep);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
