/**
 * Система обработки ошибок для Workflow Orchestrator
 * 
 * Предоставляет централизованную обработку ошибок с категоризацией,
 * логированием и генерацией полезных сообщений с предложениями по исправлению.
 */

import {
  WorkflowErrorClass,
  Logger,
  WorkflowState,
  ValidationError,
} from './types.js';

/**
 * Коды ошибок для различных категорий
 */
export const ErrorCodes = {
  // Ошибки конфигурации (CONFIG)
  CONFIG_INVALID_YAML: 'CONFIG_INVALID_YAML',
  CONFIG_INVALID_JSON: 'CONFIG_INVALID_JSON',
  CONFIG_MISSING_FIELD: 'CONFIG_MISSING_FIELD',
  CONFIG_INVALID_STEP: 'CONFIG_INVALID_STEP',
  CONFIG_CIRCULAR_DEPENDENCY: 'CONFIG_CIRCULAR_DEPENDENCY',
  CONFIG_INVALID_ADAPTER: 'CONFIG_INVALID_ADAPTER',
  CONFIG_INVALID_ROLE: 'CONFIG_INVALID_ROLE',
  CONFIG_INVALID_TEMPLATE: 'CONFIG_INVALID_TEMPLATE',
  
  // Ошибки выполнения (EXECUTION)
  EXEC_ADAPTER_NOT_FOUND: 'EXEC_ADAPTER_NOT_FOUND',
  EXEC_ADAPTER_UNAVAILABLE: 'EXEC_ADAPTER_UNAVAILABLE',
  EXEC_COMMAND_FAILED: 'EXEC_COMMAND_FAILED',
  EXEC_TIMEOUT: 'EXEC_TIMEOUT',
  EXEC_STEP_FAILED: 'EXEC_STEP_FAILED',
  EXEC_TEMPLATE_ERROR: 'EXEC_TEMPLATE_ERROR',
  EXEC_ARTIFACT_ERROR: 'EXEC_ARTIFACT_ERROR',
  EXEC_PARALLEL_ERROR: 'EXEC_PARALLEL_ERROR',
  
  // Ошибки состояния (STATE)
  STATE_FILE_NOT_FOUND: 'STATE_FILE_NOT_FOUND',
  STATE_INVALID_FORMAT: 'STATE_INVALID_FORMAT',
  STATE_CORRUPTED: 'STATE_CORRUPTED',
  STATE_MISSING_ARTIFACTS: 'STATE_MISSING_ARTIFACTS',
  STATE_VALIDATION_FAILED: 'STATE_VALIDATION_FAILED',
  STATE_SAVE_FAILED: 'STATE_SAVE_FAILED',
  
  // Ошибки пользовательского ввода (USER_INPUT)
  INPUT_VALIDATION_FAILED: 'INPUT_VALIDATION_FAILED',
  INPUT_PARSE_ERROR: 'INPUT_PARSE_ERROR',
  INPUT_REQUIRED_FIELD: 'INPUT_REQUIRED_FIELD',
  INPUT_INVALID_FORMAT: 'INPUT_INVALID_FORMAT',
} as const;

/**
 * Опции для восстановления после ошибки
 */
export interface RecoveryOptions {
  /** Можно ли повторить операцию */
  canRetry: boolean;
  
  /** Можно ли пропустить шаг */
  canSkip: boolean;
  
  /** Можно ли откатиться к предыдущему шагу */
  canRollback: boolean;
  
  /** Рекомендуемое действие */
  recommendedAction: 'retry' | 'skip' | 'rollback' | 'abort';
}

/**
 * Менеджер обработки ошибок
 */
export class ErrorHandler {
  private logger: Logger;
  
  constructor(logger: Logger) {
    this.logger = logger;
  }
  
  /**
   * Создание ошибки конфигурации
   */
  createConfigError(
    code: string,
    message: string,
    context: Record<string, unknown> = {},
    suggestions: string[] = []
  ): WorkflowErrorClass {
    return new WorkflowErrorClass({
      code,
      category: 'config',
      severity: 'fatal',
      message,
      context,
      recoverable: false,
      suggestions: suggestions.length > 0 ? suggestions : this.getDefaultSuggestions(code),
    });
  }
  
