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
import { ValidationRule, WorkflowErrorClass, UserQuestion, UserAnswers } from './types.js';

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
 * Результат валидации пользовательского ввода
 */
export interface UserInputValidationResult {
  /** Валиден ли ответ */
  valid: boolean;
  
  /** Список ошибок валидации */
  errors: UserInputValidationError[];
}

/**
 * Ошибка валидации пользовательского ввода
 */
export interface UserInputValidationError {
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
  validateInput(data: unknown, rules: ValidationRule[]): UserInputValidationResult {
    const errors: UserInputValidationError[] = [];
    
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
    
    if (answers.timestamp) {
      lines.push(`Время: ${answers.timestamp}`);
      lines.push('');
    }
    
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
        const questionId = question.id || `question_${question.number || 0}`;
        if (questionId in data) {
          answers[questionId] = data[questionId];
        } else if (question.default !== undefined) {
          answers[questionId] = question.default;
        }
      }
    } else if (format === 'markdown' || format === 'questions') {
      // Извлекаем ответы из структурированного текста
      const data = parsed.data as Record<string, string>;
      for (const question of questions) {
        const questionId = question.id || `question_${question.number || 0}`;
        if (questionId in data) {
          answers[questionId] = data[questionId];
        } else if (question.default !== undefined) {
          answers[questionId] = question.default;
        }
      }
    } else {
      // Для текстового формата используем весь ввод как один ответ
      if (questions.length > 0) {
        const questionId = questions[0].id || `question_${questions[0].number || 0}`;
        answers[questionId] = parsed.data;
      }
    }
    
    return {
      answers,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Извлечение только ответов без вопросов для оптимизации контекста
   * 
   * Этот метод позволяет минимизировать размер данных, передаваемых в контекст,
   * удаляя текст вопросов и оставляя только ответы пользователя.
   * 
   * @param answers - Полные ответы пользователя
   * @param questions - Список вопросов (опционально, для включения текста вопросов)
   * @param includeQuestions - Включать ли текст вопросов в результат (по умолчанию false)
   * @returns Record<string, unknown> - Только ответы или ответы с вопросами
   * 
   * @example
   * // Только ответы (оптимизированный контекст)
   * const optimized = handler.extractAnswersOnly(userAnswers, questions, false);
   * // { "question_1": "Ответ 1", "question_2": "Ответ 2" }
   * 
   * @example
   * // С вопросами (полный контекст)
   * const full = handler.extractAnswersOnly(userAnswers, questions, true);
   * // { "question_1": { "question": "Вопрос 1?", "answer": "Ответ 1" }, ... }
   */
  extractAnswersOnly(
    answers: UserAnswers,
    questions?: UserQuestion[],
    includeQuestions: boolean = false
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    if (!includeQuestions) {
      // Возвращаем только ответы без вопросов (оптимизация размера)
      return { ...answers.answers };
    }
    
    // Если нужно включить вопросы, создаем структуру с вопросами и ответами
    if (questions && questions.length > 0) {
      // Создаем карту вопросов по ID для быстрого доступа
      const questionMap = new Map<string, UserQuestion>();
      for (const question of questions) {
        const questionId = question.id || `question_${question.number || 0}`;
        questionMap.set(questionId, question);
      }
      
      // Формируем результат с вопросами и ответами
      for (const [questionId, answer] of Object.entries(answers.answers)) {
        const question = questionMap.get(questionId);
        
        if (question) {
          const questionText = question.question || question.text || '';
          result[questionId] = {
            question: questionText,
            answer: answer
          };
        } else {
          // Если вопрос не найден, просто добавляем ответ
          result[questionId] = answer;
        }
      }
    } else {
      // Если вопросы не предоставлены, возвращаем только ответы
      return { ...answers.answers };
    }
    
    return result;
  }
  
  /**
   * Форматирование данных для контекста в указанном формате
   * 
   * Этот метод преобразует ответы пользователя в компактный формат для передачи
   * в контекст следующих шагов, минимизируя размер данных и сохраняя структуру.
   * 
   * @param answers - Ответы пользователя
   * @param format - Формат вывода ('text', 'json', 'yaml')
   * @param questions - Список вопросов (опционально, для включения в контекст)
   * @param includeQuestions - Включать ли текст вопросов (по умолчанию false)
   * @returns string - Отформатированные данные
   * 
   * @example
   * // Текстовый формат (минимальный размер)
   * const text = handler.formatForContext(answers, 'text');
   * // "question_1: Ответ 1\nquestion_2: Ответ 2"
   * 
   * @example
   * // JSON формат (структурированный)
   * const json = handler.formatForContext(answers, 'json');
   * // '{"question_1":"Ответ 1","question_2":"Ответ 2"}'
   * 
   * @example
   * // YAML формат (читаемый)
   * const yamlStr = handler.formatForContext(answers, 'yaml');
   * // "question_1: Ответ 1\nquestion_2: Ответ 2"
   */
  formatForContext(
    answers: UserAnswers,
    format: 'text' | 'json' | 'yaml',
    questions?: UserQuestion[],
    includeQuestions: boolean = false
  ): string {
    // Извлекаем данные (с вопросами или без)
    const data = this.extractAnswersOnly(answers, questions, includeQuestions);
    
    switch (format) {
      case 'json':
        // JSON формат - компактный, без отступов для минимизации размера
        return JSON.stringify(data);
        
      case 'yaml':
        // YAML формат - читаемый, но компактный
        return yaml.stringify(data, {
          indent: 2,
          lineWidth: 0, // Отключаем перенос строк
          minContentWidth: 0
        });
        
      case 'text':
      default:
        // Текстовый формат - самый компактный
        const lines: string[] = [];
        
        for (const [key, value] of Object.entries(data)) {
          if (includeQuestions && typeof value === 'object' && value !== null) {
            // Если включены вопросы, форматируем как "Q: вопрос\nA: ответ"
            const qaPair = value as { question?: string; answer?: unknown };
            if (qaPair.question) {
              lines.push(`${key}:`);
              lines.push(`  Q: ${qaPair.question}`);
              lines.push(`  A: ${String(qaPair.answer)}`);
            } else {
              lines.push(`${key}: ${String(value)}`);
            }
          } else {
            // Простой формат "key: value"
            const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
            lines.push(`${key}: ${valueStr}`);
          }
        }
        
        return lines.join('\n');
    }
  }
}
