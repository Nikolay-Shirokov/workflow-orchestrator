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
import { RoleManager } from './role-manager.js';
import { MCPManager, MCPContext } from './mcp-manager.js';

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
  
  /** Менеджер ролей (опционально) */
  roleManager?: RoleManager;
  
  /** Менеджер MCP-инструментов (опционально) */
  mcpManager?: MCPManager;
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
  private roleManager?: RoleManager;
  private mcpManager?: MCPManager;
  private mcpContext?: MCPContext;

  constructor(config: WorkflowEngineConfig) {
    this.configParser = config.configParser;
    this.stateManager = config.stateManager;
    this.stepExecutor = config.stepExecutor;
    this.adapterRegistry = config.adapterRegistry;
    this.templateEngine = config.templateEngine;
    this.artifactManager = config.artifactManager;
    this.logger = config.logger;
    this.roleManager = config.roleManager;
    this.mcpManager = config.mcpManager;
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

    // Регистрация адаптеров из конфигурации, если они определены
    if (config.adapters && config.adapters.length > 0) {
      this.logger.info('Регистрация адаптеров из конфигурации...');
      this.adapterRegistry.registerFromConfigs(config.adapters);
      this.logger.info(`Зарегистрировано адаптеров: ${config.adapters.length}`);
    }

    // Загрузка ролей, если они определены
    if (config.roles && this.roleManager) {
      this.logger.info('Загрузка определений ролей...');
      this.roleManager.loadRoles(config.roles);
      this.logger.info(`Загружено ролей: ${Object.keys(config.roles).length}`);
    }

    // Инициализация MCP-инструментов, если они определены
    if (config.settings.mcp_tools && this.mcpManager) {
      this.logger.info('Проверка доступности MCP-инструментов...');
      const toolsInfo = await this.mcpManager.checkMultipleTools(config.settings.mcp_tools);
      this.mcpContext = this.mcpManager.createMCPContext(toolsInfo);
      
      // Передаем MCP-контекст в StepExecutor, если он поддерживает это
      if (this.stepExecutor && 'setMCPContext' in this.stepExecutor) {
        (this.stepExecutor as any).setMCPContext(this.mcpContext);
      }
      
      // Логирование недоступных инструментов
      this.mcpManager.logUnavailableTools(toolsInfo);
      
      this.logger.info(
        `MCP-инструменты: ${this.mcpContext.available_tools.length} доступно, ` +
        `${this.mcpContext.unavailable_tools.length} недоступно`
      );
    }

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

    // Подстановка timestamp в artifacts_dir
    let artifactsDir = config.settings.artifacts_dir || 'artifacts';
    if (artifactsDir.includes('${timestamp}')) {
      // Извлекаем timestamp из sessionId (формат: session_20260110T1603_random)
      const timestampMatch = state.sessionId.match(/session_(.+?)_/);
      const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      artifactsDir = artifactsDir.replace('${timestamp}', timestamp);
    }
    if (artifactsDir.includes('${session_id}')) {
      artifactsDir = artifactsDir.replace('${session_id}', state.sessionId);
    }

    // Инициализация контекста
    state.context = {
      ...initialContext,
      default_adapter: config.settings.default_adapter,
      default_editor: config.settings.default_editor,
      artifacts_dir: artifactsDir,
      workflow_name: config.name,
      workflow_version: config.version,
      session_id: state.sessionId,
      timestamp: state.sessionId.match(/session_(.+?)_/)?.[1] || '',
      // Добавляем MCP-контекст, если доступен
      ...(this.mcpContext ? { mcp_tools: this.mcpContext.flags } : {})
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

    // Регистрация адаптеров из конфигурации, если они определены
    if (config.adapters && config.adapters.length > 0) {
      this.logger.info('Регистрация адаптеров из конфигурации...');
      this.adapterRegistry.registerFromConfigs(config.adapters);
      this.logger.info(`Зарегистрировано адаптеров: ${config.adapters.length}`);
    }

    // Загрузка ролей, если они определены
    if (config.roles && this.roleManager) {
      this.logger.info('Загрузка определений ролей...');
      this.roleManager.loadRoles(config.roles);
      this.logger.info(`Загружено ролей: ${Object.keys(config.roles).length}`);
    }

    // Инициализация MCP-инструментов, если они определены
    if (config.settings.mcp_tools && this.mcpManager) {
      this.logger.info('Проверка доступности MCP-инструментов...');
      const toolsInfo = await this.mcpManager.checkMultipleTools(config.settings.mcp_tools);
      this.mcpContext = this.mcpManager.createMCPContext(toolsInfo);
      
      // Передаем MCP-контекст в StepExecutor, если он поддерживает это
      if (this.stepExecutor && 'setMCPContext' in this.stepExecutor) {
        (this.stepExecutor as any).setMCPContext(this.mcpContext);
      }
      
      // Логирование недоступных инструментов
      this.mcpManager.logUnavailableTools(toolsInfo);
      
      this.logger.info(
        `MCP-инструменты: ${this.mcpContext.available_tools.length} доступно, ` +
        `${this.mcpContext.unavailable_tools.length} недоступно`
      );
    }

    // Загрузка состояния
    const state = await this.stateManager.loadState(sessionId);

    // Обновляем MCP-контекст в состоянии, если доступен
    if (this.mcpContext) {
      state.context.mcp_tools = this.mcpContext.flags;
    }

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

    // Определение оставшихся шагов для выполнения
    // При resume мы НЕ перестраиваем граф зависимостей для всех шагов,
    // а работаем только с теми шагами, которые еще не завершены
    const allStepIds = config.steps.map(step => step.id);
    const remainingStepIds = allStepIds.filter(
      stepId => !state.completedSteps.includes(stepId)
    );

    if (remainingStepIds.length === 0) {
      this.logger.info('Все шаги уже завершены');
      state.status = 'completed';
      state.completedAt = new Date().toISOString();
      await this.stateManager.saveState(state);
      return state;
    }

    // Фильтруем конфигурацию, оставляя только незавершенные шаги
    const remainingSteps = config.steps.filter(
      step => remainingStepIds.includes(step.id)
    );

    // ВАЖНО: Очищаем зависимости на уже выполненные шаги
    // Это предотвращает ошибки при построении графа зависимостей
    const cleanedSteps = remainingSteps.map(step => {
      if (!step.depends_on || step.depends_on.length === 0) {
        return step;
      }
      
      // Фильтруем зависимости, оставляя только те, которые еще не выполнены
      const validDependencies = step.depends_on.filter(
        depId => remainingStepIds.includes(depId)
      );
      
      // Если все зависимости уже выполнены, убираем depends_on
      if (validDependencies.length === 0) {
        const { depends_on, ...stepWithoutDeps } = step;
        return stepWithoutDeps as WorkflowStep;
      }
      
      // Иначе обновляем список зависимостей
      return {
        ...step,
        depends_on: validDependencies
      };
    });

    // Определяем порядок выполнения только для оставшихся шагов
    let executionOrder: string[];
    try {
      executionOrder = this.determineExecutionOrder(cleanedSteps);
    } catch (error) {
      // Если не удается построить граф зависимостей (например, из-за циклических зависимостей),
      // используем простой порядок - ID шагов в том порядке, в котором они определены
      this.logger.warn(
        `Не удалось построить граф зависимостей для оставшихся шагов: ${(error as Error).message}. ` +
        `Используется порядок определения шагов.`
      );
      executionOrder = remainingStepIds;
    }

    this.logger.info(`Возобновление с шага ${executionOrder[0]}, осталось ${executionOrder.length} шагов`);

    // Продолжение выполнения
    return this.executeWorkflow(config, state, executionOrder);
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
   * Проверка условия выполнения шага
   */
  private shouldExecuteStep(step: WorkflowStep, state: WorkflowState): boolean {
    // Если условие не указано, выполняем шаг
    if (!step.condition) {
      return true;
    }

    // Проверяем MCP-условия, если доступен MCPManager
    if (this.mcpManager && this.mcpContext) {
      const mcpResult = this.mcpManager.evaluateCondition(step.condition, this.mcpContext);
      
      // Если это MCP-условие и оно не выполнено, пропускаем шаг
      if (!mcpResult && step.condition in this.mcpContext.flags) {
        this.logger.info(
          `Шаг ${step.id} пропущен: MCP-условие "${step.condition}" не выполнено`
        );
        return false;
      }
    }

    // Проверяем другие условия из контекста
    try {
      // Простая оценка условия из контекста
      const conditionValue = this.evaluateConditionExpression(step.condition, state.context);
      
      if (!conditionValue) {
        this.logger.info(
          `Шаг ${step.id} пропущен: условие "${step.condition}" не выполнено`
        );
        return false;
      }
      
      return true;
    } catch (error) {
      this.logger.warn(
        `Не удалось оценить условие "${step.condition}" для шага ${step.id}: ${(error as Error).message}`
      );
      // В случае ошибки оценки, выполняем шаг
      return true;
    }
  }

  /**
   * Оценка выражения условия
   */
  private evaluateConditionExpression(condition: string, context: Record<string, unknown>): boolean {
    // Простая оценка: проверяем наличие переменной в контексте
    // Поддерживаем точечную нотацию (например, "mcp_tools.web_search_available")
    const parts = condition.split('.');
    let value: unknown = context;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return false;
      }
    }
    
    // Преобразуем в boolean
    return Boolean(value);
  }

  /**
   * Выполнение рабочего процесса
   */
  private async executeWorkflow(
    config: WorkflowConfig,
    state: WorkflowState,
    executionOrder: string[]
  ): Promise<WorkflowState> {
    // Создаем Map шагов для быстрого поиска
    // Используем только те шаги, которые есть в executionOrder
    const stepsMap = new Map<string, WorkflowStep>();
    for (const step of config.steps) {
      if (executionOrder.includes(step.id)) {
        stepsMap.set(step.id, step);
      }
    }

    // Выполнение шагов в порядке
    for (const stepId of executionOrder) {
      const step = stepsMap.get(stepId);
      if (!step) {
        throw new WorkflowErrorClass({
          code: 'STEP_NOT_FOUND',
          category: 'execution',
          severity: 'fatal',
          message: `Шаг не найден: ${stepId}`,
          context: { stepId, availableSteps: Array.from(stepsMap.keys()) },
          recoverable: false,
          suggestions: [
            'Проверьте правильность ID шага',
            'Убедитесь, что шаг определен в конфигурации'
          ]
        });
      }

      // Проверка условия выполнения шага
      if (!this.shouldExecuteStep(step, state)) {
        // Пропускаем шаг, добавляем его в историю как пропущенный
        // НО НЕ добавляем в completedSteps, так как шаг не был выполнен
        const skippedHistory = {
          stepId: step.id,
          stepName: step.name,
          status: 'skipped' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          executionTime: 0,
          artifacts: [],
          error: `Условие не выполнено: ${step.condition}`
        };
        
        state.history.push(skippedHistory);
        // НЕ добавляем в completedSteps - пропущенные шаги не считаются завершенными
        await this.stateManager.saveState(state);
        
        continue;
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

        // КРИТИЧЕСКАЯ ПРОВЕРКА: если процесс приостановлен после выполнения шага,
        // прерываем выполнение ДО обновления состояния
        // Это важно для шагов user_input, которые устанавливают статус 'paused'
        const wasPausedByStep = state.status === 'paused';

        // Обновление состояния после успешного выполнения
        await this.updateStateAfterStep(state, step, result);

        // Если шаг приостановил процесс, выходим из цикла
        if (wasPausedByStep) {
          this.logger.info(`Процесс приостановлен на шаге ${stepId}. Выход из цикла выполнения.`);
          await this.stateManager.saveState(state);
          return state;
        }

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