  /**
   * Создание ошибки выполнения
   */
  createExecutionError(
    code: string,
    message: string,
    context: Record<string, unknown> = {},
    recoverable: boolean = true,
    suggestions: string[] = []
  ): WorkflowErrorClass {
    return new WorkflowErrorClass({
      code,
      category: 'execution',
      severity: recoverable ? 'error' : 'fatal',
      message,
      context,
      recoverable,
      suggestions: suggestions.length > 0 ? suggestions : this.getDefaultSuggestions(code),
    });
  }
  
  /**
   * Создание ошибки состояния
   */
  createStateError(
    code: string,
    message: string,
    context: Record<string, unknown> = {},
    suggestions: string[] = []
  ): WorkflowErrorClass {
    return new WorkflowErrorClass({
      code,
      category: 'state',
      severity: 'error',
      message,
      context,
      recoverable: true,
      suggestions: suggestions.length > 0 ? suggestions : this.getDefaultSuggestions(code),
    });
  }
  
  /**
   * Создание ошибки пользовательского ввода
   */
  createUserInputError(
    code: string,
    message: string,
    context: Record<string, unknown> = {},
    suggestions: string[] = []
  ): WorkflowErrorClass {
    return new WorkflowErrorClass({
      code,
      category: 'user_input',
      severity: 'warning',
      message,
      context,
      recoverable: true,
      suggestions: suggestions.length > 0 ? suggestions : this.getDefaultSuggestions(code),
    });
  }
  
  /**
   * Логирование ошибки с контекстом
   */
  logError(error: WorkflowErrorClass, state?: WorkflowState): void {
    const errorInfo = {
      code: error.code,
      category: error.category,
      severity: error.severity,
      message: error.message,
      context: error.context,
      recoverable: error.recoverable,
      suggestions: error.suggestions,
      currentStep: state?.currentStep,
      sessionId: state?.sessionId,
    };
    
    // Логируем в зависимости от серьезности
    switch (error.severity) {
      case 'fatal':
        this.logger.error('FATAL ERROR:', errorInfo);
        break;
      case 'error':
        this.logger.error('ERROR:', errorInfo);
        break;
      case 'warning':
        this.logger.warn('WARNING:', errorInfo);
        break;
    }
    
    // Логируем предложения по исправлению
    if (error.suggestions.length > 0) {
      this.logger.info('Suggestions for recovery:');
      error.suggestions.forEach((suggestion, index) => {
        this.logger.info(`  ${index + 1}. ${suggestion}`);
      });
    }
  }
  
  /**
   * Получение опций восстановления для ошибки
   */
  getRecoveryOptions(error: WorkflowErrorClass): RecoveryOptions {
    // Определяем опции на основе категории и кода
    // Код ошибки имеет приоритет над severity
    switch (error.category) {
      case 'config':
        return {
          canRetry: false,
          canSkip: false,
          canRollback: false,
          recommendedAction: 'abort',
        };
        
      case 'execution':
        return this.getExecutionRecoveryOptions(error);
        
      case 'state':
        return this.getStateRecoveryOptions(error);
        
      case 'user_input':
        return {
          canRetry: true,
          canSkip: false,
          canRollback: false,
          recommendedAction: 'retry',
        };
        
      default:
        // Фатальные ошибки без специфичной категории не восстанавливаются
        if (error.severity === 'fatal') {
          return {
            canRetry: false,
            canSkip: false,
            canRollback: false,
            recommendedAction: 'abort',
          };
        }
        
        return {
          canRetry: error.recoverable,
          canSkip: false,
          canRollback: false,
          recommendedAction: error.recoverable ? 'retry' : 'abort',
        };
    }
  }
  
