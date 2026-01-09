/**
 * Движок рабочих процессов
 * 
 * Отвечает за:
 * - Управление выполнением процесса
 * - Загрузку конфигурации процесса
 * - Определение порядка выполнения шагов
 * - Управление контекстом выполнения
 * - Координацию между компонентами
 */

import {
  WorkflowConfig,
  WorkflowStep,
  WorkflowState,
  ExecutionContext,
  StepResult,
  WorkflowErrorClass,
  Logger,
  StepExecutor,
  AdapterRegistry,
  TemplateEngine,
  ArtifactManager
} from './types.js';
import { WorkflowConfigParser, DependencyGraph } from './workflow-config-parser.js';
import { StateManager } from './state-manager.js';

/**
 * Интерфейс движка рабочих процессов
 */
export interface WorkflowEngine {
  /**
   * Загрузка конфигурации процесса из файла
   * @param configPath - Путь к файлу конфигурации
   * @returns Promise<WorkflowConfig>
   */
  loadConfig(configPath: string): Promise<WorkflowConfig>;

  /**
   * Запуск выполнения рабочего процесса
   * @param config - Конфигурация процесса
   * @param initialContext - Начальный контекст (опционально)
   * @returns Promise<WorkflowState> - Финальное состояние
   */
  execute(
    config: WorkflowConfig,
    initialContext?: Record<string, unknown>
  ): Promise<WorkflowState>;

  /**
   * Возобновление выполнения процесса с сохраненного состояния
   * @param sessionId - ID сессии для возобновления
   * @param config - Конфигурация процесса
   * @returns Promise<WorkflowState> - Финальное состояние
   */
  resume(sessionId: string, config: WorkflowConfig): Promise<WorkflowState>;

  /**
   * Определение порядка выполнения шагов
   * @param steps - Массив шагов
   * @returns string[] - Порядок ID шагов
   */
  determineExecutionOrder(steps: WorkflowStep[]): string[];

  /**
   * Построение графа зависимостей
   * @param steps - Массив шагов
   * @returns DependencyGraph
   */
  buildDependencyGraph(steps: WorkflowStep[]): DependencyGraph;
}

/**
 * Конфигурация движка рабочих процессов
 */
export interface WorkflowEngineConfig {
  /** Парсер конфигурации */
  configParser: WorkflowConfigParser;

  /** Менеджер состояния */
  stateManager: StateManager;

  /** Исполнитель шагов */
  stepExecutor: StepExecutor;

  /** Реестр адаптеров */
  adapterRegistry: AdapterRegistry;

  /** Движок шаблонов */
  templateEngine: TemplateEngine;

  /** Менеджер артефактов */
  artifactManager: ArtifactManager;

  /** Логгер */
  logger: Logger;
}

/**
 * Реализация движка рабочих процессов по умолчанию
 */
export class DefaultWorkflowEngine implements WorkflowEngine {
  private configParser: WorkflowConfigParser;
  private stateManager: StateManager;
  private stepExecutor: StepExecutor;
  private adapterRegistry: AdapterRegistry;
  private templateEngine: TemplateEngine;
  private artifactManager: ArtifactManager;
  private logger: Logger;

  constructor(config: WorkflowEngineConfig) {
    this.configParser = config.configParser;
    this.stateManager = config.stateManager;
    this.stepExecutor = config.stepExecutor;
    this.adapterRegistry = config.adapterRegistry;
    this.templateEngine = config.templateEngine;
    this.artifactManager = config.artifactManager;
    this.logger = config.logger;
  }

