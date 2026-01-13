/**
 * TemplateGenerator - генератор шаблонов для файлового ввода пользователя
 * 
 * Поддерживает генерацию шаблонов в различных форматах:
 * - Markdown - удобный для чтения формат с заголовками
 * - YAML - структурированный формат для сложных данных
 * - JSON - формат с комментариями для программной обработки
 * - Text - простой текстовый формат
 */

import { WorkflowStep, ExecutionContext } from './types.js';
import { FileFormat, UserQuestion } from './file-input-types.js';

/**
 * Генератор шаблонов для файлового ввода
 */
export class TemplateGenerator {
  /**
   * Генерация шаблона на основе формата
   * 
   * @param format - Формат файла
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns string - Содержимое шаблона
   */
  generate(
    format: FileFormat,
    step: WorkflowStep,
    context: ExecutionContext
  ): string {
    // Рендерим prompt_message с подстановкой переменных из контекста
    // Это позволяет использовать ${questions}, ${user_need} и другие переменные
    if (step.prompt_message) {
      step.prompt_message = context.templateEngine.render(
        step.prompt_message,
        {
          variables: context.state.context,
          loadArtifact: (_path: string) => '',
          if: (condition: boolean, thenValue: string, elseValue?: string) => 
            condition ? thenValue : (elseValue || ''),
          forEach: (_items: unknown[], _template: string) => ''
        }
      );
    }
    
    switch (format) {
      case 'markdown':
        return this.generateMarkdownTemplate(step, context);
      case 'yaml':
        return this.generateYAMLTemplate(step, context);
      case 'json':
        return this.generateJSONTemplate(step, context);
      case 'text':
        return this.generateTextTemplate(step, context);
      default:
        throw new Error(`Неподдерживаемый формат: ${format}`);
    }
  }
  
