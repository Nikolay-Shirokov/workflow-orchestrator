/**
 * Менеджер состояния рабочего процесса
 * 
 * Отвечает за:
 * - Создание и загрузку файлов состояния
 * - Обновление состояния при завершении шагов
 * - Валидацию целостности состояния
 * - Резервное копирование состояния
 * - Блокировку файлов для предотвращения конкурентного доступа
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkflowState, WorkflowStatus, StepHistory, WorkflowErrorClass } from './types.js';
import { Logger } from './logger.js';

/**
 * Интерфейс менеджера состояния
 */
export interface StateManager {
  /**
   * Создание нового файла состояния
   * @param workflowName - Имя рабочего процесса
   * @param workflowVersion - Версия рабочего процесса
   * @param initialStep - Начальный шаг
   * @returns Promise<WorkflowState> - Созданное состояние
   */
  createState(
    workflowName: string,
    workflowVersion: string,
    initialStep: string
  ): Promise<WorkflowState>;

  /**
   * Загрузка состояния из файла
   * @param sessionId - ID сессии
   * @returns Promise<WorkflowState> - Загруженное состояние
   */
  loadState(sessionId: string): Promise<WorkflowState>;

  /**
   * Сохранение состояния в файл
   * @param state - Состояние для сохранения
   * @returns Promise<void>
   */
  saveState(state: WorkflowState): Promise<void>;

  /**
   * Обновление состояния при завершении шага
   * @param state - Текущее состояние
   * @param stepHistory - История выполнения шага
   * @returns Promise<WorkflowState> - Обновленное состояние
   */
  updateStepCompletion(
    state: WorkflowState,
    stepHistory: StepHistory
  ): Promise<WorkflowState>;

  /**
   * Валидация целостности состояния
   * @param state - Состояние для валидации
   * @returns Promise<ValidationResult> - Результат валидации
   */
  validateState(state: WorkflowState): Promise<StateValidationResult>;

  /**
   * Валидация целостности артефактов
   * @param state - Состояние с артефактами
   * @returns Promise<ArtifactValidationResult> - Результат валидации
   */
  validateArtifacts(state: WorkflowState): Promise<ArtifactValidationResult>;

  /**
   * Создание резервной копии состояния
   * @param state - Состояние для резервного копирования
   * @returns Promise<string> - Путь к резервной копии
   */
  createBackup(state: WorkflowState): Promise<string>;

  /**
   * Восстановление из резервной копии
   * @param sessionId - ID сессии
   * @param backupPath - Путь к резервной копии
   * @returns Promise<WorkflowState> - Восстановленное состояние
   */
  restoreFromBackup(sessionId: string, backupPath: string): Promise<WorkflowState>;

  /**
   * Получение пути к файлу состояния
   * @param sessionId - ID сессии
   * @returns string - Путь к файлу
   */
  getStatePath(sessionId: string): string;
}

/**
 * Результат валидации состояния
 */
export interface StateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Результат валидации артефактов
 */
export interface ArtifactValidationResult {
  valid: boolean;
  missingArtifacts: string[];
  corruptedArtifacts: string[];
}

/**
 * Конфигурация менеджера состояния
 */
export interface StateManagerConfig {
  /** Директория для хранения файлов состояния */
  stateDir: string;
  
  /** Директория для резервных копий */
  backupDir?: string;
  
  /** Включить блокировку файлов */
  enableFileLocking?: boolean;
  
  /** Таймаут блокировки в миллисекундах */
  lockTimeout?: number;
  
  /** Логгер */
  logger?: Logger;
}

/**
 * Реализация менеджера состояния по умолчанию
 */
export class DefaultStateManager implements StateManager {
  private config: Required<StateManagerConfig>;
  private locks: Map<string, Promise<void>> = new Map();
  
  /**
   * Кэш состояний для инкрементальных обновлений
   */
  private stateCache: Map<string, WorkflowState> = new Map();
  
  /**
   * Флаг для отслеживания изменений состояния
   */
  private dirtyStates: Set<string> = new Set();

