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
   */
  private readonly VARIABLE_PATTERN = /\$\{([^}]+)\}/g;
  
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
   * Рендеринг шаблона с подстановкой переменных
   * Поддерживает вложенные переменные через несколько проходов
   */
  render(template: string, context: TemplateContext): string {
    let result = template;
    let previousResult = '';
    const maxIterations = 10; // Максимум 10 уровней вложенности
    let iteration = 0;
    
    // Повторяем, пока есть изменения (разрешаем вложенные переменные)
    while (result !== previousResult && iteration < maxIterations) {
      previousResult = result;
      
      // Обрабатываем все переменные в шаблоне
      result = result.replace(this.VARIABLE_PATTERN, (match, expression) => {
        try {
          return this.evaluateExpression(expression, context);
        } catch (error) {
          // Если переменная не может быть разрешена, оставляем как есть
          // Это позволит разрешить её на следующей итерации
          return match;
        }
      });
      
      iteration++;
    }
    
    if (iteration >= maxIterations) {
      throw new WorkflowErrorClass({
        code: 'MAX_TEMPLATE_ITERATIONS',
        category: 'execution',
        severity: 'error',
        message: 'Превышено максимальное количество итераций рендеринга шаблона (возможно, циклическая зависимость)',
        context: { template, maxIterations },
        recoverable: false,
        suggestions: [
          'Проверьте шаблон на циклические зависимости переменных',
          'Упростите структуру вложенных переменных'
        ]
      });
    }
    
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
    const variables: string[] = [];
    const matches = template.matchAll(this.VARIABLE_PATTERN);
    
    for (const match of matches) {
      variables.push(match[0]);
    }
    
    return variables;
  }
  
  /**
   * Вычисление выражения
   */
  private evaluateExpression(expression: string, context: TemplateContext): string {
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
   */
  private evaluateArtifact(expression: string, context: TemplateContext): string {
    const artifactPath = expression.slice(9).trim();
    
    if (!artifactPath) {
      throw new WorkflowErrorClass({
        code: 'MISSING_ARTIFACT_PATH',
        category: 'execution',
        severity: 'error',
        message: 'Не указан путь к артефакту',
        context: { expression },
        recoverable: false,
        suggestions: [
          'Используйте формат: ${artifact:path/to/file}',
          'Укажите путь к файлу артефакта'
        ]
      });
    }
    
    // Проверяем, содержит ли путь еще не разрешенные переменные
    if (artifactPath.includes('${')) {
      // Возвращаем выражение как есть, чтобы оно было обработано на следующей итерации
      throw new Error(`Переменная в пути артефакта еще не разрешена: ${artifactPath}`);
    }
    
    // Проверяем кэш артефактов
    const cached = this.artifactCache.get(artifactPath);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.ARTIFACT_CACHE_TTL) {
      // Возвращаем закэшированное содержимое
      return cached.content;
    }
    
    // Загружаем артефакт
    const content = context.loadArtifact(artifactPath);
    
    // Кэшируем содержимое
    this.artifactCache.set(artifactPath, {
      content,
      timestamp: now
    });
    
    return content;
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
