/**
 * Оркестратор рабочих процессов
 * 
 * Координирует все компоненты системы для выполнения рабочих процессов
 */

import { WorkflowConfig, WorkflowState, CLIAdapter } from '../core/types.js';
import { Logger } from '../core/logger.js';
import { createWorkflowEngine, WorkflowEngine } from '../core/workflow-engine.js';
import { createStateManager, StateManager } from '../core/state-manager.js';
import { createStepExecutor } from '../core/step-executor.js';
import { AdapterRegistry } from '../adapters/adapter-registry.js';
import { DefaultTemplateEngine } from '../core/template-engine.js';
import { createArtifactManager } from '../core/artifact-manager.js';
import { WorkflowConfigParser } from '../core/workflow-config-parser.js';
import { MCPManager } from '../core/mcp-manager.js';
import { RoleManager } from '../core/role-manager.js';
import { CLIWorkflowStatus, DryRunResult } from './index.js';
import { ProgressDisplay } from './progress-display.js';

/**
 * Конфигурация оркестратора
 */
export interface OrchestratorConfig {
  /** Директория для файлов состояния */
  stateDir?: string;
  
  /** Директория для артефактов */
  artifactsDir?: string;
  
  /** Логгер */
  logger: Logger;
}

/**
 * Опции для возобновления
 */
export interface ResumeOptions {
  /** Пропустить валидацию артефактов */
  skipValidation?: boolean;
}

/**
 * Опции для dry-run
 */
export interface DryRunOptions {
  /** Начальный контекст */
  context?: Record<string, unknown>;
  
  /** Отобразить шаги с подставленными параметрами */
  showSteps?: boolean;
  
  /** Проверить доступность ресурсов */
  checkResources?: boolean;
}

/**
 * Класс оркестратора рабочих процессов
 */
export class WorkflowOrchestrator {
  private stateDir: string;
  private artifactsDir: string;
  private logger: Logger;
  private stateManager: StateManager;
  private workflowEngine: WorkflowEngine;
  private adapterRegistry: AdapterRegistry;

  constructor(config: OrchestratorConfig) {
    this.stateDir = config.stateDir || './state';
    this.artifactsDir = config.artifactsDir || './artifacts';
    this.logger = config.logger;

    // Инициализация компонентов
    this.stateManager = createStateManager({
      stateDir: this.stateDir,
      logger: this.logger
    });

    const configParser = new WorkflowConfigParser();
    this.adapterRegistry = new AdapterRegistry();
    const templateEngine = new DefaultTemplateEngine();
    const artifactManager = createArtifactManager({
      baseDir: this.artifactsDir,
      sessionDirTemplate: '',  // Не добавляем поддиректорию, используем baseDir напрямую
      logger: this.logger
    });
    
    // Инициализация менеджеров
    const roleManager = new RoleManager();
    const mcpManager = new MCPManager(this.logger);
    
    const stepExecutor = createStepExecutor({
      roleManager,
      mcpManager
    });

    this.workflowEngine = createWorkflowEngine({
      configParser,
      stateManager: this.stateManager,
      stepExecutor,
      adapterRegistry: this.adapterRegistry,
      templateEngine,
      artifactManager,
      logger: this.logger,
      roleManager,
      mcpManager
    });
  }

  /**
   * Регистрация адаптера
   * @param adapter - Адаптер для регистрации
   */
  registerAdapter(adapter: CLIAdapter): void {
    this.adapterRegistry.register(adapter);
  }

  /**
   * Получение списка зарегистрированных адаптеров
   * @returns Массив имен адаптеров
   */
  getRegisteredAdapters(): string[] {
    return this.adapterRegistry.getAll().map(a => a.name);
  }

  /**
   * Запуск нового рабочего процесса
   */
  async run(
    configPath: string,
    initialContext: Record<string, unknown> = {},
    progress?: ProgressDisplay
  ): Promise<WorkflowState> {
    this.logger.info(`Запуск процесса из ${configPath}`);

    // Загрузка конфигурации
    const config = await this.workflowEngine.loadConfig(configPath);

    // Отображение информации о процессе
    if (progress) {
      progress.onWorkflowStart(config);
    }

    // Выполнение процесса
    const state = await this.workflowEngine.execute(config, initialContext);

    // Отображение завершения
    if (progress) {
      progress.onWorkflowComplete(state);
    }

    return state;
  }

  /**
   * Возобновление процесса с сохраненного состояния
   */
  async resume(
    sessionId: string,
    configPath: string,
    progress?: ProgressDisplay,
    _options: ResumeOptions = {}
  ): Promise<WorkflowState> {
    this.logger.info(`Возобновление процесса ${sessionId}`);

    // Загрузка конфигурации
    const config = await this.workflowEngine.loadConfig(configPath);

    // Отображение информации о процессе
    if (progress) {
      progress.onWorkflowStart(config);
    }

    // Возобновление выполнения
    const state = await this.workflowEngine.resume(sessionId, config);

    // Отображение завершения
    if (progress) {
      progress.onWorkflowComplete(state);
    }

    return state;
  }

  /**
   * Получение статуса процесса
   */
  async getStatus(sessionId: string): Promise<CLIWorkflowStatus> {
    this.logger.debug(`Получение статуса для сессии ${sessionId}`);

    // Загрузка состояния
    const state = await this.stateManager.loadState(sessionId);

    // Подсчет общего количества шагов (из истории)
    const totalSteps = state.completedSteps.length + 
      (state.status === 'completed' ? 0 : 1);

    return {
      sessionId: state.sessionId,
      workflowName: state.workflowName,
      workflowVersion: state.workflowVersion,
      status: state.status,
      currentStep: state.currentStep,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      completedAt: state.completedAt,
      completedSteps: state.completedSteps,
      totalSteps,
      artifacts: state.artifacts,
      history: state.history,
      errors: state.errors
    };
  }