  constructor(config: StateManagerConfig) {
    this.config = {
      stateDir: config.stateDir,
      backupDir: config.backupDir || path.join(config.stateDir, 'backups'),
      enableFileLocking: config.enableFileLocking ?? true,
      lockTimeout: config.lockTimeout || 30000,
      logger: config.logger || console as unknown as Logger,
    };
  }

  /**
   * Создание нового файла состояния
   */
  async createState(
    workflowName: string,
    workflowVersion: string,
    initialStep: string
  ): Promise<WorkflowState> {
    // Генерация уникального ID сессии
    const sessionId = this.generateSessionId();
    const now = new Date().toISOString();

    // Создание начального состояния
    const state: WorkflowState = {
      sessionId,
      workflowName,
      workflowVersion,
      currentStep: initialStep,
      status: 'running',
      startedAt: now,
      updatedAt: now,
      completedSteps: [],
      artifacts: {},
      context: {},
      history: [],
      errors: [],
    };

    // Создание директории для состояния, если не существует
    await this.ensureStateDirectory();

    // Сохранение состояния
    await this.saveState(state);

    this.config.logger.info(`Создан файл состояния для сессии ${sessionId}`);

    return state;
  }

  /**
   * Загрузка состояния из файла с кэшированием
   */
  async loadState(sessionId: string): Promise<WorkflowState> {
    const statePath = this.getStatePath(sessionId);

    // Проверка существования файла
    try {
      await fs.access(statePath);
    } catch (error) {
      throw new WorkflowErrorClass({
        code: 'STATE_FILE_NOT_FOUND',
        category: 'state',
        severity: 'fatal',
        message: `Файл состояния не найден: ${statePath}`,
        context: { sessionId, statePath },
        recoverable: false,
        suggestions: [
          'Проверьте правильность ID сессии',
          'Убедитесь, что процесс был запущен ранее',
          'Проверьте наличие резервных копий',
        ],
      });
    }

    // Загрузка с блокировкой
    return this.withLock(sessionId, async () => {
      const content = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(content) as WorkflowState;

      // Валидация загруженного состояния
      const validation = await this.validateState(state);
      if (!validation.valid) {
        throw new WorkflowErrorClass({
          code: 'STATE_VALIDATION_FAILED',
          category: 'state',
          severity: 'error',
          message: 'Загруженное состояние невалидно',
          context: { sessionId, errors: validation.errors },
          recoverable: true,
          suggestions: [
            'Проверьте целостность файла состояния',
            'Попробуйте восстановить из резервной копии',
            'Исправьте ошибки валидации вручную',
          ],
        });
      }

      // Обновляем кэш свежими данными с диска
      this.stateCache.set(sessionId, state);
      // Убираем флаг изменений, так как загрузили с диска
      this.dirtyStates.delete(sessionId);
      
      this.config.logger.info(`Загружено состояние для сессии ${sessionId}`);
      return state;
    });
  }

  /**
   * Сохранение состояния в файл с инкрементальными обновлениями
   */
  async saveState(state: WorkflowState): Promise<void> {
    const statePath = this.getStatePath(state.sessionId);

    // Обновление timestamp
    state.updatedAt = new Date().toISOString();

    // Обновляем кэш
    this.stateCache.set(state.sessionId, state);
    this.dirtyStates.add(state.sessionId);

    // Сохранение с блокировкой
    await this.withLock(state.sessionId, async () => {
      // Атомарная запись: сначала во временный файл, затем переименование
      const tempPath = `${statePath}.tmp`;
      const content = JSON.stringify(state, null, 2);
      
      await fs.writeFile(tempPath, content, 'utf-8');
      
      // Переименование с retry логикой для обработки EPERM на Windows
      await this.renameWithRetry(tempPath, statePath);
      
      // Убираем флаг изменений после успешного сохранения
      this.dirtyStates.delete(state.sessionId);

      this.config.logger.debug(`Сохранено состояние для сессии ${state.sessionId}`);
    });
  }
  
  /**
   * Сброс всех несохраненных изменений состояния
   */
  async flushDirtyStates(): Promise<void> {
    const dirtySessionIds = Array.from(this.dirtyStates);
    
    for (const sessionId of dirtySessionIds) {
      const state = this.stateCache.get(sessionId);
      if (state) {
        await this.saveState(state);
      }
    }
  }

