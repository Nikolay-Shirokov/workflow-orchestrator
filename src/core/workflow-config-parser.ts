/**
 * Парсер конфигурации рабочих процессов
 * 
 * Отвечает за:
 * - Загрузку и парсинг YAML/JSON конфигураций
 * - Валидацию структуры конфигурации
 * - Проверку циклических зависимостей
 * - Построение графа зависимостей шагов
 */

import { readFile } from 'fs/promises';
import { parse as parseYAML } from 'yaml';
import { WorkflowConfig, WorkflowStep, ValidationError, ValidationResult } from './types.js';

/**
 * Граф зависимостей шагов
 */
export interface DependencyGraph {
  /** Карта шагов: ID -> шаг */
  steps: Map<string, WorkflowStep>;
  
  /** Карта зависимостей: ID шага -> массив ID зависимостей */
  dependencies: Map<string, string[]>;
  
  /** Топологически отсортированный порядок выполнения */
  executionOrder: string[];
}

/**
 * Парсер конфигурации рабочих процессов
 */
export class WorkflowConfigParser {
  /**
   * Кэш распарсенных конфигураций
   */
  private configCache: Map<string, { config: WorkflowConfig; timestamp: number; fileHash: string }> = new Map();
  
  /**
   * Время жизни кэша конфигураций в миллисекундах (10 минут)
   */
  private readonly CONFIG_CACHE_TTL = 10 * 60 * 1000;
  
  /**
   * Загрузка конфигурации из файла с кэшированием
   * @param filePath - Путь к файлу конфигурации (YAML или JSON)
   * @returns Promise<WorkflowConfig>
   */
  async loadFromFile(filePath: string): Promise<WorkflowConfig> {
    // Проверяем кэш
    const cached = this.configCache.get(filePath);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.CONFIG_CACHE_TTL) {
      // Проверяем, не изменился ли файл
      const currentHash = await this.calculateFileHash(filePath);
      
      if (currentHash === cached.fileHash) {
        // Возвращаем закэшированную конфигурацию
        return cached.config;
      }
    }
    
    // Загружаем и парсим конфигурацию
    const content = await readFile(filePath, 'utf-8');
    