  /**
   * Загрузка конфигурации процесса из файла
   */
  async loadConfig(configPath: string): Promise<WorkflowConfig> {
    this.logger.info(`Загрузка конфигурации из ${configPath}`);

    try {
      const config = await this.configParser.loadFromFile(configPath);

      // Валидация конфигурации
      const validation = this.configParser.validate(config);
      if (!validation.valid) {
        const errorMessages = validation.errors.map(e => e.message).join('; ');
        throw new WorkflowErrorClass({
          code: 'CONFIG_VALIDATION_FAILED',
          category: 'config',
          severity: 'fatal',
          message: `Конфигурация невалидна: ${errorMessages}`,
          context: {
            configPath,
            errors: validation.errors,
            warnings: validation.warnings
          },
          recoverable: false,
          suggestions: [
            'Исправьте ошибки в конфигурации',
            'Проверьте синтаксис YAML/JSON',
            'Убедитесь, что все обязательные поля заполнены'
          ]
        });
      }

      // Вывод предупреждений, если есть
      if (validation.warnings.length > 0) {
        validation.warnings.forEach(warning => {
          this.logger.warn(`Предупреждение конфигурации: ${warning.message}`);
        });
      }

      this.logger.info(`Конфигурация загружена успешно: ${config.name} v${config.version}`);
      return config;

    } catch (error) {
      if (error instanceof WorkflowErrorClass) {
        throw error;
      }

      throw new WorkflowErrorClass({
        code: 'CONFIG_LOAD_FAILED',
        category: 'config',
        severity: 'fatal',
        message: `Не удалось загрузить конфигурацию: ${(error as Error).message}`,
        context: { configPath, error },
        recoverable: false,
        suggestions: [
          'Проверьте существование файла',
          'Проверьте права доступа к файлу',
          'Убедитесь, что файл содержит валидный YAML/JSON'
        ]
      });
    }
  }

  /**
   * Запуск выполнения рабочего процесса
   */
  async execute(
    config: WorkflowConfig,
    initialContext: Record<string, unknown> = {}
  ): Promise<WorkflowState> {
    this.logger.info(`Начало выполнения процесса: ${config.name} v${config.version}`);

    // Определение порядка выполнения шагов
    const executionOrder = this.determineExecutionOrder(config.steps);
    this.logger.info(`Порядок выполнения: ${executionOrder.join(' -> ')}`);

    // Создание начального состояния
    const firstStepId = executionOrder[0];
    const state = await this.stateManager.createState(
      config.name,
      config.version,
      firstStepId
    );

    // Инициализация контекста
    state.context = {
      ...initialContext,
      default_adapter: config.settings.default_adapter,
      artifacts_dir: config.settings.artifacts_dir,
      workflow_name: config.name,
      workflow_version: config.version,
      session_id: state.sessionId
    };

    // Сохранение начального состояния
    await this.stateManager.saveState(state);

    // Выполнение процесса
    return this.executeWorkflow(config, state, executionOrder);
  }

  /**
   * Возобновление выполнения процесса с сохраненного состояния
   */
  async resume(sessionId: string, config: WorkflowConfig): Promise<WorkflowState> {
    this.logger.info(`Возобновление процесса для сессии ${sessionId}`);

    // Загрузка состояния
    const state = await this.stateManager.loadState(sessionId);

    // Проверка совместимости версий
    if (state.workflowName !== config.name) {
      throw new WorkflowErrorClass({
        code: 'WORKFLOW_NAME_MISMATCH',
        category: 'state',
        severity: 'error',
        message: `Несоответствие имени процесса: ожидается ${config.name}, найдено ${state.workflowName}`,
        context: { sessionId, expected: config.name, actual: state.workflowName },
        recoverable: false,
        suggestions: [
          'Убедитесь, что используете правильную конфигурацию',
          'Проверьте ID сессии'
        ]
      });
    }

    if (state.workflowVersion !== config.version) {
      this.logger.warn(
        `Версия процесса отличается: сохранено ${state.workflowVersion}, текущая ${config.version}`
      );
    }

    // Валидация целостности артефактов
    const artifactValidation = await this.stateManager.validateArtifacts(state);
    if (!artifactValidation.valid) {
      throw new WorkflowErrorClass({
        code: 'ARTIFACTS_VALIDATION_FAILED',
        category: 'state',
        severity: 'error',
        message: 'Артефакты повреждены или отсутствуют',
        context: {
          sessionId,
          missingArtifacts: artifactValidation.missingArtifacts,
          corruptedArtifacts: artifactValidation.corruptedArtifacts
        },
        recoverable: true,
        suggestions: [
          'Восстановите отсутствующие артефакты',
          'Откатитесь к более раннему шагу',
          'Начните процесс заново'
        ]
      });
    }

    // Определение порядка выполнения
    const executionOrder = this.determineExecutionOrder(config.steps);

    // Определение оставшихся шагов
    const remainingSteps = executionOrder.filter(
      stepId => !state.completedSteps.includes(stepId)
    );

    if (remainingSteps.length === 0) {
      this.logger.info('Все шаги уже завершены');
      state.status = 'completed';
      state.completedAt = new Date().toISOString();
      await this.stateManager.saveState(state);
      return state;
    }

    this.logger.info(`Возобновление с шага ${remainingSteps[0]}, осталось ${remainingSteps.length} шагов`);

    // Продолжение выполнения
    return this.executeWorkflow(config, state, remainingSteps);
  }