  /**
   * Обновление состояния при завершении шага с инкрементальным подходом
   */
  async updateStepCompletion(
    state: WorkflowState,
    stepHistory: StepHistory
  ): Promise<WorkflowState> {
    // Добавление шага в список завершенных
    // НЕ добавляем шаги со статусом 'skipped', если процесс приостановлен
    // (это означает, что шаг требует ввода пользователя и должен быть выполнен при возобновлении)
    const shouldAddToCompleted = stepHistory.status !== 'skipped' || state.status !== 'paused';
    
    if (shouldAddToCompleted && !state.completedSteps.includes(stepHistory.stepId)) {
      state.completedSteps.push(stepHistory.stepId);
    }

    // Добавление в историю
    state.history.push(stepHistory);

    // Обновление артефактов
    for (const artifactPath of stepHistory.artifacts) {
      const artifactName = path.basename(artifactPath);
      state.artifacts[artifactName] = artifactPath;
    }

    // Обновление статуса при ошибке
    if (stepHistory.status === 'failed') {
      state.status = 'failed';
      state.errors.push({
        stepId: stepHistory.stepId,
        timestamp: stepHistory.completedAt,
        error: stepHistory.error || 'Unknown error',
        retryCount: 0,
      });
    }

    // Инкрементальное сохранение (только измененные поля)
    await this.saveState(state);

    this.config.logger.info(
      `Обновлено состояние после завершения шага ${stepHistory.stepId} (статус: ${stepHistory.status})`
    );

    return state;
  }

  /**
   * Валидация целостности состояния
   */
  async validateState(state: WorkflowState): Promise<StateValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Проверка обязательных полей
    if (!state.sessionId) {
      errors.push('Отсутствует обязательное поле: sessionId');
    }
    if (!state.workflowName) {
      errors.push('Отсутствует обязательное поле: workflowName');
    }
    if (!state.workflowVersion) {
      errors.push('Отсутствует обязательное поле: workflowVersion');
    }
    if (!state.currentStep) {
      errors.push('Отсутствует обязательное поле: currentStep');
    }
    if (!state.status) {
      errors.push('Отсутствует обязательное поле: status');
    }
    if (!state.startedAt) {
      errors.push('Отсутствует обязательное поле: startedAt');
    }
    if (!state.updatedAt) {
      errors.push('Отсутствует обязательное поле: updatedAt');
    }

    // Проверка формата timestamp
    if (state.startedAt && !this.isValidISO8601(state.startedAt)) {
      errors.push(`Невалидный формат startedAt: ${state.startedAt}`);
    }
    if (state.updatedAt && !this.isValidISO8601(state.updatedAt)) {
      errors.push(`Невалидный формат updatedAt: ${state.updatedAt}`);
    }
    if (state.completedAt && !this.isValidISO8601(state.completedAt)) {
      errors.push(`Невалидный формат completedAt: ${state.completedAt}`);
    }

    // Проверка валидности статуса
    const validStatuses: WorkflowStatus[] = ['running', 'paused', 'completed', 'failed'];
    if (state.status && !validStatuses.includes(state.status)) {
      errors.push(`Невалидный статус: ${state.status}`);
    }

    // Проверка массивов
    if (!Array.isArray(state.completedSteps)) {
      errors.push('completedSteps должен быть массивом');
    }
    if (!Array.isArray(state.history)) {
      errors.push('history должен быть массивом');
    }
    if (!Array.isArray(state.errors)) {
      errors.push('errors должен быть массивом');
    }

    // Проверка объектов
    if (typeof state.artifacts !== 'object' || state.artifacts === null) {
      errors.push('artifacts должен быть объектом');
    }
    if (typeof state.context !== 'object' || state.context === null) {
      errors.push('context должен быть объектом');
    }