    // Определяем формат по расширению файла
    let config: WorkflowConfig;
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      config = this.parseYAML(content);
    } else if (filePath.endsWith('.json')) {
      config = this.parseJSON(content);
    } else {
      throw new Error(`Неподдерживаемый формат файла: ${filePath}. Используйте .yaml, .yml или .json`);
    }
    
    // Кэшируем конфигурацию
    const fileHash = await this.calculateFileHash(filePath);
    this.configCache.set(filePath, {
      config,
      timestamp: now,
      fileHash
    });
    
    return config;
  }
  
  /**
   * Вычисление хэша файла для проверки изменений
   * @param filePath - Путь к файлу
   * @returns Promise<string> - Хэш файла
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const { createHash } = await import('crypto');
    const content = await readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
  }
  
  /**
   * Очистка кэша конфигураций
   */
  clearCache(): void {
    this.configCache.clear();
  }
  
  /**
   * Парсинг YAML конфигурации
   * @param content - Содержимое YAML
   * @returns WorkflowConfig
   */
  parseYAML(content: string): WorkflowConfig {
    try {
      const data = parseYAML(content);
      return this.normalizeConfig(data);
    } catch (error) {
      throw new Error(`Ошибка парсинга YAML: ${(error as Error).message}`);
    }
  }
  
  /**
   * Парсинг JSON конфигурации
   * @param content - Содержимое JSON
   * @returns WorkflowConfig
   */
  parseJSON(content: string): WorkflowConfig {
    try {
      const data = JSON.parse(content);
      return this.normalizeConfig(data);
    } catch (error) {
      throw new Error(`Ошибка парсинга JSON: ${(error as Error).message}`);
    }
  }
  
  /**
   * Нормализация конфигурации к стандартному формату
   * @param data - Сырые данные
   * @returns WorkflowConfig
   */
  private normalizeConfig(data: any): WorkflowConfig {
    // Проверяем наличие корневого объекта workflow
    const workflowData = data.workflow || data;
    
    if (!workflowData.name || !workflowData.version || !workflowData.settings || !workflowData.steps) {
      throw new Error('Конфигурация должна содержать поля: name, version, settings, steps');
    }
    
    return {
      name: workflowData.name,
      version: workflowData.version,
      description: workflowData.description,
      author: workflowData.author,
      created: workflowData.created,
      settings: workflowData.settings,
      adapters: workflowData.adapters || [],
      roles: workflowData.roles || {},
      steps: workflowData.steps
    };
  }
  
  /**
   * Валидация структуры конфигурации
   * @param config - Конфигурация для валидации
   * @returns ValidationResult
   */
  validate(config: WorkflowConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: any[] = [];
    
    // Валидация обязательных полей
    if (!config.name || config.name.trim() === '') {
      errors.push({
        message: 'Поле "name" обязательно и не может быть пустым',
        code: 'MISSING_NAME'
      });
    }
    
    if (!config.version || config.version.trim() === '') {
      errors.push({
        message: 'Поле "version" обязательно и не может быть пустым',
        code: 'MISSING_VERSION'
      });
    }
    
    if (!config.settings) {
      errors.push({
        message: 'Поле "settings" обязательно',
        code: 'MISSING_SETTINGS'
      });
    } else {
      // Валидация настроек
      if (!config.settings.artifacts_dir) {
        errors.push({
          message: 'Поле "settings.artifacts_dir" обязательно',
          code: 'MISSING_ARTIFACTS_DIR'
        });
      }
    }
    
    if (!config.steps || config.steps.length === 0) {
      errors.push({
        message: 'Конфигурация должна содержать хотя бы один шаг',
        code: 'NO_STEPS'
      });
    }
    
    // Валидация шагов
    if (config.steps) {
      const stepIds = new Set<string>();
      
      for (let i = 0; i < config.steps.length; i++) {
        const step = config.steps[i];
        const stepPrefix = `steps[${i}]`;
        
        // Проверка обязательных полей шага
        if (!step.id || step.id.trim() === '') {
          errors.push({
            message: `${stepPrefix}: Поле "id" обязательно`,
            code: 'MISSING_STEP_ID'
          });
        } else {
          // Проверка уникальности ID
          if (stepIds.has(step.id)) {
            errors.push({
              message: `${stepPrefix}: Дублирующийся ID шага "${step.id}"`,
              code: 'DUPLICATE_STEP_ID'
            });
          }
          stepIds.add(step.id);
        }
        
        if (!step.name || step.name.trim() === '') {
          errors.push({
            message: `${stepPrefix}: Поле "name" обязательно`,
            code: 'MISSING_STEP_NAME'
          });
        }
        
        if (!step.type) {
          errors.push({
            message: `${stepPrefix}: Поле "type" обязательно`,
            code: 'MISSING_STEP_TYPE'
          });
        } else {
          // Проверка валидности типа
          const validTypes = ['model', 'script', 'conditional', 'parallel', 'loop', 'user_input'];
          if (!validTypes.includes(step.type)) {
            errors.push({
              message: `${stepPrefix}: Невалидный тип шага "${step.type}". Допустимые: ${validTypes.join(', ')}`,
              code: 'INVALID_STEP_TYPE'
            });
          }
        }
        
        // Валидация зависимостей
        if (step.depends_on) {
          for (const depId of step.depends_on) {
            if (!stepIds.has(depId) && !config.steps.some(s => s.id === depId)) {
              errors.push({
                message: `${stepPrefix}: Ссылка на несуществующий шаг "${depId}" в depends_on`,
                code: 'INVALID_DEPENDENCY'
              });
            }
          }
        }
        
        // Валидация вложенных шагов для parallel
        if (step.type === 'parallel') {
          if (!step.steps || step.steps.length === 0) {
            errors.push({
              message: `${stepPrefix}: Шаг типа "parallel" должен содержать вложенные шаги`,
              code: 'PARALLEL_NO_STEPS'
            });
          }
        }
        
        // Валидация шагов типа loop
        if (step.type === 'loop') {
          if (!step.loop_body) {
            errors.push({
              message: `${stepPrefix}: Шаг типа "loop" должен содержать loop_body`,
              code: 'LOOP_NO_BODY'
            });
          }
          
          if (step.loop_iterations === undefined && step.loop_items === undefined) {
            errors.push({
              message: `${stepPrefix}: Шаг типа "loop" должен содержать loop_iterations или loop_items`,
              code: 'LOOP_NO_CONFIGURATION'
            });
          }
          
          if (step.loop_iterations !== undefined && step.loop_iterations < 0) {
            errors.push({
              message: `${stepPrefix}: loop_iterations должно быть неотрицательным числом`,
              code: 'LOOP_INVALID_ITERATIONS'
            });
          }
        }
      }
    }
    
    // Проверка циклических зависимостей
    if (errors.length === 0 && config.steps) {
      const cycleErrors = this.detectCycles(config.steps);
      errors.push(...cycleErrors);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Обнаружение циклических зависимостей
   * @param steps - Массив шагов
   * @returns ValidationError[] - Массив ошибок циклов
   */
  private detectCycles(steps: WorkflowStep[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const graph = new Map<string, string[]>();
    
    // Построение графа зависимостей
    for (const step of steps) {
      graph.set(step.id, step.depends_on || []);
    }
    
    // DFS для обнаружения циклов
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];
    
    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);
      
      const neighbors = graph.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Найден цикл
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart).concat(neighbor);
          errors.push({
            message: `Обнаружена циклическая зависимость: ${cycle.join(' -> ')}`,
            code: 'CIRCULAR_DEPENDENCY'
          });
          return true;
        }
      }
      
      path.pop();
      recursionStack.delete(nodeId);
      return false;
    };
    
    // Проверяем все узлы
    for (const step of steps) {
      if (!visited.has(step.id)) {
        hasCycle(step.id);
      }
    }
    
    return errors;
  }
  
  /**
   * Построение графа зависимостей шагов
   * @param steps - Массив шагов
   * @returns DependencyGraph
   */
  buildDependencyGraph(steps: WorkflowStep[]): DependencyGraph {
    const stepsMap = new Map<string, WorkflowStep>();
    const dependencies = new Map<string, string[]>();
    
    // Заполняем карты
    for (const step of steps) {
      stepsMap.set(step.id, step);
      dependencies.set(step.id, step.depends_on || []);
    }
    
    // Топологическая сортировка (алгоритм Кана)
    const executionOrder = this.topologicalSort(stepsMap, dependencies);
    
    return {
      steps: stepsMap,
      dependencies,
      executionOrder
    };
  }
  
  /**
   * Топологическая сортировка шагов
   * @param steps - Карта шагов
   * @param dependencies - Карта зависимостей
   * @returns string[] - Отсортированный порядок ID шагов
   */
  private topologicalSort(
    steps: Map<string, WorkflowStep>,
    dependencies: Map<string, string[]>
  ): string[] {
    const result: string[] = [];
    const inDegree = new Map<string, number>();
    
    // Вычисляем входящие степени
    for (const stepId of steps.keys()) {
      inDegree.set(stepId, 0);
    }
    
    for (const deps of dependencies.values()) {
      for (const dep of deps) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }
    
    // Очередь узлов без входящих рёбер
    const queue: string[] = [];
    for (const [stepId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(stepId);
      }
    }
    
    // Обработка очереди
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      
      const deps = dependencies.get(current) || [];
      for (const dep of deps) {
        const newDegree = (inDegree.get(dep) || 0) - 1;
        inDegree.set(dep, newDegree);
        
        if (newDegree === 0) {
          queue.push(dep);
        }
      }
    }
    
    // Если не все узлы обработаны, есть цикл
    if (result.length !== steps.size) {
      throw new Error('Невозможно построить порядок выполнения: обнаружены циклические зависимости');
    }
    
    return result;
  }
}
