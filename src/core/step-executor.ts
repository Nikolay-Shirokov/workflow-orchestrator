/**
 * Исполнитель шагов рабочего процесса
 * 
 * Отвечает за:
 * - Выполнение отдельных шагов процесса
 * - Выполнение шагов типа 'model' с вызовом адаптеров
 * - Выполнение шагов типа 'script'
 * - Выполнение условных шагов
 * - Логику повторов при ошибках
 * - Обработку таймаутов
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import {
  StepExecutor,
  WorkflowStep,
  ExecutionContext,
  StepResult,
  RetryConfig,
  WorkflowErrorClass,
  AdapterRequest
} from './types.js';
import { RoleManager } from './role-manager.js';
import { MCPManager, MCPContext } from './mcp-manager.js';

/**
 * Конфигурация исполнителя шагов
 */
export interface StepExecutorConfig {
  /** Конфигурация повторов по умолчанию */
  defaultRetryConfig?: RetryConfig;
  
  /** Таймаут по умолчанию в миллисекундах */
  defaultTimeout?: number;
  
  /** Shell для выполнения скриптов */
  defaultShell?: string;
  
  /** Менеджер ролей */
  roleManager?: RoleManager;
  
  /** Менеджер MCP-инструментов */
  mcpManager?: MCPManager;
  
  /** Контекст MCP */
  mcpContext?: MCPContext;
}

/**
 * Реализация исполнителя шагов по умолчанию
 */
export class DefaultStepExecutor implements StepExecutor {
  private config: Required<Omit<StepExecutorConfig, 'roleManager' | 'mcpManager' | 'mcpContext'>>;
  private roleManager?: RoleManager;
  private mcpManager?: MCPManager;
  private mcpContext?: MCPContext;

  constructor(config: StepExecutorConfig = {}) {
    this.roleManager = config.roleManager;
    this.mcpManager = config.mcpManager;
    this.mcpContext = config.mcpContext;
    this.config = {
      defaultRetryConfig: config.defaultRetryConfig || {
        maxRetries: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 30000,
        retryableErrors: [
          'ADAPTER_TIMEOUT',
          'ADAPTER_NETWORK_ERROR',
          'ADAPTER_TEMPORARY_ERROR'
        ]
      },
      defaultTimeout: config.defaultTimeout || 300000, // 5 минут
      defaultShell: config.defaultShell || (process.platform === 'win32' ? 'cmd' : 'bash')
    };
  }
  
  /**
   * Установка MCP-контекста (для обновления после инициализации)
   */
  setMCPContext(mcpContext: MCPContext): void {
    this.mcpContext = mcpContext;
  }

  /**
   * Выполнение одного шага
   */
  async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    const startTime = Date.now();
    
    context.logger.info(`Начало выполнения шага: ${step.id} (${step.name})`);
    