  /**
   * Генерация Markdown шаблона
   * 
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns string - Markdown шаблон
   */
  private generateMarkdownTemplate(
    step: WorkflowStep,
    _context: ExecutionContext
  ): string {
    const lines: string[] = [];
    
    // Заголовок
    lines.push(`# ${step.name || 'Ввод пользователя'}`);
    lines.push('');
    
    // Описание
    if (step.description) {
      lines.push(`> ${step.description}`);
      lines.push('');
    }
    
    // Инструкции (используем HTML комментарий, чтобы не передавать их в контекст модели)
    lines.push('<!--');
    lines.push('📝 Инструкции:');
    lines.push('');
    lines.push('1. Заполните разделы ниже, заменив текст в квадратных скобках [...] своими ответами');
    lines.push('2. Сохраните файл (Ctrl+S или Cmd+S)');
    lines.push('3. Вернитесь в терминал и выберите "Продолжить" в интерактивном меню');
    lines.push('');
    lines.push('💡 Совет: Пишите свободно, не обязательно следовать структуре точно. Главное - передать суть.');
    lines.push('-->');
    lines.push('');
    
    // Сообщение с промптом (без разделителя, чтобы не загромождать контекст)
    if (step.prompt_message) {
      lines.push(step.prompt_message);
      lines.push('');
    }
    
    // Извлечение и добавление вопросов
    const questions = this.extractQuestions(step.prompt_message || '');
    if (questions.length > 0) {
      lines.push('## Вопросы');
      lines.push('');
      
      for (const question of questions) {
        lines.push(`### ${question.number}. ${question.text}`);
        lines.push('');
        
        if (question.options && question.options.length > 0) {
          lines.push('**Варианты ответов:**');
          for (const option of question.options) {
            lines.push(`- ${option}`);
          }
          lines.push('');
        }
        
        lines.push('**Ваш ответ:**');
        lines.push('');
        lines.push('<!-- Напишите ваш ответ здесь -->');
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    } else if (!step.prompt_message) {
      // Только если нет prompt_message, добавляем секцию для свободного ответа
      lines.push('## Ваш ответ');
      lines.push('');
      lines.push('<!-- Напишите ваш ответ здесь -->');
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  /**
   * Генерация YAML шаблона
   * 
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns string - YAML шаблон
   */
  private generateYAMLTemplate(
    step: WorkflowStep,
    _context: ExecutionContext
  ): string {
    const lines: string[] = [];
    
    // Комментарий с инструкциями
    lines.push('# ' + (step.name || 'Ввод пользователя'));
    lines.push('#');
    
    if (step.description) {
      lines.push('# ' + step.description);
      lines.push('#');
    }
    
    lines.push('# Инструкции:');
    lines.push('# 1. Заполните поля ниже, заменив пустые строки "" своими ответами');
    lines.push('# 2. Сохраните файл (Ctrl+S или Cmd+S)');
    lines.push('# 3. Вернитесь в терминал и выберите "Продолжить" в меню');
    lines.push('');
    
    // Задание
    if (step.prompt_message) {
      lines.push('# Задание:');
      const promptLines = step.prompt_message.split('\n');
      for (const line of promptLines) {
        lines.push('# ' + line);
      }
      lines.push('');
    }
    
    // Извлечение вопросов
    const questions = this.extractQuestions(step.prompt_message || '');
    
    if (questions.length > 0) {
      lines.push('# Ответы на вопросы:');
      lines.push('answers:');
      
      for (const question of questions) {
        lines.push(`  # Вопрос ${question.number}: ${question.text}`);
        
        if (question.options && question.options.length > 0) {
          lines.push('  # Варианты:');
          for (const option of question.options) {
            lines.push(`  #   - ${option}`);
          }
        }
        
        lines.push(`  question_${question.number}: ""`);
        lines.push('');
      }
    } else {
      lines.push('# Ваш ответ:');
      lines.push('response: ""');
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  /**
   * Генерация JSON шаблона
   * 
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns string - JSON шаблон
   */
  private generateJSONTemplate(
    step: WorkflowStep,
    _context: ExecutionContext
  ): string {
    // Используем объект для безопасного создания JSON
    const jsonObj: Record<string, unknown> = {
      _comment: `Шаблон для: ${step.name || 'Ввод пользователя'}`,
      _instructions: [
        '1. Заполните поля ниже, заменив пустые строки своими ответами',
        '2. Сохраните файл (Ctrl+S или Cmd+S)',
        '3. Вернитесь в терминал и выберите "Продолжить" в меню'
      ]
    };
    
    if (step.description) {
      jsonObj._description = step.description;
    }
    
    if (step.prompt_message) {
      jsonObj._task = step.prompt_message;
    }
    
    // Извлечение вопросов
    const questions = this.extractQuestions(step.prompt_message || '');
    
    if (questions.length > 0) {
      const answers: Record<string, unknown> = {};
      
      for (const question of questions) {
        answers[`_question_${question.number}`] = question.text;
        
        if (question.options && question.options.length > 0) {
          answers[`_options_${question.number}`] = question.options;
        }
        
        answers[`question_${question.number}`] = '';
      }
      
      jsonObj.answers = answers;
    } else {
      jsonObj.response = '';
    }
    
    // Используем JSON.stringify для безопасного создания JSON
    return JSON.stringify(jsonObj, null, 2);
  }
  
  /**
   * Генерация Text шаблона
   * 
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns string - Text шаблон
   */
  private generateTextTemplate(
    step: WorkflowStep,
    _context: ExecutionContext
  ): string {
    const lines: string[] = [];
    
    // Заголовок
    lines.push('=' .repeat(70));
    lines.push((step.name || 'Ввод пользователя').toUpperCase());
    lines.push('='.repeat(70));
    lines.push('');
    
    // Описание
    if (step.description) {
      lines.push(step.description);
      lines.push('');
    }
    
    // Инструкции
    lines.push('ИНСТРУКЦИИ:');
    lines.push('-'.repeat(70));
    lines.push('1. Заполните разделы ниже, заменив текст в [...] своими ответами');
    lines.push('2. Сохраните файл (Ctrl+S или Cmd+S)');
    lines.push('3. Вернитесь в терминал и выберите "Продолжить" в меню');
    lines.push('');
    
    // Задание
    if (step.prompt_message) {
      lines.push('ЗАДАНИЕ:');
      lines.push('-'.repeat(70));
      lines.push(step.prompt_message);
      lines.push('');
    }
    
    // Извлечение вопросов
    const questions = this.extractQuestions(step.prompt_message || '');
    
    if (questions.length > 0) {
      lines.push('ВОПРОСЫ:');
      lines.push('-'.repeat(70));
      lines.push('');
      
      for (const question of questions) {
        lines.push(`${question.number}. ${question.text}`);
        lines.push('');
        
        if (question.options && question.options.length > 0) {
          lines.push('   Варианты ответов:');
          for (const option of question.options) {
            lines.push(`   - ${option}`);
          }
          lines.push('');
        }
        
        lines.push('   Ответ:');
        lines.push('   ');
        lines.push('');
        lines.push('-'.repeat(70));
        lines.push('');
      }
    } else {
      lines.push('ВАШ ОТВЕТ:');
      lines.push('-'.repeat(70));
      lines.push('');
      lines.push('');
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  /**
   * Извлечение вопросов из prompt_message
   * 
   * Поддерживаемые форматы:
   * - "1. Вопрос текст"
   * - "Вопрос 1: текст"
   * - "Q1: текст"
   * 
   * @param promptMessage - Сообщение с вопросами
   * @returns UserQuestion[] - Список вопросов
   */
  extractQuestions(promptMessage: string): UserQuestion[] {
    const questions: UserQuestion[] = [];
    
    if (!promptMessage) {
      return questions;
    }
    
    const lines = promptMessage.split('\n');
    let currentQuestion: Partial<UserQuestion> | null = null;
    let questionNumber = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Пропускаем пустые строки
      if (!trimmed) {
        continue;
      }
      
      // Паттерны для распознавания вопросов
      // 1. "1. Вопрос текст"
      // 2. "Вопрос 1: текст"
      // 3. "Q1: текст"
      const patterns = [
        /^(\d+)\.\s+(.+)/,           // "1. Вопрос"
        /^[Вв]опрос\s+(\d+):\s*(.+)/i, // "Вопрос 1:"
        /^Q(\d+):\s*(.+)/i            // "Q1:"
      ];
      
      let matched = false;
      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          // Сохраняем предыдущий вопрос
          if (currentQuestion && currentQuestion.text) {
            questions.push(currentQuestion as UserQuestion);
          }
          
          questionNumber = parseInt(match[1], 10);
          currentQuestion = {
            number: questionNumber,
            text: match[2].trim(),
            options: [],
            required: true
          };
          
          matched = true;
          break;
        }
      }
      
      // Если это не новый вопрос, проверяем варианты ответов
      if (!matched && currentQuestion) {
        // Паттерны для вариантов ответов
        // - "a) вариант"
        // - "- вариант"
        // - "* вариант"
        const optionPatterns = [
          /^[a-z]\)\s+(.+)/i,  // "a) вариант"
          /^-\s+(.+)/,         // "- вариант"
          /^\*\s+(.+)/         // "* вариант"
        ];
        
        for (const pattern of optionPatterns) {
          const match = trimmed.match(pattern);
          if (match && currentQuestion.options) {
            currentQuestion.options.push(match[1].trim());
            matched = true;
            break;
          }
        }
        
        // Если это не вариант, добавляем к тексту вопроса
        if (!matched && currentQuestion.text) {
          currentQuestion.text += ' ' + trimmed;
        }
      }
    }
    
    // Сохраняем последний вопрос
    if (currentQuestion && currentQuestion.text) {
      questions.push(currentQuestion as UserQuestion);
    }
    
    return questions;
  }
}