  /**
   * Получение опций восстановления для ошибок выполнения
   */
  private getExecutionRecoveryOptions(error: WorkflowErrorClass): RecoveryOptions {
    switch (error.code) {
      case ErrorCodes.EXEC_TIMEOUT:
      case ErrorCodes.EXEC_COMMAND_FAILED:
        return {
          canRetry: true,
          canSkip: true,
          canRollback: false,
          recommendedAction: 'retry',
        };
        
      case ErrorCodes.EXEC_ADAPTER_NOT_FOUND:
      case ErrorCodes.EXEC_ADAPTER_UNAVAILABLE:
        return {
          canRetry: false,
          canSkip: true,
          canRollback: false,
          recommendedAction: 'skip',
        };
        
      case ErrorCodes.EXEC_STEP_FAILED:
        return {
          canRetry: true,
          canSkip: true,
          canRollback: true,
          recommendedAction: 'retry',
        };
        
      default:
        return {
          canRetry: error.recoverable,
          canSkip: true,
          canRollback: false,
          recommendedAction: error.recoverable ? 'retry' : 'skip',
        };
    }
  }
  
  /**
   * Получение опций восстановления для ошибок состояния
   */
  private getStateRecoveryOptions(error: WorkflowErrorClass): RecoveryOptions {
    switch (error.code) {
      case ErrorCodes.STATE_FILE_NOT_FOUND:
        return {
          canRetry: false,
          canSkip: false,
          canRollback: false,
          recommendedAction: 'abort',
        };
        
      case ErrorCodes.STATE_MISSING_ARTIFACTS:
        return {
          canRetry: false,
          canSkip: false,
          canRollback: true,
          recommendedAction: 'rollback',
        };
        
      case ErrorCodes.STATE_VALIDATION_FAILED:
      case ErrorCodes.STATE_CORRUPTED:
        return {
          canRetry: false,
          canSkip: false,
          canRollback: true,
          recommendedAction: 'rollback',
        };
        
      default:
        return {
          canRetry: true,
          canSkip: false,
          canRollback: true,
          recommendedAction: 'retry',
        };
    }
  }
  
  /**
   * Получение предложений по умолчанию для кода ошибки
   */
  private getDefaultSuggestions(code: string): string[] {
    const suggestions: Record<string, string[]> = {
      // Ошибки конфигурации
      [ErrorCodes.CONFIG_INVALID_YAML]: [
        'Проверьте синтаксис YAML файла',
        'Убедитесь, что отступы используют пробелы, а не табуляцию',
        'Используйте онлайн валидатор YAML для проверки',
      ],
      [ErrorCodes.CONFIG_INVALID_JSON]: [
        'Проверьте синтаксис JSON файла',
        'Убедитесь, что все строки в двойных кавычках',
        'Проверьте наличие запятых между элементами',
      ],
      [ErrorCodes.CONFIG_MISSING_FIELD]: [
        'Добавьте отсутствующее обязательное поле',
        'Проверьте документацию для списка обязательных полей',
      ],
      [ErrorCodes.CONFIG_CIRCULAR_DEPENDENCY]: [
        'Удалите циклические зависимости между шагами',
        'Проверьте поле depends_on для каждого шага',
        'Постройте граф зависимостей для визуализации',
      ],
      
      // Ошибки выполнения
      [ErrorCodes.EXEC_ADAPTER_NOT_FOUND]: [
        'Проверьте имя адаптера в конфигурации',
        'Убедитесь, что адаптер зарегистрирован',
        'Проверьте список доступных адаптеров',
      ],
      [ErrorCodes.EXEC_ADAPTER_UNAVAILABLE]: [
        'Установите необходимую CLI утилиту',
        'Проверьте PATH для доступности команды',
        'Убедитесь, что API ключи настроены',
      ],
      [ErrorCodes.EXEC_TIMEOUT]: [
        'Увеличьте значение timeout в конфигурации',
        'Проверьте сетевое соединение',
        'Попробуйте выполнить операцию позже',
      ],
      [ErrorCodes.EXEC_COMMAND_FAILED]: [
        'Проверьте логи для деталей ошибки',
        'Убедитесь, что команда корректна',
        'Попробуйте выполнить команду вручную для отладки',
      ],
      
      // Ошибки состояния
      [ErrorCodes.STATE_FILE_NOT_FOUND]: [
        'Убедитесь, что процесс был запущен ранее',
        'Проверьте путь к файлу состояния',
        'Начните новую сессию вместо возобновления',
      ],
      [ErrorCodes.STATE_INVALID_FORMAT]: [
        'Не редактируйте файл состояния вручную',
        'Восстановите из резервной копии',
        'Начните новую сессию',
      ],
      [ErrorCodes.STATE_MISSING_ARTIFACTS]: [
        'Откатитесь к более раннему шагу',
        'Восстановите артефакты из резервной копии',
        'Начните процесс заново',
      ],
      [ErrorCodes.STATE_VALIDATION_FAILED]: [
        'Проверьте целостность файла состояния',
        'Убедитесь, что все обязательные поля присутствуют',
        'Восстановите из резервной копии или начните заново',
      ],
      
      // Ошибки пользовательского ввода
      [ErrorCodes.INPUT_VALIDATION_FAILED]: [
        'Проверьте формат введенных данных',
        'Убедитесь, что все обязательные поля заполнены',
        'Следуйте примерам в подсказках',
      ],
      [ErrorCodes.INPUT_PARSE_ERROR]: [
        'Проверьте синтаксис введенных данных',
        'Убедитесь, что формат соответствует ожидаемому (JSON/YAML/Markdown)',
        'Используйте предоставленный шаблон',
      ],
    };
    
    return suggestions[code] || [
      'Проверьте логи для дополнительной информации',
      'Обратитесь к документации',
      'Попробуйте выполнить операцию снова',
    ];
  }
  