  /**
   * Валидация конфигурации без выполнения (dry-run)
   */
  async dryRun(
    configPath: string,
    options: DryRunOptions = {}
  ): Promise<DryRunResult> {
    this.logger.info(`Валидация конфигурации ${configPath}`);

    const errors: Array<{ message: string; location?: string; suggestions?: string[] }> = [];
    const warnings: Array<{ message: string; location?: string }> = [];

    try {
      // Загрузка и валидация конфигурации
      const config = await this.workflowEngine.loadConfig(configPath);

      // Определение порядка выполнения
      const executionOrder = this.workflowEngine.determineExecutionOrder(config.steps);

      // Подготовка результата
      const result: DryRunResult = {
        valid: true,
        workflowName: config.name,
        workflowVersion: config.version,
        totalSteps: executionOrder.length,
        errors,
        warnings
      };

      // Отображение шагов с подставленными параметрами
      if (options.showSteps) {
        result.steps = await this.resolveSteps(config, options.context || {});
      }

      // Проверка доступности ресурсов
      if (options.checkResources) {
        result.resourceCheck = await this.checkResources(config, options.context || {});
        
        // Добавление ошибок из проверки ресурсов
        if (result.resourceCheck.missingFiles.length > 0) {
          errors.push({
            message: `Отсутствуют файлы: ${result.resourceCheck.missingFiles.join(', ')}`,
            suggestions: ['Создайте отсутствующие файлы', 'Проверьте пути к файлам']
          });
        }

        if (result.resourceCheck.missingVariables.length > 0) {
          errors.push({
            message: `Неопределенные переменные: ${result.resourceCheck.missingVariables.join(', ')}`,
            suggestions: ['Определите переменные в контексте', 'Проверьте имена переменных']
          });
        }

        if (result.resourceCheck.unavailableAdapters.length > 0) {
          errors.push({
            message: `Недоступные адаптеры: ${result.resourceCheck.unavailableAdapters.join(', ')}`,
            suggestions: ['Установите необходимые CLI-утилиты', 'Проверьте конфигурацию адаптеров']
          });
        }
      }

      // Обновление статуса валидности
      result.valid = errors.length === 0;

      if (result.valid) {
        this.logger.info(`✓ Конфигурация валидна, процесс готов к выполнению`);
      } else {
        this.logger.error(`✗ Конфигурация содержит ${errors.length} ошибок`);
      }

      return result;

    } catch (error) {
      // Обработка ошибок загрузки/валидации
      const errorMessage = (error as Error).message;
      errors.push({
        message: errorMessage,
        suggestions: ['Проверьте синтаксис конфигурации', 'Убедитесь, что файл существует']
      });

      // Попытка извлечь имя и версию из файла, если возможно
      let workflowName = 'unknown';
      let workflowVersion = 'unknown';
      
      try {
        const fs = await import('fs/promises');
        const content = await fs.readFile(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.name) workflowName = parsed.name;
        if (parsed.version) workflowVersion = parsed.version;
      } catch {
        // Игнорируем ошибки парсинга
      }

      return {
        valid: false,
        workflowName,
        workflowVersion,
        totalSteps: 0,
        errors,
        warnings
      };
    }
  }

  // ========== Приватные методы ==========

  /**
   * Разрешение шагов с подстановкой параметров
   */
  private async resolveSteps(
    config: WorkflowConfig,
    _context: Record<string, unknown>
  ): Promise<Array<{
    id: string;
    name: string;
    type: string;
    dependsOn?: string[];
    condition?: string;
    resolvedPrompt?: string;
  }>> {
    const steps = [];

    for (const step of config.steps) {
      const resolvedStep: {
        id: string;
        name: string;
        type: string;
        dependsOn?: string[];
        condition?: string;
        resolvedPrompt?: string;
      } = {
        id: step.id,
        name: step.name,
        type: step.type,
        dependsOn: step.depends_on,
        condition: step.condition
      };

      // Попытка разрешить промпт (если есть)
      if (step.prompt_template && step.type === 'model') {
        try {
          // Здесь можно добавить логику разрешения шаблона
          // Пока просто сохраняем шаблон как есть
          resolvedStep.resolvedPrompt = step.prompt_template;
        } catch (error) {
          this.logger.warn(`Не удалось разрешить промпт для шага ${step.id}: ${(error as Error).message}`);
        }
      }

      steps.push(resolvedStep);
    }

    return steps;
  }

  /**
   * Проверка доступности ресурсов
   */
  private async checkResources(
    config: WorkflowConfig,
    _context: Record<string, unknown>
  ): Promise<{
    missingFiles: string[];
    missingVariables: string[];
    unavailableAdapters: string[];
  }> {
    const missingFiles: string[] = [];
    const missingVariables: string[] = [];
    const unavailableAdapters: string[] = [];

    // Проверка файлов шаблонов
    for (const step of config.steps) {
      if (step.prompt_template && step.prompt_template.endsWith('.txt')) {
        // Проверка существования файла шаблона
        try {
          const fs = await import('fs/promises');
          await fs.access(step.prompt_template);
        } catch (error) {
          missingFiles.push(step.prompt_template);
        }
      }
    }

    // Проверка адаптеров
    // TODO: Реализовать проверку доступности адаптеров

    return {
      missingFiles,
      missingVariables,
      unavailableAdapters
    };
  }
}
