/**
 * Движок шаблонов для Workflow Orchestrator
 * 
 * Поддерживает:
 * - Подстановку переменных: ${variable}
 * - Загрузку артефактов: ${artifact:path/to/file}
 * - Условные блоки: ${if:condition:then_text:else_text}
 */

import * as fs from 'fs';
import {
  TemplateEngine,
  TemplateContext,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  WorkflowErrorClass
} from './types.js';
import { Logger } from './logger.js';

/**
 * Специальная ошибка для отложенного разрешения переменных
 * Используется когда переменная еще не готова к разрешению (например, содержит вложенные переменные)
 */
class DeferredResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeferredResolutionError';
  }
}

/**
 * Реализация движка шаблонов
 */
export class DefaultTemplateEngine implements TemplateEngine {
  /**
   * Регулярное выражение для поиска переменных в шаблоне
   * Поддерживает:
   * - ${variable} - простая переменная
   * - ${artifact:path} - загрузка артефакта
   * - ${if:condition:then:else} - условный блок
   * 
   * Примечание: Это выражение используется для начального поиска переменных.
   * Для вложенных переменных используется специальная логика парсинга.
   */
  private readonly VARIABLE_PATTERN = /\$\{([^}]+)\}/g;
  
  /**
   * Извлечение переменных с учетом вложенных скобок
   * Возвращает массив объектов { match: полное совпадение, expression: выражение внутри скобок, start: позиция начала, end: позиция конца }
   */
  private extractVariablesWithNesting(template: string): Array<{ match: string; expression: string; start: number; end: number }> {
    const variables: Array<{ match: string; expression: string; start: number; end: number }> = [];
    let i = 0;
    
    while (i < template.length) {
      // Ищем начало переменной
      if (template[i] === '$' && template[i + 1] === '{') {
        const start = i;
        i += 2; // Пропускаем ${
        
        // Подсчитываем вложенные скобки
        let depth = 1;
        let expression = '';
        
        while (i < template.length && depth > 0) {
          if (template[i] === '{') {
            depth++;
            expression += template[i];
          } else if (template[i] === '}') {
            depth--;
            if (depth > 0) {
              expression += template[i];
            }
          } else {
            expression += template[i];
          }
          i++;
        }
        
        if (depth === 0) {
          // Нашли полное выражение
          const match = template.substring(start, i);
          variables.push({ match, expression, start, end: i });
        }
      } else {
        i++;
      }
    }
    
    return variables;
  }
  
  /**
   * Кэш загруженных шаблонов (ленивая загрузка)
   */
  private templateCache: Map<string, string> = new Map();
  
  /**
   * Кэш загруженных артефактов (ленивая загрузка)
   */
  private artifactCache: Map<string, { content: string; timestamp: number }> = new Map();
  
  /**
   * Время жизни кэша артефактов в миллисекундах (5 минут)
   */
  private readonly ARTIFACT_CACHE_TTL = 5 * 60 * 1000;
  
  /**
   * Счетчики операций чтения для мониторинга
   */
  private readCounters = {
    cacheHits: 0,      // Количество попаданий в кэш
    cacheMisses: 0,    // Количество промахов кэша
    fileReads: 0       // Количество чтений из файла
  };
  
  /**
   * Логгер (опциональный)
   */
  private logger?: Logger;
  
  /**
   * Конструктор
   * @param logger - Опциональный логгер для отладки
   */
  constructor(logger?: Logger) {
    this.logger = logger;
  }
  
  /**
   * Рендеринг шаблона с подстановкой переменных
   * Поддерживает вложенные переменные через несколько проходов
   */
  render(template: string, context: TemplateContext): string {
    this.logger?.debug('Начало рендеринга шаблона', { 
      templateLength: template.length,
      availableVariables: Object.keys(context.variables)
    });
    
    let result = template;
    let previousResult = '';
    const maxIterations = 10; // Максимум 10 уровней вложенности
    let iteration = 0;
    
    // Повторяем, пока есть изменения (разрешаем вложенные переменные)
    while (result !== previousResult && iteration < maxIterations) {
      previousResult = result;
      
      this.logger?.debug(`Итерация рендеринга ${iteration + 1}`, {
        hasUnresolvedVariables: result.includes('${')
      });
      
      // Извлекаем переменные с учетом вложенных скобок
      const variables = this.extractVariablesWithNesting(result);
      
      // Обрабатываем переменные в обратном порядке (чтобы не сбивать индексы)
      for (let i = variables.length - 1; i >= 0; i--) {
        const { expression, start, end } = variables[i];
        
        try {
          const resolved = this.evaluateExpression(expression, context);
          this.logger?.debug('Переменная разрешена', { 
            expression, 
            resolvedLength: resolved.length 
          });
          
          // Заменяем переменную на разрешенное значение
          result = result.substring(0, start) + resolved + result.substring(end);
        } catch (error) {
          // Перехватываем только DeferredResolutionError - это означает, что переменная еще не готова
          // Все остальные ошибки (например, UNDEFINED_VARIABLE) должны быть выброшены
          if (error instanceof DeferredResolutionError) {
            this.logger?.debug('Переменная отложена на следующую итерацию', { 
              expression,
              error: error.message
            });
          } else {
            // Выбрасываем ошибку дальше
            throw error;
          }
        }
      }
      
      iteration++;
    }
    
    if (iteration >= maxIterations) {
      const unresolvedVars = this.extractVariablesWithNesting(result);
      
      this.logger?.error('Превышен лимит итераций рендеринга', undefined, {
        maxIterations: maxIterations,
        unresolvedVariables: unresolvedVars.map(v => v.match)
      });
      
      throw new WorkflowErrorClass({
        code: 'MAX_TEMPLATE_ITERATIONS',
        category: 'execution',
        severity: 'error',
        message: 'Превышено максимальное количество итераций рендеринга шаблона (возможно, циклическая зависимость)',
        context: { 
          template, 
          maxIterations: maxIterations,
          unresolvedVariables: unresolvedVars.map(v => v.match)
        },
        recoverable: false,
        suggestions: [
          'Проверьте шаблон на циклические зависимости переменных',
          'Упростите структуру вложенных переменных'
        ]
      });
    }
    
    this.logger?.debug('Рендеринг завершен', { 
      iterations: iteration,
      resultLength: result.length 
    });
    
    return result;
  }
  
  /**
   * Загрузка шаблона из файла с кэшированием (ленивая загрузка)
   */
  loadTemplate(filePath: string): string {
    // Проверяем кэш
    if (this.templateCache.has(filePath)) {
      return this.templateCache.get(filePath)!;
    }
    
    try {
      // Синхронное чтение для простоты использования
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Кэшируем загруженный шаблон
      this.templateCache.set(filePath, content);
      
      return content;
    } catch (error) {
      throw new WorkflowErrorClass({
        code: 'TEMPLATE_LOAD_ERROR',
        category: 'execution',
        severity: 'error',
        message: `Не удалось загрузить шаблон из файла: ${filePath}`,
        context: { filePath, error },
        recoverable: false,
        suggestions: [
          'Проверьте, что файл существует',
          'Проверьте права доступа к файлу',
          'Проверьте правильность пути'
        ]
      });
    }
  }
  
  /**
   * Очистка кэша шаблонов
   */
  clearTemplateCache(): void {
    this.templateCache.clear();
  }
  
  /**
   * Очистка кэша артефактов
   */
  clearArtifactCache(): void {
    this.artifactCache.clear();
  }
  
  /**
   * Валидация шаблона
   */
  validate(template: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // Находим все переменные в шаблоне
    const variables = this.extractVariables(template);
    
    // Проверяем синтаксис каждой переменной
    for (const variable of variables) {
      const expression = variable.slice(2, -1); // Убираем ${ и }
      
      // Проверяем пустые выражения
      if (!expression.trim()) {
        errors.push({
          message: 'Пустое выражение в шаблоне',
          code: 'EMPTY_EXPRESSION'
        });
        continue;
      }
      
      // Проверяем синтаксис условных блоков
      if (expression.startsWith('if:')) {
        const parts = expression.slice(3).split(':');
        if (parts.length < 2) {
          errors.push({
            message: `Неверный синтаксис условного блока: ${variable}`,
            code: 'INVALID_IF_SYNTAX'
          });
        }
      }
      
      // Проверяем синтаксис загрузки артефактов
      if (expression.startsWith('artifact:')) {
        const artifactPath = expression.slice(9).trim();
        if (!artifactPath) {
          errors.push({
            message: `Не указан путь к артефакту: ${variable}`,
            code: 'MISSING_ARTIFACT_PATH'
          });
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Извлечение всех переменных из шаблона
   */
  extractVariables(template: string): string[] {
    const variables = this.extractVariablesWithNesting(template);
    return variables.map(v => v.match);
  }
  
  /**
   * Вычисление выражения
   */
  private evaluateExpression(expression: string, context: TemplateContext): string {
    this.logger?.debug('Вычисление выражения', { expression });
    
    // Обработка условных блоков: if:condition:then:else
    if (expression.startsWith('if:')) {
      return this.evaluateConditional(expression, context);
    }
    
    // Обработка загрузки артефактов: artifact:path
    if (expression.startsWith('artifact:')) {
      return this.evaluateArtifact(expression, context);
    }
    
    // Обработка простых переменных
    return this.evaluateVariable(expression, context);
  }
  
  /**
   * Вычисление условного блока
   */
  private evaluateConditional(expression: string, context: TemplateContext): string {
    const parts = expression.slice(3).split(':');
    
    if (parts.length < 2) {
      throw new WorkflowErrorClass({
        code: 'INVALID_CONDITIONAL',
        category: 'execution',
        severity: 'error',
        message: `Неверный синтаксис условного блока: ${expression}`,
        context: { expression },
        recoverable: false,
        suggestions: [
          'Используйте формат: ${if:condition:then_text:else_text}',
          'Минимум два параметра: условие и then-блок'
        ]
      });
    }
    
    const condition = parts[0].trim();
    const thenValue = parts[1];
    const elseValue = parts.length > 2 ? parts.slice(2).join(':') : '';
    
    // Вычисляем условие
    const conditionResult = this.evaluateCondition(condition, context);
    
    return context.if(conditionResult, thenValue, elseValue);
  }
  
  /**
   * Вычисление условия
   */
  private evaluateCondition(condition: string, context: TemplateContext): boolean {
    // Получаем значение переменной
    const value = this.getVariableValue(condition, context);
    
    // Преобразуем в boolean
    if (typeof value === 'boolean') {
      return value;
    }
    
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value.length > 0;
    }
    
    if (typeof value === 'number') {
      return value !== 0;
    }
    
    return value != null;
  }
  
  /**
   * Вычисление загрузки артефакта с кэшированием
   * Поддерживает синтаксис:
   * - ${artifact:path} - загрузка без тегов
   * - ${artifact:${variable}} - загрузка с вложенной переменной
   * - ${artifact:${variable}:tag_name} - загрузка с обрамлением в теги
   */
  private evaluateArtifact(expression: string, context: TemplateContext): string {
    // Парсим выражение: artifact:path[:tag]
    const parts = expression.slice(9).split(':');
    let pathExpression = parts[0].trim();
    const tagName = parts.length > 1 ? parts.slice(1).join(':').trim() : undefined;
    
    if (!pathExpression) {
      throw new WorkflowErrorClass({
        code: 'MISSING_ARTIFACT_PATH',
        category: 'execution',
        severity: 'error',
        message: 'Не указан путь к артефакту',
        context: { expression },
        recoverable: false,
        suggestions: [
          'Используйте формат: ${artifact:path/to/file}',
          'Или: ${artifact:${variable}}',
          'Или: ${artifact:${variable}:tag_name}',
          'Укажите путь к файлу артефакта'
        ]
      });
    }
    
    // Если путь содержит переменные, разрешаем их рекурсивно
    if (pathExpression.includes('${')) {
      this.logger?.debug('Разрешение вложенных переменных в пути артефакта', { 
        pathExpression 
      });
      
      // Разрешаем переменные в пути
      pathExpression = pathExpression.replace(this.VARIABLE_PATTERN, (_match, innerExpression) => {
        return this.evaluateExpression(innerExpression, context);
      });
      
      this.logger?.debug('Путь артефакта разрешен', { 
        resolvedPath: pathExpression 
      });
    }
    
    // Загружаем содержимое артефакта
    const content = this.loadArtifactContent(pathExpression, context);
    
    // Обрамляем в теги, если указано
    if (tagName) {
      return this.wrapInTags(content, tagName);
    }
    
    return content;
  }
  
  /**
   * Загрузка содержимого артефакта с кэшированием
   */
  private loadArtifactContent(artifactPath: string, context: TemplateContext): string {
    // Проверяем кэш артефактов
    const cached = this.artifactCache.get(artifactPath);
    
    if (cached && !this.isCacheExpired(cached.timestamp)) {
      // Возвращаем закэшированное содержимое
      this.readCounters.cacheHits++;
      this.logger?.debug('Артефакт загружен из кэша', { 
        path: artifactPath,
        contentLength: cached.content.length,
        cacheAge: Date.now() - cached.timestamp,
        cacheHits: this.readCounters.cacheHits
      });
      return cached.content;
    }
    
    // Кэш промах или истек
    if (cached) {
      this.logger?.debug('Кэш артефакта истек', { 
        path: artifactPath,
        cacheAge: Date.now() - cached.timestamp
      });
    }
    
    this.readCounters.cacheMisses++;
    this.readCounters.fileReads++;
    
    // Загружаем артефакт
    this.logger?.debug('Загрузка артефакта из файла', { 
      path: artifactPath,
      cacheMisses: this.readCounters.cacheMisses,
      fileReads: this.readCounters.fileReads
    });
    const content = context.loadArtifact(artifactPath);
    
    // Кэшируем содержимое
    this.artifactCache.set(artifactPath, {
      content,
      timestamp: Date.now()
    });
    
    this.logger?.debug('Артефакт загружен и закэширован', { 
      path: artifactPath,
      contentLength: content.length
    });
    
    return content;
  }
  
  /**
   * Проверка актуальности кэша
   * @param timestamp - Временная метка создания записи в кэше
   * @returns true если кэш истек, false если актуален
   */
  private isCacheExpired(timestamp: number): boolean {
    const now = Date.now();
    const age = now - timestamp;
    return age >= this.ARTIFACT_CACHE_TTL;
  }
  
  /**
   * Получение счетчиков операций чтения для мониторинга
   */
  getReadCounters(): { cacheHits: number; cacheMisses: number; fileReads: number } {
    return { ...this.readCounters };
  }
  
  /**
   * Сброс счетчиков операций чтения
   */
  resetReadCounters(): void {
    this.readCounters.cacheHits = 0;
    this.readCounters.cacheMisses = 0;
    this.readCounters.fileReads = 0;
  }
  
  /**
   * Обрамление содержимого в парные теги
   * Экранирует специальные символы в имени тега
   */
  private wrapInTags(content: string, tagName: string): string {
    // Экранируем специальные символы в имени тега
    // Разрешены только буквы, цифры, дефис и подчеркивание
    const safeName = tagName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `<${safeName}>\n${content}\n</${safeName}>`;
  }
  
  /**
   * Вычисление простой переменной
   */
  private evaluateVariable(expression: string, context: TemplateContext): string {
    const value = this.getVariableValue(expression, context);
    
    if (value === undefined || value === null) {
      throw new WorkflowErrorClass({
        code: 'UNDEFINED_VARIABLE',
        category: 'execution',
        severity: 'error',
        message: `Переменная не определена: ${expression}`,
        context: {
          variable: expression,
          availableVariables: Object.keys(context.variables)
        },
        recoverable: false,
        suggestions: [
          `Определите переменную "${expression}" в контексте рабочего процесса`,
          'Проверьте опечатки в имени переменной',
          `Доступные переменные: ${Object.keys(context.variables).join(', ')}`
        ]
      });
    }
    
    return String(value);
  }
  
  /**
   * Получение значения переменной из контекста
   */
  private getVariableValue(name: string, context: TemplateContext): unknown {
    // Поддержка вложенных свойств: object.property
    const parts = name.split('.');
    let value: unknown = context.variables;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }
}

/**
 * Создание контекста шаблона
 */
export function createTemplateContext(
  variables: Record<string, unknown>,
  artifactLoader: (path: string) => string
): TemplateContext {
  return {
    variables,
    
    loadArtifact(path: string): string {
      try {
        return artifactLoader(path);
      } catch (error) {
        throw new WorkflowErrorClass({
          code: 'ARTIFACT_LOAD_ERROR',
          category: 'execution',
          severity: 'error',
          message: `Не удалось загрузить артефакт: ${path}`,
          context: { path, error },
          recoverable: false,
          suggestions: [
            'Проверьте, что артефакт существует',
            'Проверьте правильность пути к артефакту',
            'Убедитесь, что предыдущий шаг успешно создал артефакт'
          ]
        });
      }
    },
    
    if(condition: boolean, thenValue: string, elseValue?: string): string {
      return condition ? thenValue : (elseValue || '');
    },
    
    forEach(items: unknown[], template: string): string {
      if (!Array.isArray(items)) {
        throw new WorkflowErrorClass({
          code: 'INVALID_FOREACH_ITEMS',
          category: 'execution',
          severity: 'error',
          message: 'forEach требует массив элементов',
          context: { items },
          recoverable: false,
          suggestions: [
            'Убедитесь, что передаете массив в forEach',
            'Проверьте тип переменной'
          ]
        });
      }
      
      return items.map(item => {
        // Простая подстановка для каждого элемента
        return template.replace(/\$\{item\}/g, String(item));
      }).join('');
    }
  };
}