    try {
      // Проверка условия выполнения
      if (step.condition && !this.evaluateCondition(step.condition, context)) {
        context.logger.info(`Шаг ${step.id} пропущен (условие не выполнено)`);
        return {
          stepId: step.id,
          status: 'skipped',
          outputs: {},
          artifacts: [],
          executionTime: Date.now() - startTime
        };
      }

      // Выполнение в зависимости от типа шага
      let result: StepResult;
      
      switch (step.type) {
        case 'model':
          result = await this.executeModelStep(step, context);
          break;
          
        case 'script':
          result = await this.executeScriptStep(step, context);
          break;
          
        case 'conditional':
          result = await this.executeConditionalStep(step, context);
          break;
          
        case 'parallel':
          result = await this.executeParallelSteps(step, context);
          break;
          
        case 'loop':
          result = await this.executeLoopStep(step, context);
          break;
          
        case 'user_input':
          result = await this.executeUserInputStep(step, context);
          break;
          
        default:
          throw new WorkflowErrorClass({
            code: 'UNKNOWN_STEP_TYPE',
            category: 'execution',
            severity: 'error',
            message: `Неизвестный тип шага: ${step.type}`,
            context: { stepId: step.id, stepType: step.type },
            recoverable: false,
            suggestions: [
              'Проверьте правильность типа шага в конфигурации',
              'Поддерживаемые типы: model, script, conditional, parallel, loop, user_input'
            ]
          });
      }

      result.executionTime = Date.now() - startTime;
      
      context.logger.info(
        `Шаг ${step.id} завершен успешно за ${result.executionTime}мс`
      );
      
      return result;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      context.logger.error(`Ошибка выполнения шага ${step.id}:`, error);
      
      // Если continue_on_error установлен, возвращаем результат с ошибкой
      if (step.continue_on_error) {
        return {
          stepId: step.id,
          status: 'failed',
          outputs: {},
          artifacts: [],
          executionTime,
          error: error as Error
        };
      }
      
      throw error;
    }
  }

  /**
   * Параллельное выполнение шагов с оптимизацией
   */
  async executeParallel(
    steps: WorkflowStep[],
    context: ExecutionContext
  ): Promise<StepResult[]> {
    context.logger.info(`Параллельное выполнение ${steps.length} шагов`);
    
    // Оптимизация: группируем шаги по приоритету и зависимостям
    const groupedSteps = this.groupStepsByPriority(steps);
    
    // Запускаем все шаги параллельно с ограничением конкурентности
    const maxConcurrency = this.getMaxConcurrency();
    const results: StepResult[] = [];
    
    // Выполняем группы последовательно, но внутри группы - параллельно
    for (const group of groupedSteps) {
      const groupResults = await this.executeStepsWithConcurrencyLimit(
        group,
        context,
        maxConcurrency
      );
      results.push(...groupResults);
    }
    
    // Проверяем наличие ошибок
    const failedSteps = results.filter(r => r.status === 'failed');
    if (failedSteps.length > 0) {
      const errorMessages = failedSteps
        .map(r => `${r.stepId}: ${r.error?.message}`)
        .join('; ');
      
      context.logger.error(
        `${failedSteps.length} из ${steps.length} параллельных шагов завершились с ошибкой`
      );
      
      throw new WorkflowErrorClass({
        code: 'PARALLEL_EXECUTION_FAILED',
        category: 'execution',
        severity: 'error',
        message: `Ошибки в параллельных шагах: ${errorMessages}`,
        context: {
          failedSteps: failedSteps.map(r => r.stepId),
          errors: errorMessages
        },
        recoverable: false,
        suggestions: [
          'Проверьте логи для деталей каждой ошибки',
          'Исправьте ошибки и повторите выполнение'
        ]
      });
    }
    
    context.logger.info(`Все ${steps.length} параллельных шагов завершены успешно`);
    
    return results;
  }
  
  /**
   * Группировка шагов по приоритету для оптимального выполнения
   */
  private groupStepsByPriority(steps: WorkflowStep[]): WorkflowStep[][] {
    // Простая реализация: все шаги в одной группе
    // В будущем можно добавить анализ зависимостей и приоритетов
    return [steps];
  }
  
  /**
   * Получение максимального уровня конкурентности
   */
  private getMaxConcurrency(): number {
    // Используем количество CPU ядер, но не более 10
    const cpuCount = require('os').cpus().length;
    return Math.min(cpuCount, 10);
  }
  
  /**
   * Выполнение шагов с ограничением конкурентности
   */
  private async executeStepsWithConcurrencyLimit(
    steps: WorkflowStep[],
    context: ExecutionContext,
    maxConcurrency: number
  ): Promise<StepResult[]> {
    const results: StepResult[] = [];
    const executing: Promise<StepResult>[] = [];
    
    for (const step of steps) {
      // Создаем промис для выполнения шага
      const promise = this.executeStep(step, context).catch(error => ({
        stepId: step.id,
        status: 'failed' as const,
        outputs: {},
        artifacts: [],
        executionTime: 0,
        error: error as Error
      }));
      
      executing.push(promise);
      
      // Если достигли лимита конкурентности, ждем завершения хотя бы одного
      if (executing.length >= maxConcurrency) {
        const result = await Promise.race(executing);
        results.push(result);
        
        // Удаляем завершенный промис из списка выполняющихся
        const index = executing.findIndex(p => p === promise);
        if (index !== -1) {
          executing.splice(index, 1);
        }
      }
    }
    
    // Ждем завершения оставшихся шагов
    const remainingResults = await Promise.all(executing);
    results.push(...remainingResults);
    
    return results;
  }

  /**
   * Выполнение с повторами
   */
  async executeWithRetry(
    step: WorkflowStep,
    context: ExecutionContext,
    maxRetries: number
  ): Promise<StepResult> {
    const retryConfig: RetryConfig = {
      ...this.config.defaultRetryConfig,
      maxRetries
    };
    
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeStep(step, context);
      } catch (error) {
        lastError = error as Error;
        
        // Проверяем, можно ли повторить
        if (!this.isRetryableError(error as Error, retryConfig)) {
          throw error;
        }
        
        // Последняя попытка
        if (attempt === maxRetries) {
          break;
        }
        
        // Вычисляем задержку
        const delay = this.calculateDelay(attempt, retryConfig);
        
        context.logger.warn(
          `Попытка ${attempt + 1}/${maxRetries} не удалась для шага ${step.id}. ` +
          `Повтор через ${delay}мс...`
        );
        
        await this.sleep(delay);
      }
    }
    
    throw new WorkflowErrorClass({
      code: 'MAX_RETRIES_EXCEEDED',
      category: 'execution',
      severity: 'error',
      message: `Превышено максимальное количество повторов (${maxRetries}) для шага ${step.id}`,
      context: {
        stepId: step.id,
        maxRetries,
        lastError: lastError?.message
      },
      recoverable: false,
      suggestions: [
        'Проверьте причину ошибки',
        'Увеличьте количество повторов',
        'Исправьте проблему и повторите выполнение'
      ]
    });
  }

  // ========== Выполнение различных типов шагов ==========

  /**
   * Выполнение шага типа 'model'
   */
  private async executeModelStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    // Определяем адаптер для использования
    let adapterName: string;
    
    // Если указана роль, получаем адаптер из роли
    if (step.role && this.roleManager) {
      adapterName = this.roleManager.getAdapterForRole(step.role);
    } else {
      // Иначе используем адаптер из шага или по умолчанию
      adapterName = step.adapter || context.state.context.default_adapter as string;
    }
    
    if (!adapterName) {
      throw new WorkflowErrorClass({
        code: 'NO_ADAPTER_SPECIFIED',
        category: 'execution',
        severity: 'error',
        message: `Не указан адаптер для шага ${step.id}`,
        context: { stepId: step.id },
        recoverable: false,
        suggestions: [
          'Укажите адаптер в конфигурации шага',
          'Укажите роль с определенным адаптером',
          'Установите default_adapter в настройках рабочего процесса'
        ]
      });
    }
    
    const adapter = context.adapters.get(adapterName);
    
    if (!adapter) {
      throw new WorkflowErrorClass({
        code: 'ADAPTER_NOT_FOUND',
        category: 'execution',
        severity: 'error',
        message: `Адаптер не найден: ${adapterName}`,
        context: { stepId: step.id, adapterName },
        recoverable: false,
        suggestions: [
          'Проверьте правильность имени адаптера',
          'Убедитесь, что адаптер зарегистрирован',
          `Доступные адаптеры: ${context.adapters.getAll().map(a => a.name).join(', ')}`
        ]
      });
    }
    
    // Подготовка промпта
    const prompt = await this.preparePrompt(step, context);
    
    // Определяем модель
    let model = step.model;
    if (step.role && this.roleManager) {
      model = this.roleManager.getModelForRole(step.role) || model;
    }
    
    // Подготовка базового запроса
    let request: AdapterRequest = {
      prompt,
      model,
      systemPrompt: step.system_prompt,
      timeout: step.timeout || this.config.defaultTimeout
    };
    
    // Если указана роль, обогащаем запрос инструкциями роли
    if (step.role && this.roleManager) {
      request = this.roleManager.enrichRequestWithRole(step.role, request);
      
      // Проверяем разрешения роли
      this.checkRolePermissions(step.role, step, context);
    }
    
    // Выполнение запроса к модели
    const response = await adapter.execute(request);
    
    // Сохранение артефактов
    const artifacts: string[] = [];
    
    if (step.outputs) {
      for (const [outputName, outputPath] of Object.entries(step.outputs)) {
        // Рендеринг пути с подстановкой переменных
        const renderedPath = context.templateEngine.render(
          outputPath,
          this.createTemplateContext(context)
        );
        
        // Сохранение артефакта
        const artifactPath = await context.artifactManager.save(
          step.id,
          renderedPath,
          response.content
        );
        
        artifacts.push(artifactPath);
        
        // Обновление контекста
        context.state.context[outputName] = response.content;
        context.state.artifacts[outputName] = artifactPath;
      }
    }
    
    return {
      stepId: step.id,
      status: 'success',
      outputs: { content: response.content },
      artifacts,
      executionTime: response.executionTime
    };
  }
  
  /**
   * Проверка разрешений роли для выполнения шага
   */
  private checkRolePermissions(
    roleName: string,
    step: WorkflowStep,
    context: ExecutionContext
  ): void {
    if (!this.roleManager) {
      return;
    }
    
    // Проверяем разрешения на редактирование файлов
    if (step.outputs) {
      for (const outputPath of Object.values(step.outputs)) {
        // Рендерим путь для проверки
        const renderedPath = context.templateEngine.render(
          outputPath,
          this.createTemplateContext(context)
        );
        
        if (!this.roleManager.canEditFile(roleName, renderedPath)) {
          throw new WorkflowErrorClass({
            code: 'ROLE_PERMISSION_DENIED',
            category: 'execution',
            severity: 'error',
            message: `Роль "${roleName}" не имеет разрешения на редактирование файла: ${renderedPath}`,
            context: {
              roleName,
              filePath: renderedPath,
              stepId: step.id
            },
            recoverable: false,
            suggestions: [
              'Добавьте разрешение "edit" или "edit:regex" в конфигурацию роли',
              'Используйте другую роль с необходимыми разрешениями',
              'Измените путь к выходному файлу'
            ]
          });
        }
      }
    }
  }

  /**
   * Выполнение шага типа 'script'
   */
  private async executeScriptStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    if (!step.script) {
      throw new WorkflowErrorClass({
        code: 'NO_SCRIPT_SPECIFIED',
        category: 'execution',
        severity: 'error',
        message: `Не указан скрипт для шага ${step.id}`,
        context: { stepId: step.id },
        recoverable: false,
        suggestions: [
          'Укажите скрипт в конфигурации шага'
        ]
      });
    }
    
    // Рендеринг скрипта с подстановкой переменных
    const script = context.templateEngine.render(
      step.script,
      this.createTemplateContext(context)
    );
    
    // Определяем shell
    const shell = step.shell || this.config.defaultShell;
    
    // Выполнение скрипта
    const result = await this.executeScript(
      script,
      shell,
      step.timeout || this.config.defaultTimeout
    );
    
    // Сохранение артефактов (если есть выходы)
    const artifacts: string[] = [];
    
    if (step.outputs) {
      for (const [outputName, outputPath] of Object.entries(step.outputs)) {
        const renderedPath = context.templateEngine.render(
          outputPath,
          this.createTemplateContext(context)
        );
        
        // Для скриптов, выход - это stdout
        const artifactPath = await context.artifactManager.save(
          step.id,
          renderedPath,
          result.stdout
        );
        
        artifacts.push(artifactPath);
        
        // Обновление контекста
        context.state.context[outputName] = result.stdout;
        context.state.artifacts[outputName] = artifactPath;
      }
    }
    
    return {
      stepId: step.id,
      status: 'success',
      outputs: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      },
      artifacts,
      executionTime: result.executionTime
    };
  }

  /**
   * Выполнение условного шага
   */
  private async executeConditionalStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    if (!step.condition) {
      throw new WorkflowErrorClass({
        code: 'NO_CONDITION_SPECIFIED',
        category: 'execution',
        severity: 'error',
        message: `Не указано условие для условного шага ${step.id}`,
        context: { stepId: step.id },
        recoverable: false,
        suggestions: [
          'Укажите условие в конфигурации шага'
        ]
      });
    }
    
    // Вычисляем условие
    const conditionResult = this.evaluateCondition(step.condition, context);
    
    // Выполняем соответствующий шаг
    const nextStep = conditionResult ? step.thenStep : step.elseStep;
    
    if (!nextStep) {
      // Если нет шага для выполнения, пропускаем
      return {
        stepId: step.id,
        status: 'skipped',
        outputs: { conditionResult },
        artifacts: [],
        executionTime: 0
      };
    }
    
    // Выполняем выбранный шаг
    return this.executeStep(nextStep, context);
  }

  /**
   * Выполнение параллельных шагов (для типа 'parallel')
   */
  private async executeParallelSteps(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    if (!step.steps || step.steps.length === 0) {
      throw new WorkflowErrorClass({
        code: 'NO_PARALLEL_STEPS',
        category: 'execution',
        severity: 'error',
        message: `Не указаны шаги для параллельного выполнения в шаге ${step.id}`,
        context: { stepId: step.id },
        recoverable: false,
        suggestions: [
          'Укажите массив шагов в поле steps'
        ]
      });
    }
    
    // Выполняем шаги параллельно
    const results = await this.executeParallel(step.steps, context);
    
    // Собираем все артефакты
    const allArtifacts = results.flatMap(r => r.artifacts);
    
    // Собираем все выходы
    const allOutputs = results.reduce((acc, r) => ({
      ...acc,
      [r.stepId]: r.outputs
    }), {});
    
    return {
      stepId: step.id,
      status: 'success',
      outputs: allOutputs,
      artifacts: allArtifacts,
      executionTime: Math.max(...results.map(r => r.executionTime))
    };
  }

  /**
   * Выполнение шага цикла (для типа 'loop')
   */
  private async executeLoopStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    // Проверка наличия тела цикла
    if (!step.loop_body) {
      throw new WorkflowErrorClass({
        code: 'NO_LOOP_BODY',
        category: 'execution',
        severity: 'error',
        message: `Не указано тело цикла для шага ${step.id}`,
        context: { stepId: step.id },
        recoverable: false,
        suggestions: [
          'Укажите loop_body в конфигурации шага'
        ]
      });
    }

    let iterations: number;
    let items: unknown[] | undefined;

    // Определяем количество итераций
    if (step.loop_iterations !== undefined) {
      // Цикл с фиксированным количеством итераций
      iterations = step.loop_iterations;
      if (iterations < 0) {
        throw new WorkflowErrorClass({
          code: 'INVALID_LOOP_ITERATIONS',
          category: 'execution',
          severity: 'error',
          message: `Количество итераций цикла должно быть неотрицательным: ${iterations}`,
          context: { stepId: step.id, iterations },
          recoverable: false,
          suggestions: [
            'Укажите неотрицательное значение для loop_iterations'
          ]
        });
      }
    } else if (step.loop_items !== undefined) {
      // Цикл по элементам массива
      items = step.loop_items;
      if (!Array.isArray(items)) {
        throw new WorkflowErrorClass({
          code: 'INVALID_LOOP_ITEMS',
          category: 'execution',
          severity: 'error',
          message: `loop_items должен быть массивом`,
          context: { stepId: step.id, loopItems: items },
          recoverable: false,
          suggestions: [
            'Укажите массив для loop_items'
          ]
        });
      }
      iterations = items.length;
    } else {
      throw new WorkflowErrorClass({
        code: 'NO_LOOP_CONFIGURATION',
        category: 'execution',
        severity: 'error',
        message: `Не указано ни loop_iterations, ни loop_items для шага ${step.id}`,
        context: { stepId: step.id },
        recoverable: false,
        suggestions: [
          'Укажите loop_iterations для фиксированного количества итераций',
          'Укажите loop_items для цикла по элементам массива'
        ]
      });
    }

    context.logger.info(`Начало выполнения цикла ${step.id}: ${iterations} итераций`);

    // Массив для сбора результатов всех итераций
    const allResults: StepResult[] = [];
    const allArtifacts: string[] = [];
    const allOutputs: Record<string, unknown>[] = [];

    // Выполнение итераций
    for (let i = 0; i < iterations; i++) {
      context.logger.debug(`Итерация ${i + 1}/${iterations} цикла ${step.id}`);

      // Обновление контекста для текущей итерации
      const iterationContext = { ...context };
      
      // Добавляем переменную итерации в контекст
      if (step.loop_variable) {
        if (items !== undefined) {
          // Для цикла по элементам - текущий элемент
          iterationContext.state.context[step.loop_variable] = items[i];
        } else {
          // Для фиксированного цикла - индекс итерации
          iterationContext.state.context[step.loop_variable] = i;
        }
      }

      // Добавляем индекс итерации
      iterationContext.state.context['loop_index'] = i;
      iterationContext.state.context['loop_iteration'] = i + 1;

      // Выполнение тела цикла
      const result = await this.executeStep(step.loop_body, iterationContext);

      // Сбор результатов
      allResults.push(result);
      allArtifacts.push(...result.artifacts);
      allOutputs.push(result.outputs);
    }

    context.logger.info(`Цикл ${step.id} завершен: выполнено ${iterations} итераций`);

    // Возвращаем агрегированный результат
    return {
      stepId: step.id,
      status: 'success',
      outputs: {
        iterations,
        results: allOutputs
      },
      artifacts: allArtifacts,
      executionTime: allResults.reduce((sum, r) => sum + r.executionTime, 0)
    };
  }

  /**
   * Выполнение шага ввода пользователя
   */
  private async executeUserInputStep(
    _step: WorkflowStep,
    _context: ExecutionContext
  ): Promise<StepResult> {
    // TODO: Реализация будет добавлена в следующих задачах
    throw new WorkflowErrorClass({
      code: 'USER_INPUT_NOT_IMPLEMENTED',
      category: 'execution',
      severity: 'error',
      message: 'Шаги ввода пользователя еще не реализованы',
      context: {},
      recoverable: false,
      suggestions: [
        'Эта функциональность будет добавлена в следующих задачах'
      ]
    });
  }

  // ========== Вспомогательные методы ==========

  /**
   * Подготовка промпта для шага модели
   */
  private async preparePrompt(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<string> {
    let template: string;
    
    if (step.prompt_template) {
      // Если указан путь к файлу, загружаем его
      if (step.prompt_template.includes('/') || step.prompt_template.includes('\\')) {
        template = context.templateEngine.loadTemplate(step.prompt_template);
      } else {
        // Иначе используем как inline-шаблон
        template = step.prompt_template;
      }
    } else {
      throw new WorkflowErrorClass({
        code: 'NO_PROMPT_TEMPLATE',
        category: 'execution',
        severity: 'error',
        message: `Не указан шаблон промпта для шага ${step.id}`,
        context: { stepId: step.id },
        recoverable: false,
        suggestions: [
          'Укажите prompt_template в конфигурации шага'
        ]
      });
    }
    
    // Рендерим шаблон с подстановкой переменных
    let renderedPrompt = context.templateEngine.render(
      template,
      this.createTemplateContext(context)
    );
    
    // Добавляем информацию о MCP-инструментах, если доступна
    if (this.mcpManager && this.mcpContext) {
      const mcpInfo = this.mcpManager.formatForPrompt(this.mcpContext);
      if (mcpInfo) {
        renderedPrompt = `${renderedPrompt}\n\n---\n\n${mcpInfo}`;
        context.logger.debug(`Добавлена информация о MCP-инструментах в промпт для шага ${step.id}`);
      }
    }
    
    return renderedPrompt;
  }

  /**
   * Создание контекста шаблона
   */
  private createTemplateContext(context: ExecutionContext) {
    return {
      variables: context.state.context,
      loadArtifact: (path: string) => {
        // Синхронная загрузка для совместимости с интерфейсом
        return readFileSync(path, 'utf-8');
      },
      if: (condition: boolean, thenValue: string, elseValue?: string) => {
        return condition ? thenValue : (elseValue || '');
      },
      forEach: (items: unknown[], template: string) => {
        if (!Array.isArray(items)) {
          return '';
        }
        return items.map(item => 
          template.replace(/\$\{item\}/g, String(item))
        ).join('');
      }
    };
  }

  /**
   * Вычисление условия
   */
  private evaluateCondition(
    condition: string,
    context: ExecutionContext
  ): boolean {
    // Простая реализация: проверяем значение переменной в контексте
    // Поддерживаем точечную нотацию: object.property
    const parts = condition.split('.');
    let value: unknown = context.state.context;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return false;
      }
    }
    
    // Преобразуем в boolean
    if (typeof value === 'boolean') {
      return value;
    }
    
    if (typeof value === 'string') {
      // Специальная обработка строк "false", "0", "" как ложных значений
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'false' || lowerValue === '0' || value.length === 0) {
        return false;
      }
      return true;
    }
    
    if (typeof value === 'number') {
      return value !== 0;
    }
    
    return value != null;
  }

  /**
   * Выполнение скрипта
   */
  private executeScript(
    script: string,
    shell: string,
    timeout: number
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTime: number;
  }> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Определяем команду и аргументы в зависимости от shell
      let command: string;
      let args: string[];
      
      if (shell === 'cmd') {
        command = 'cmd';
        args = ['/c', script];
      } else if (shell === 'powershell') {
        command = 'powershell';
        args = ['-Command', script];
      } else {
        // bash или другой Unix shell
        command = shell;
        args = ['-c', script];
      }

      // Запуск процесса
      const child = spawn(command, args, {
        shell: false,
        windowsHide: true
      });

      // Таймер для таймаута
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Захват stdout
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      // Захват stderr
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Обработка завершения процесса
      child.on('close', (exitCode: number | null) => {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - startTime;

        if (timedOut) {
          reject(new WorkflowErrorClass({
            code: 'SCRIPT_TIMEOUT',
            category: 'execution',
            severity: 'error',
            message: `Скрипт превысил таймаут ${timeout}мс`,
            context: { timeout, stdout, stderr },
            recoverable: true,
            suggestions: [
              'Увеличьте таймаут для шага',
              'Оптимизируйте скрипт для более быстрого выполнения'
            ]
          }));
          return;
        }

        if (exitCode !== 0) {
          reject(new WorkflowErrorClass({
            code: 'SCRIPT_FAILED',
            category: 'execution',
            severity: 'error',
            message: `Скрипт завершился с кодом ${exitCode}`,
            context: { exitCode, stdout, stderr },
            recoverable: true,
            suggestions: [
              'Проверьте вывод stderr для деталей ошибки',
              'Исправьте скрипт и повторите выполнение'
            ]
          }));
          return;
        }

        resolve({
          stdout,
          stderr,
          exitCode: exitCode ?? 0,
          executionTime
        });
      });

      // Обработка ошибок запуска процесса
      child.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        reject(new WorkflowErrorClass({
          code: 'SCRIPT_EXECUTION_ERROR',
          category: 'execution',
          severity: 'error',
          message: `Не удалось выполнить скрипт: ${error.message}`,
          context: { error, shell, script },
          recoverable: false,
          suggestions: [
            'Проверьте правильность синтаксиса скрипта',
            'Убедитесь, что shell доступен в системе'
          ]
        }));
      });
    });
  }

  /**
   * Проверка, можно ли повторить операцию после ошибки
   */
  private isRetryableError(error: Error, config: RetryConfig): boolean {
    // Проверяем, является ли ошибка WorkflowErrorClass
    if (error instanceof WorkflowErrorClass) {
      return config.retryableErrors.includes(error.code);
    }
    
    // Для обычных ошибок проверяем сообщение
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('temporary')
    );
  }

  /**
   * Вычисление задержки для повтора
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay: number;
    
    switch (config.backoffStrategy) {
      case 'fixed':
        delay = config.initialDelay;
        break;
        
      case 'linear':
        delay = config.initialDelay * (attempt + 1);
        break;
        
      case 'exponential':
        delay = config.initialDelay * Math.pow(2, attempt);
        break;
        
      default:
        delay = config.initialDelay;
    }
    
    // Ограничиваем максимальной задержкой
    return Math.min(delay, config.maxDelay);
  }

  /**
   * Задержка выполнения
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Создание исполнителя шагов с конфигурацией по умолчанию
 */
export function createStepExecutor(
  config: StepExecutorConfig = {}
): StepExecutor {
  return new DefaultStepExecutor(config);
}
