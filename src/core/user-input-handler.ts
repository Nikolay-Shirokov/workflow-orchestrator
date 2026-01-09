/**
 * UserInputHandler - обработчик интерактивного ввода пользователя
 * 
 * Поддерживает:
 * - Парсинг структурированных ответов (JSON, YAML, Markdown)
 * - Валидацию ответов пользователя
 * - Форматирование ответов для следующих шагов
 * - Паузу и возобновление процесса для ввода
 */

import * as yaml from 'yaml';
import { ValidationRule, WorkflowErrorClass } from './types';

/**
 * Формат ввода пользователя
 */
export type InputFormat = 'text' | 'json' | 'yaml' | 'markdown' | 'questions';

/**
 * Структурированный ответ пользователя
 */
export interface ParsedUserInput {
  /** Формат ответа */
  format: InputFormat;
  
  /** Распарсенные данные */
  data: unknown;
  
  /** Исходный текст */
  rawText: string;
}

/**
 * Вопрос для пользователя
 */
export interface UserQuestion {
  /** ID вопроса */
  id: string;
  
  /** Текст вопроса */
  question: string;
  
  /** Обязателен ли ответ */
  required?: boolean;
  
  /** Тип ожидаемого ответа */
  type?: 'string' | 'number' | 'boolean' | 'array';
  
  /** Значение по умолчанию */
  default?: unknown;
}

/**
 * Ответы пользователя на вопросы
 */
export interface UserAnswers {
  /** Ответы по ID вопроса */
  answers: Record<string, unknown>;
  
  /** Время получения ответов */
  timestamp: string;
}

/**
 * Результат валидации ответа
 */
export interface ValidationResult {
  /** Валиден ли ответ */
  valid: boolean;
  
  /** Список ошибок валидации */
  errors: ValidationError[];
}

/**
 * Ошибка валидации
 */
export interface ValidationError {
  /** Поле с ошибкой */
  field: string;
  
  /** Сообщение об ошибке */
  message: string;
  
  /** Код ошибки */
  code: string;
}

/**
 * Обработчик ввода пользователя
 */
export class UserInputHandler {
  /**
   * Парсинг структурированного ответа
   * 
   * @param input - Текст ответа
   * @param format - Ожидаемый формат
   * @returns ParsedUserInput - Распарсенный ответ
   * @throws WorkflowErrorClass - При ошибке парсинга
   */
  parseStructuredInput(input: string, format: InputFormat): ParsedUserInput {
    try {
      let data: unknown;
      
      switch (format) {
        case 'json':
          data = this.parseJSON(input);
          break;
          
        case 'yaml':
          data = this.parseYAML(input);
          break;
          
        case 'markdown':
          data = this.parseMarkdown(input);
          break;
          
        case 'questions':
          data = this.parseQuestions(input);
          break;
          
        case 'text':
        default:
          data = input.trim();
          break;
      }
      
      return {
        format,
        data,
        rawText: input
      };
    } catch (error) {
      throw new WorkflowErrorClass({
        code: 'USER_INPUT_PARSE_ERROR',
        category: 'user_input',
        severity: 'error',
        message: `Не удалось распарсить ввод в формате ${format}: ${(error as Error).message}`,
        context: {
          format,
          input: input.substring(0, 100) + (input.length > 100 ? '...' : ''),
          error: (error as Error).message
        },
        recoverable: true,
        suggestions: [
          `Проверьте, что ввод соответствует формату ${format}`,
          'Убедитесь, что нет синтаксических ошибок',
          'Попробуйте использовать другой формат'
        ]
      });
    }
  }
  
  /**
   * Парсинг JSON
   */
  private parseJSON(input: string): unknown {
    return JSON.parse(input);
  }
  
  /**
   * Парсинг YAML
   */
  private parseYAML(input: string): unknown {
    return yaml.parse(input);
  }
  
