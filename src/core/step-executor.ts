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
import { cpus } from 'os';
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
import type { Logger as CoreLogger } from './logger.js';

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
    const cpuCount = cpus().length;
    return Math.min(cpuCount, 10);
  }
  
  /**
   * Выполнение шагов с ограничением конкурентности
   */
  private async executeStepsWithConcurrencyLimit(
    steps: WorkflowStep[],
    context: ExecutionContext,
    _maxConcurrency: number  // Префикс _ указывает, что параметр не используется
  ): Promise<StepResult[]> {
    // Используем Promise.allSettled для ожидания завершения всех шагов,
    // даже если некоторые завершились с ошибкой
    const promises = steps.map(step => this.executeStep(step, context));
    
    // Promise.allSettled дождется завершения всех промисов
    const settledResults = await Promise.allSettled(promises);
    
    // Собираем результаты и ошибки
    const results: StepResult[] = [];
    const errors: Array<{ stepId: string; error: Error }> = [];
    
    for (let i = 0; i < settledResults.length; i++) {
      const settled = settledResults[i];
      const step = steps[i];
      
      if (settled.status === 'fulfilled') {
        // Успешное выполнение
        results.push(settled.value);
      } else {
        // Ошибка выполнения
        const error = settled.reason as Error;
        
        // Создаем результат с ошибкой
        const failedResult: StepResult = {
          stepId: step.id,
          status: 'failed',
          outputs: {},
          artifacts: [],
          executionTime: 0,
          error
        };
        
        results.push(failedResult);
        errors.push({ stepId: step.id, error });
        
        context.logger.error(`Шаг ${step.id} завершился с ошибкой:`, error);
      }
    }
    
    // Если были ошибки, выбрасываем агрегированную ошибку
    if (errors.length > 0) {
      const errorMessages = errors
        .map(e => `${e.stepId}: ${e.error.message}`)
        .join('; ');
      
      throw new WorkflowErrorClass({
        code: 'PARALLEL_EXECUTION_FAILED',
        category: 'execution',
        severity: 'error',
        message: `${errors.length} из ${steps.length} параллельных шагов завершились с ошибкой: ${errorMessages}`,
        context: {
          failedSteps: errors.map(e => e.stepId),
          errors: errorMessages,
          totalSteps: steps.length,
          failedCount: errors.length
        },
        recoverable: false,
        suggestions: [
          'Проверьте логи для деталей каждой ошибки',
          'Исправьте ошибки и повторите выполнение'
        ]
      });
    }
    
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
      const allAdapters = context.adapters.getAll();
      const availableCount = allAdapters.length;
      const availableNames = allAdapters.map(a => a.name);
      context.logger.error(`Адаптер "${adapterName}" не найден.`);
      context.logger.error(`Доступно адаптеров: ${availableCount}`);
      context.logger.error(`Имена: ${JSON.stringify(availableNames)}`);
      context.logger.error(`Ищем: "${adapterName}", тип: ${typeof adapterName}`);
      
      throw new WorkflowErrorClass({
        code: 'ADAPTER_NOT_FOUND',
        category: 'execution',
        severity: 'error',
        message: `Адаптер не найден: ${adapterName}`,
        context: { stepId: step.id, adapterName, availableNames, availableCount },
        recoverable: false,
        suggestions: [
          'Проверьте правильность имени адаптера',
          'Убедитесь, что адаптер зарегистрирован',
          `Доступные адаптеры: ${availableNames.join(', ')}`
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
          context.state.sessionId,
          step.id,
          renderedPath,
          response.content
        );
        
        artifacts.push(artifactPath);
        
        // Обновление контекста
        context.state.context[outputName] = response.content;
        context.state.context[`${outputName}_file`] = artifactPath;  // Добавляем путь к файлу
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
          context.state.sessionId,
          step.id,
          renderedPath,
          result.stdout
        );
        
        artifacts.push(artifactPath);
        
        // ДВОЙНАЯ ПЕРЕДАЧА КОНТЕКСТА:
        // 1. Содержимое напрямую (для быстрого доступа)
        context.state.context[outputName] = result.stdout;
        
        // 2. Путь к файлу (для явной загрузки)
        context.state.context[`${outputName}_file`] = artifactPath;
        
        // 3. Сохраняем в artifacts для отслеживания
        context.state.artifacts[outputName] = artifactPath;
        
        context.logger.debug(
          `Добавлено в контекст: ${outputName} (${result.stdout.length} символов), ` +
          `${outputName}_file (${artifactPath})`
        );
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
    
    // Собираем все выходы - каждый результат содержит outputs своего шага
    // Создаем структуру где каждый stepId содержит свои outputs
    const allOutputs: Record<string, unknown> = {};
    for (const result of results) {
      allOutputs[result.stepId] = result.outputs;
    }
    
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
   * 
   * Логика работы:
   * - Определяет режим ввода (file или console) на основе конфигурации
   * - Для file mode: делегирует обработку FileInputHandler
   * - Для console mode: использует существующую логику с заглушками
   * - При возобновлении: загружает данные из артефакта и добавляет в контекст
   */
  private async executeUserInputStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    // Определяем режим ввода
    // Приоритет: step.input_mode > settings.default_input_mode > 'console'
    const inputMode = step.input_mode || 
                     (context.state.context.default_input_mode as string) || 
                     'console';
    
    context.logger.debug(`Режим ввода для шага ${step.id}: ${inputMode}`);
    
    // Проверяем, есть ли уже артефакт с ответами пользователя
    // Если есть - это возобновление после паузы
    let userInputExists = false;
    
    if (step.outputs) {
      for (const [outputName, outputPath] of Object.entries(step.outputs)) {
        const renderedPath = context.templateEngine.render(
          outputPath,
          this.createTemplateContext(context)
        );
        
        // Проверяем существование файла
        try {
          const content = readFileSync(renderedPath, 'utf-8');
          // Проверяем, что это не заглушка
          if (!content.includes('Ожидается ввод пользователя')) {
            userInputExists = true;
            
            // Загружаем данные в контекст
            context.state.context[outputName] = content;
            context.state.context[`${outputName}_file`] = renderedPath;
            
            context.logger.info(
              `Загружены ответы пользователя из ${renderedPath} (${content.length} символов)`
            );
          }
        } catch (error) {
          // Файл не существует - это первое выполнение
        }
      }
    }
    
    // Если данные уже есть - возвращаем успешный результат
    if (userInputExists) {
      context.logger.info(`Шаг ${step.id}: ввод пользователя уже предоставлен, продолжаем выполнение`);
      
      // ВАЖНО: сбрасываем статус paused, чтобы процесс продолжился
      // Это критично для корректного завершения процесса после возобновления
      if (context.state.status === 'paused') {
        context.state.status = 'running';
        context.logger.info(`Статус процесса изменен с 'paused' на 'running' после загрузки ввода пользователя`);
      }
      
      const artifacts: string[] = [];
      if (step.outputs) {
        for (const [outputName] of Object.entries(step.outputs)) {
          if (context.state.context[`${outputName}_file`]) {
            artifacts.push(context.state.context[`${outputName}_file`] as string);
          }
        }
      }
      
      return {
        stepId: step.id,
        status: 'success',
        outputs: {
          message: 'Ввод пользователя загружен',
          inputFormat: step.input_format || 'text'
        },
        artifacts,
        executionTime: 0
      };
    }
    
    // Первое выполнение - обрабатываем в зависимости от режима
    if (inputMode === 'file') {
      // Файловый режим - делегируем FileInputHandler
      return this.executeFileInputMode(step, context);
    } else {
      // Консольный режим - используем существующую логику
      return this.executeConsoleInputMode(step, context);
    }
  }
  
  /**
   * Выполнение шага ввода в файловом режиме
   * 
   * Делегирует обработку FileInputHandler, который:
   * - Создает файл-шаблон
   * - Открывает его в редакторе
   * - Ожидает подтверждения пользователя
   * - Читает и валидирует заполненный файл
   * 
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns Promise<StepResult> - Результат выполнения
   */
  private async executeFileInputMode(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    context.logger.info(`Шаг ${step.id}: файловый режим ввода`);
    
    // Импортируем необходимые компоненты
    const { FileInputHandler } = await import('./file-input-handler.js');
    const { TemplateGenerator } = await import('./template-generator.js');
    const { EditorManager } = await import('./editor-manager.js');
    const { UserInputHandler } = await import('./user-input-handler.js');
    
    // Создаем экземпляры компонентов
    const templateGenerator = new TemplateGenerator();
    
    // Создаем Logger для EditorManager
    const editorManager = new EditorManager(context.logger as unknown as CoreLogger);
    const userInputHandler = new UserInputHandler();

    const progress = (context as { progress?: { showMenu?: (options: Array<{ label: string; value: string }>, config?: { title?: string; defaultIndex?: number }) => Promise<string> } }).progress;
    const showMenu = typeof progress?.showMenu === 'function' ? progress.showMenu.bind(progress) : undefined;
    const menuHandler = showMenu
      ? async (options: Array<{ label: string; value: string }>, config?: { title?: string; defaultIndex?: number }) => {
          const result = await showMenu(options, config);
          return result as 'continue' | 'postpone';
        }
      : undefined;
    
    // Создаем обертку для context.logger, чтобы использовать его с FileInputHandler
    const loggerWrapper = {
      debug: (message: string, ...args: unknown[]) => context.logger.debug(message, ...args),
      info: (message: string, ...args: unknown[]) => context.logger.info(message, ...args),
      warn: (message: string, ...args: unknown[]) => context.logger.warn(message, ...args),
      error: (message: string, ...args: unknown[]) => context.logger.error(message, ...args)
    };
    
    const fileInputHandler = new FileInputHandler(
      templateGenerator,
      editorManager,
      userInputHandler,
      loggerWrapper as never, // Используем as never для обхода проверки типов
      process.env.NODE_ENV === 'test',
      menuHandler
    );
    
    try {
      // Обрабатываем файловый ввод
      const result = await fileInputHandler.handleFileInput(step, context);
      
      // Если пользователь выбрал отложить
      if (!result.success || result.userCommand === 'postpone') {
        context.logger.info('Пользователь выбрал отложить выполнение');
        
        // Статус уже установлен в 'paused' в FileInputHandler
        return {
          stepId: step.id,
          status: 'skipped',
          outputs: {
            message: 'Выполнение отложено пользователем',
            inputFormat: step.file_format || 'markdown'
          },
          artifacts: [result.filePath],
          executionTime: result.processingTime
        };
      }
      
      // Успешная обработка - сохраняем данные в контекст
      const artifacts: string[] = [result.filePath];
      
      if (step.outputs) {
        // Определяем, нужно ли включать вопросы в контекст
        const includeQuestions = step.include_questions !== undefined ? 
                                step.include_questions : false;
        
        // Определяем формат для контекста (по умолчанию json)
        const contextFormat = step.file_format === 'yaml' ? 'yaml' : 
                             step.file_format === 'text' ? 'text' : 'json';
        
        for (const [outputName, outputPath] of Object.entries(step.outputs)) {
          const renderedPath = context.templateEngine.render(
            outputPath,
            this.createTemplateContext(context)
          );
          
          // Форматируем данные для контекста
          // Если include_questions = false, передаем только ответы
          let contextData: string;
          
          if (typeof result.data === 'object' && result.data !== null && 'answers' in result.data) {
            // Данные в формате UserAnswers - используем formatForContext
            const userAnswers = result.data as { answers: Record<string, unknown>; timestamp?: string };
            contextData = userInputHandler.formatForContext(
              { answers: userAnswers.answers, timestamp: userAnswers.timestamp },
              contextFormat,
              undefined, // questions не передаем, так как их нет в result.data
              includeQuestions
            );
          } else {
            // Данные в другом формате - сохраняем как есть
            contextData = typeof result.data === 'string' ? 
                         result.data : 
                         JSON.stringify(result.data, null, 2);
          }
          
          // Сохраняем данные в артефакт
          const artifactPath = await context.artifactManager.save(
            context.state.sessionId,
            step.id,
            renderedPath,
            contextData
          );
          
          artifacts.push(artifactPath);
          
          // Обновляем контекст
          // Сохраняем отформатированные данные (только ответы или с вопросами)
          context.state.context[outputName] = contextData;
          context.state.context[`${outputName}_file`] = artifactPath;
          context.state.artifacts[outputName] = artifactPath;
          
          context.logger.debug(
            `Сохранено в контекст: ${outputName} ` +
            `(${contextData.length} символов, includeQuestions: ${includeQuestions})`
          );
        }
      }
      
      context.logger.info(`Шаг ${step.id}: файловый ввод успешно обработан`);
      
      return {
        stepId: step.id,
        status: 'success',
        outputs: {
          message: 'Файловый ввод успешно обработан',
          inputFormat: step.file_format || 'markdown',
          data: result.data
        },
        artifacts,
        executionTime: result.processingTime
      };
      
    } catch (error) {
      context.logger.error(`Ошибка обработки файлового ввода для шага ${step.id}`, error as Error);
      throw error;
    }
  }
  
  /**
   * Выполнение шага ввода в консольном режиме
   * 
   * Использует существующую логику с заглушками:
   * - Приостанавливает процесс
   * - Создает заглушки для артефактов
   * - Ожидает ручного заполнения файлов пользователем
   * 
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns Promise<StepResult> - Результат выполнения
   */
  private async executeConsoleInputMode(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    context.logger.info(`Шаг ${step.id}: консольный режим ввода (существующая логика)`);
    
    // Приостанавливаем процесс
    context.state.status = 'paused';
    context.state.currentStep = step.id;
    
    // Сохраняем информацию о том, что ожидается ввод пользователя
    context.state.context['awaiting_user_input'] = {
      stepId: step.id,
      stepName: step.name,
      inputFormat: step.input_format || 'text',
      promptMessage: step.prompt_message,
      timestamp: new Date().toISOString()
    };
    
    // Если есть выходы, создаем заглушки для артефактов
    const artifacts: string[] = [];
    
    if (step.outputs) {
      for (const [outputName, outputPath] of Object.entries(step.outputs)) {
        // Рендеринг пути с подстановкой переменных
        const renderedPath = context.templateEngine.render(
          outputPath,
          this.createTemplateContext(context)
        );
        
        // Создаем заглушку для артефакта с информацией о том, что ожидается ввод
        const placeholderContent = `# Ожидается ввод пользователя\n\nШаг: ${step.name}\nФормат: ${step.input_format || 'text'}\n\nВвод будет сохранен здесь после предоставления пользователем.`;
        
        const artifactPath = await context.artifactManager.save(
          context.state.sessionId,
          step.id,
          renderedPath,
          placeholderContent
        );
        
        artifacts.push(artifactPath);
        
        // Обновление контекста с заглушкой
        context.state.context[outputName] = placeholderContent;
        context.state.artifacts[outputName] = artifactPath;
      }
    }
    
    context.logger.info(
      `Процесс приостановлен на шаге ${step.id}. ` +
      `Для продолжения предоставьте ввод пользователя и возобновите выполнение.`
    );
    
    // Возвращаем результат с пометкой 'skipped' для текущего выполнения
    // Это позволит процессу корректно завершиться и сохранить состояние
    return {
      stepId: step.id,
      status: 'skipped',
      outputs: {
        message: 'Ожидается ввод пользователя',
        inputFormat: step.input_format || 'text'
      },
      artifacts,
      executionTime: 0
    };
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
      // Определяем, является ли prompt_template путем к файлу или inline-шаблоном
      // Путь к файлу должен:
      // 1. Начинаться с относительного пути (prompts/, examples/, ./,../)
      // 2. Или быть абсолютным путем (C:\, /home/, etc)
      // 3. И НЕ содержать переменных шаблона в начале строки
      const isFilePath = (
        // Проверяем что это не inline-шаблон с переменными
        !step.prompt_template.trim().startsWith('${') &&
        (
          // Относительные пути
          step.prompt_template.startsWith('prompts/') ||
          step.prompt_template.startsWith('examples/') ||
          step.prompt_template.startsWith('./') ||
          step.prompt_template.startsWith('../') ||
          step.prompt_template.startsWith('prompts\\') ||
          step.prompt_template.startsWith('examples\\') ||
          step.prompt_template.startsWith('.\\') ||
          step.prompt_template.startsWith('..\\') ||
          // Абсолютные пути
          /^[A-Za-z]:\\/.test(step.prompt_template) || // Windows: C:\
          step.prompt_template.startsWith('/') // Unix: /home/
        )
      );
      
      if (isFilePath) {
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
        args = ['/c', 'chcp 65001 >nul && ' + script];
      } else if (shell === 'powershell') {
        command = 'powershell';
        // Добавляем команду для установки UTF-8 кодировки
        const utf8Script = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`;
        args = ['-NoProfile', '-Command', utf8Script];
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
        stdout += data.toString('utf-8');
      });

      // Захват stderr
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8');
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