  /**
   * Определение порядка выполнения шагов
   */
  determineExecutionOrder(steps: WorkflowStep[]): string[] {
    const graph = this.buildDependencyGraph(steps);
    return graph.executionOrder;
  }

  /**
   * Построение графа зависимостей
   */
  buildDependencyGraph(steps: WorkflowStep[]): DependencyGraph {
    return this.configParser.buildDependencyGraph(steps);
  }

  // ========== Приватные методы ==========

  /**
   * Выполнение рабочего процесса
   */
  private async executeWorkflow(
    config: WorkflowConfig,
    state: WorkflowState,
    executionOrder: string[]
  ): Promise<WorkflowState> {
    // Создание графа зависимостей для быстрого поиска шагов
    const graph = this.buildDependencyGraph(config.steps);

    // Выполнение шагов в порядке
    for (const stepId of executionOrder) {
      const step = graph.steps.get(stepId);
      if (!step) {
        throw new WorkflowErrorClass({
          code: 'STEP_NOT_FOUND',
          category: 'execution',
          severity: 'fatal',
          message: `Шаг не найден: ${stepId}`,
          context: { stepId, availableSteps: Array.from(graph.steps.keys()) },
          recoverable: false,
          suggestions: [
            'Проверьте правильность ID шага',
            'Убедитесь, что шаг определен в конфигурации'
          ]
        });
      }

      // Обновление текущего шага
      state.currentStep = stepId;
      await this.stateManager.saveState(state);

      // Создание контекста выполнения
      const context: ExecutionContext = {
        state,
        adapters: this.adapterRegistry,
        templateEngine: this.templateEngine,
        artifactManager: this.artifactManager,
        logger: this.logger
      };

      try {
        // Выполнение шага
        const result = await this.executeStepWithRetries(step, context, config);

        // Обновление состояния после успешного выполнения
        await this.updateStateAfterStep(state, step, result);

      } catch (error) {
        this.logger.error(`Ошибка выполнения шага ${stepId}:`, error);

        // Обновление состояния с ошибкой
        state.status = 'failed';
        state.errors.push({
          stepId,
          timestamp: new Date().toISOString(),
          error: (error as Error).message,
          stackTrace: (error as Error).stack,
          retryCount: 0
        });

        await this.stateManager.saveState(state);

        // Пробрасываем ошибку дальше
        throw error;
      }
    }

    // Все шаги завершены успешно
    state.status = 'completed';
    state.completedAt = new Date().toISOString();
    await this.stateManager.saveState(state);

    this.logger.info(`Процесс ${config.name} завершен успешно`);

    return state;
  }

  /**
   * Выполнение шага с повторами
   */
  private async executeStepWithRetries(
    step: WorkflowStep,
    context: ExecutionContext,
    config: WorkflowConfig
  ): Promise<StepResult> {
    const maxRetries = step.retries ?? config.settings.max_retries ?? 0;

    if (maxRetries > 0) {
      return this.stepExecutor.executeWithRetry(step, context, maxRetries);
    } else {
      return this.stepExecutor.executeStep(step, context);
    }
  }

  /**
   * Обновление состояния после выполнения шага
   */
  private async updateStateAfterStep(
    state: WorkflowState,
    step: WorkflowStep,
    result: StepResult
  ): Promise<void> {
    // Создание записи истории
    const history = {
      stepId: step.id,
      stepName: step.name,
      status: result.status,
      startedAt: new Date(Date.now() - result.executionTime).toISOString(),
      completedAt: new Date().toISOString(),
      executionTime: result.executionTime,
      artifacts: result.artifacts,
      error: result.error?.message
    };

    // Обновление состояния через менеджер
    await this.stateManager.updateStepCompletion(state, history);

    // Обновление контекста с выходами шага
    if (result.outputs) {
      Object.assign(state.context, result.outputs);
    }
  }
}

/**
 * Создание движка рабочих процессов
 */
export function createWorkflowEngine(config: WorkflowEngineConfig): WorkflowEngine {
  return new DefaultWorkflowEngine(config);
}