  /**
   * Парсинг Markdown с вопросами и ответами
   * Формат:
   * ## Вопрос 1
   * Ответ 1
   * 
   * ## Вопрос 2
   * Ответ 2
   */
  private parseMarkdown(input: string): Record<string, string> {
    const result: Record<string, string> = {};
    const sections = input.split(/^##\s+/m).filter(s => s.trim());
    
    for (const section of sections) {
      const lines = section.split('\n');
      const question = lines[0].trim();
      const answer = lines.slice(1).join('\n').trim();
      
      if (question && answer) {
        result[question] = answer;
      }
    }
    
    return result;
  }
  
  /**
   * Парсинг структурированных вопросов
   * Формат:
   * 1. Вопрос 1
   *    Ответ: ответ 1
   * 
   * 2. Вопрос 2
   *    Ответ: ответ 2
   */
  private parseQuestions(input: string): Record<string, string> {
    const result: Record<string, string> = {};
    const questionPattern = /(\d+)\.\s+(.+?)(?:\n\s*Ответ:\s*(.+?))?(?=\n\d+\.|$)/gs;
    
    let match;
    while ((match = questionPattern.exec(input)) !== null) {
      const questionId = match[1];
      // const question = match[2].trim(); // Вопрос сохранен в исходном тексте
      const answer = match[3] !== undefined ? match[3].trim() : '';
      
      result[`question_${questionId}`] = answer;
    }
    
    return result;
  }
  
  /**
   * Валидация ответов пользователя
   * 
   * @param data - Данные для валидации
   * @param rules - Правила валидации
   * @returns ValidationResult - Результат валидации
   */
  validateInput(data: unknown, rules: ValidationRule[]): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Преобразуем данные в объект для валидации
    const dataObj = typeof data === 'object' && data !== null ? data as Record<string, unknown> : { value: data };
    
    for (const rule of rules) {
      // Используем hasOwnProperty для избежания проблем с прототипом
      const value = Object.prototype.hasOwnProperty.call(dataObj, rule.field) ? dataObj[rule.field] : undefined;
      
      // Проверка обязательности - пустая строка тоже считается отсутствующим значением
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: rule.field,
          message: rule.message || `Поле "${rule.field}" обязательно для заполнения`,
          code: 'REQUIRED_FIELD'
        });
        continue;
      }
      
      // Если значение не обязательно и отсутствует, пропускаем остальные проверки
      if (!rule.required && (value === undefined || value === null)) {
        continue;
      }
      
      // Проверка типа
      if (rule.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rule.type) {
          errors.push({
            field: rule.field,
            message: rule.message || `Поле "${rule.field}" должно быть типа ${rule.type}, получен ${actualType}`,
            code: 'INVALID_TYPE'
          });
          continue;
        }
      }
      
      // Проверка паттерна (для строк)
      if (rule.pattern && typeof value === 'string') {
        const regex = new RegExp(rule.pattern);
        if (!regex.test(value)) {
          errors.push({
            field: rule.field,
            message: rule.message || `Поле "${rule.field}" не соответствует требуемому формату`,
            code: 'PATTERN_MISMATCH'
          });
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Форматирование ответов для следующих шагов
   * 
   * @param answers - Ответы пользователя
   * @param template - Шаблон форматирования (опционально)
   * @returns string - Отформатированный текст
   */
  formatAnswers(answers: UserAnswers, template?: string): string {
    if (template) {
      // Если есть шаблон, используем его для форматирования
      return this.applyTemplate(template, answers.answers);
    }
    
    // Форматирование по умолчанию
    const lines: string[] = [];
    lines.push('# Ответы пользователя');
    lines.push('');
    lines.push(`Время: ${answers.timestamp}`);
    lines.push('');
    
    for (const [key, value] of Object.entries(answers.answers)) {
      lines.push(`## ${key}`);
      lines.push('');
      lines.push(String(value));
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  /**
   * Применение шаблона к ответам
   */
  private applyTemplate(template: string, answers: Record<string, unknown>): string {
    let result = template;
    
    // Простая подстановка переменных ${variable}
    // Используем функцию замены для корректной обработки специальных символов
    for (const [key, value] of Object.entries(answers)) {
      const pattern = new RegExp(`\\$\\{${this.escapeRegex(key)}\\}`, 'g');
      const replacement = String(value);
      result = result.replace(pattern, () => replacement);
    }
    
    return result;
  }
  
  /**
   * Экранирование специальных символов regex
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * Извлечение вопросов из ответа модели
   * 
   * @param modelResponse - Ответ модели
   * @param format - Формат ответа
   * @returns UserQuestion[] - Список вопросов
   */
  extractQuestions(modelResponse: string, format: InputFormat): UserQuestion[] {
    const parsed = this.parseStructuredInput(modelResponse, format);
    const questions: UserQuestion[] = [];
    
    if (format === 'json') {
      // Ожидаем массив вопросов в JSON
      const data = parsed.data as { questions?: unknown[] };
      if (Array.isArray(data.questions)) {
        for (const q of data.questions) {
          if (typeof q === 'object' && q !== null) {
            const question = q as Record<string, unknown>;
            questions.push({
              id: String(question.id || questions.length + 1),
              question: String(question.question || ''),
              required: Boolean(question.required),
              type: question.type as 'string' | 'number' | 'boolean' | 'array' | undefined,
              default: question.default
            });
          }
        }
      }
    } else if (format === 'yaml') {
      // Аналогично JSON
      const data = parsed.data as { questions?: unknown[] };
      if (Array.isArray(data.questions)) {
        for (const q of data.questions) {
          if (typeof q === 'object' && q !== null) {
            const question = q as Record<string, unknown>;
            questions.push({
              id: String(question.id || questions.length + 1),
              question: String(question.question || ''),
              required: Boolean(question.required),
              type: question.type as 'string' | 'number' | 'boolean' | 'array' | undefined,
              default: question.default
            });
          }
        }
      }
    } else if (format === 'markdown' || format === 'questions') {
      // Извлекаем вопросы из текста
      const lines = modelResponse.split('\n');
      let currentQuestion: Partial<UserQuestion> | null = null;
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Ищем вопросы (начинаются с цифры и точки)
        const questionMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (questionMatch) {
          if (currentQuestion && currentQuestion.question) {
            questions.push(currentQuestion as UserQuestion);
          }
          
          currentQuestion = {
            id: `question_${questionMatch[1]}`,
            question: questionMatch[2],
            required: true,
            type: 'string'
          };
        }
      }
      
      // Добавляем последний вопрос
      if (currentQuestion && currentQuestion.question) {
        questions.push(currentQuestion as UserQuestion);
      }
    }
    
    return questions;
  }
  
  /**
   * Создание объекта ответов из пользовательского ввода
   * 
   * @param questions - Список вопросов
   * @param input - Ввод пользователя
   * @param format - Формат ввода
   * @returns UserAnswers - Ответы пользователя
   */
  createAnswers(questions: UserQuestion[], input: string, format: InputFormat): UserAnswers {
    const parsed = this.parseStructuredInput(input, format);
    const answers: Record<string, unknown> = {};
    
    if (format === 'json' || format === 'yaml') {
      // Прямое сопоставление по ID
      const data = parsed.data as Record<string, unknown>;
      for (const question of questions) {
        if (question.id in data) {
          answers[question.id] = data[question.id];
        } else if (question.default !== undefined) {
          answers[question.id] = question.default;
        }
      }
    } else if (format === 'markdown' || format === 'questions') {
      // Извлекаем ответы из структурированного текста
      const data = parsed.data as Record<string, string>;
      for (const question of questions) {
        if (question.id in data) {
          answers[question.id] = data[question.id];
        } else if (question.default !== undefined) {
          answers[question.id] = question.default;
        }
      }
    } else {
      // Для текстового формата используем весь ввод как один ответ
      if (questions.length > 0) {
        answers[questions[0].id] = parsed.data;
      }
    }
    
    return {
      answers,
      timestamp: new Date().toISOString()
    };
  }
}