    // Предупреждения
    if (state.completedSteps.length === 0 && state.status === 'completed') {
      warnings.push('Статус "completed", но нет завершенных шагов');
    }
    if (state.errors.length > 0 && state.status === 'completed') {
      warnings.push('Статус "completed", но есть ошибки');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Валидация целостности артефактов
   */
  async validateArtifacts(state: WorkflowState): Promise<ArtifactValidationResult> {
    const missingArtifacts: string[] = [];
    const corruptedArtifacts: string[] = [];

    // Проверка каждого артефакта
    for (const [, artifactPath] of Object.entries(state.artifacts)) {
      try {
        // Проверка существования файла
        await fs.access(artifactPath);
        
        // Проверка читаемости
        const stats = await fs.stat(artifactPath);
        if (stats.size === 0) {
          corruptedArtifacts.push(artifactPath);
          this.config.logger.warn(`Артефакт пустой: ${artifactPath}`);
        }
      } catch (error) {
        missingArtifacts.push(artifactPath);
        this.config.logger.warn(`Артефакт не найден: ${artifactPath}`);
      }
    }

    return {
      valid: missingArtifacts.length === 0 && corruptedArtifacts.length === 0,
      missingArtifacts,
      corruptedArtifacts,
    };
  }

  /**
   * Создание резервной копии состояния
   */
  async createBackup(state: WorkflowState): Promise<string> {
    // Создание директории для резервных копий
    await fs.mkdir(this.config.backupDir, { recursive: true });

    // Генерация имени резервной копии с timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${state.sessionId}_${timestamp}.json`;
    const backupPath = path.join(this.config.backupDir, backupFileName);

    // Копирование файла состояния
    const statePath = this.getStatePath(state.sessionId);
    await fs.copyFile(statePath, backupPath);

    this.config.logger.info(`Создана резервная копия: ${backupPath}`);

    return backupPath;
  }

  /**
   * Восстановление из резервной копии
   */
  async restoreFromBackup(sessionId: string, backupPath: string): Promise<WorkflowState> {
    // Проверка существования резервной копии
    try {
      await fs.access(backupPath);
    } catch (error) {
      throw new WorkflowErrorClass({
        code: 'BACKUP_NOT_FOUND',
        category: 'state',
        severity: 'error',
        message: `Резервная копия не найдена: ${backupPath}`,
        context: { sessionId, backupPath },
        recoverable: false,
        suggestions: [
          'Проверьте правильность пути к резервной копии',
          'Просмотрите список доступных резервных копий',
        ],
      });
    }

    // Загрузка состояния из резервной копии
    const content = await fs.readFile(backupPath, 'utf-8');
    const state = JSON.parse(content) as WorkflowState;

    // Валидация
    const validation = await this.validateState(state);
    if (!validation.valid) {
      throw new WorkflowErrorClass({
        code: 'BACKUP_VALIDATION_FAILED',
        category: 'state',
        severity: 'error',
        message: 'Резервная копия невалидна',
        context: { backupPath, errors: validation.errors },
        recoverable: false,
        suggestions: [
          'Попробуйте другую резервную копию',
          'Проверьте целостность файла резервной копии',
        ],
      });
    }

    // Восстановление файла состояния
    const statePath = this.getStatePath(sessionId);
    await fs.copyFile(backupPath, statePath);

    this.config.logger.info(`Восстановлено состояние из резервной копии: ${backupPath}`);

    return state;
  }

  /**
   * Получение пути к файлу состояния
   */
  getStatePath(sessionId: string): string {
    return path.join(this.config.stateDir, `${sessionId}.json`);
  }

  // ========== Вспомогательные методы ==========

  /**
   * Генерация уникального ID сессии
   */
  private generateSessionId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Создание директории для состояния
   */
  private async ensureStateDirectory(): Promise<void> {
    await fs.mkdir(this.config.stateDir, { recursive: true });
  }

  /**
   * Проверка валидности ISO 8601 timestamp
   */
  private isValidISO8601(dateString: string): boolean {
    const date = new Date(dateString);
    return date.toISOString() === dateString;
  }

  /**
   * Выполнение операции с блокировкой файла
   */
  private async withLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    if (!this.config.enableFileLocking) {
      return operation();
    }

    // Ожидание освобождения существующей блокировки
    const existingLock = this.locks.get(sessionId);
    if (existingLock) {
      await existingLock;
    }

    // Создание новой блокировки
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.locks.set(sessionId, lockPromise);

    try {
      // Выполнение операции с таймаутом
      const timeout = this.createTimeout(this.config.lockTimeout);
      try {
        const result = await Promise.race([
          operation(),
          timeout.promise,
        ]);

        return result as T;
      } finally {
        timeout.cancel();
      }
    } finally {
      // Освобождение блокировки
      releaseLock!();
      this.locks.delete(sessionId);
    }
  }