  /**
   * Форматирование сообщения об ошибке для пользователя
   */
  formatErrorMessage(error: WorkflowErrorClass): string {
    const lines: string[] = [];
    
    lines.push(`❌ ${error.severity.toUpperCase()}: ${error.message}`);
    lines.push('');
    lines.push(`Code: ${error.code}`);
    lines.push(`Category: ${error.category}`);
    
    if (Object.keys(error.context).length > 0) {
      lines.push('');
      lines.push('Context:');
      Object.entries(error.context).forEach(([key, value]) => {
        lines.push(`  ${key}: ${JSON.stringify(value)}`);
      });
    }
    
    if (error.suggestions.length > 0) {
      lines.push('');
      lines.push('💡 Suggestions:');
      error.suggestions.forEach((suggestion, index) => {
        lines.push(`  ${index + 1}. ${suggestion}`);
      });
    }
    
    const recoveryOptions = this.getRecoveryOptions(error);
    if (error.recoverable) {
      lines.push('');
      lines.push('Recovery options:');
      if (recoveryOptions.canRetry) lines.push('  - Retry the operation');
      if (recoveryOptions.canSkip) lines.push('  - Skip this step');
      if (recoveryOptions.canRollback) lines.push('  - Rollback to previous step');
      lines.push(`  Recommended: ${recoveryOptions.recommendedAction}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Создание ошибки валидации состояния с детальным сообщением
   */
  createStateValidationError(
    validationErrors: ValidationError[],
    state: Partial<WorkflowState>
  ): WorkflowErrorClass {
    const errorMessages = validationErrors.map(err => 
      `${err.code}: ${err.message}${err.line ? ` (line ${err.line})` : ''}`
    );
    
    return this.createStateError(
      ErrorCodes.STATE_VALIDATION_FAILED,
      `State validation failed with ${validationErrors.length} error(s)`,
      {
        errors: errorMessages,
        sessionId: state.sessionId,
        currentStep: state.currentStep,
      },
      [
        'Fix the validation errors listed above',
        'Ensure all required fields are present and valid',
        'Check the state file format matches the schema',
        'Restore from backup if the state is corrupted',
      ]
    );
  }
}

/**
 * Создание глобального экземпляра обработчика ошибок
 */
export function createErrorHandler(logger: Logger): ErrorHandler {
  return new ErrorHandler(logger);
}