  /**
   * Создание таймаута
   */
  private createTimeout(ms: number): { promise: Promise<never>; cancel: () => void } {
    let timeoutId: NodeJS.Timeout | undefined;

    const promise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new WorkflowErrorClass({
            code: 'LOCK_TIMEOUT',
            category: 'state',
            severity: 'error',
            message: `Таймаут блокировки файла (${ms}ms)`,
            context: { timeout: ms },
            recoverable: true,
            suggestions: [
              'Попробуйте снова',
              'Проверьте, не заблокирован ли файл другим процессом',
              'Увеличьте таймаут блокировки',
            ],
          })
        );
      }, ms);
    });

    return {
      promise,
      cancel: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };
  }

  /**
   * Переименование файла с retry логикой для обработки EPERM на Windows
   * 
   * На Windows операция rename может временно завершаться с ошибкой EPERM
   * из-за блокировки файлов антивирусом или другими процессами.
   * Эта функция повторяет попытку с экспоненциальной задержкой.
   * 
   * @param oldPath - Исходный путь
   * @param newPath - Новый путь
   * @param maxRetries - Максимальное количество попыток (по умолчанию 5)
   * @param initialDelay - Начальная задержка в мс (по умолчанию 10)
   */
  private async renameWithRetry(
    oldPath: string,
    newPath: string,
    maxRetries: number = 5,
    initialDelay: number = 10
  ): Promise<void> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await fs.rename(oldPath, newPath);
        
        // Успешно переименовали
        if (attempt > 0) {
          this.config.logger.debug(
            `Успешно переименован файл после ${attempt} попыток: ${oldPath} -> ${newPath}`
          );
        }
        return;
      } catch (error: any) {
        lastError = error;
        
        // Проверяем, является ли это EPERM ошибкой
        const isEPERM = error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'EACCES';
        
        if (!isEPERM || attempt === maxRetries) {
          // Если это не EPERM или мы исчерпали попытки, выбрасываем ошибку
          break;
        }
        
        // Вычисляем задержку с экспоненциальным ростом
        const delay = initialDelay * Math.pow(2, attempt);
        
        this.config.logger.debug(
          `Попытка ${attempt + 1}/${maxRetries + 1} переименования не удалась (${error.code}), ` +
          `повтор через ${delay}мс: ${oldPath} -> ${newPath}`
        );
        
        // Ждем перед следующей попыткой
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Если мы здесь, значит все попытки исчерпаны
    throw new WorkflowErrorClass({
      code: 'FILE_RENAME_FAILED',
      category: 'state',
      severity: 'error',
      message: `Не удалось переименовать файл после ${maxRetries + 1} попыток: ${lastError?.message}`,
      context: { 
        oldPath, 
        newPath, 
        attempts: maxRetries + 1,
        errorCode: (lastError as any)?.code,
      },
      recoverable: true,
      suggestions: [
        'Проверьте, не заблокирован ли файл антивирусом',
        'Убедитесь, что у процесса есть права на запись',
        'Попробуйте закрыть другие программы, которые могут использовать файл',
        'Временно отключите антивирус и попробуйте снова',
      ],
    });
  }
}

/**
 * Создание менеджера состояния с конфигурацией по умолчанию
 */
export function createStateManager(config: Partial<StateManagerConfig> = {}): StateManager {
  const defaultConfig: StateManagerConfig = {
    stateDir: config.stateDir || './state',
    backupDir: config.backupDir,
    enableFileLocking: config.enableFileLocking ?? true,
    lockTimeout: config.lockTimeout || 30000,
    logger: config.logger,
  };

  return new DefaultStateManager(defaultConfig);
}





