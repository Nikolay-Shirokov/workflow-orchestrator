/**
 * Типы и интерфейсы для функциональности файлового ввода пользователя
 */

/**
 * Результат обработки файлового ввода
 */
export interface FileInputResult {
  /** Успешно ли обработан ввод */
  success: boolean;
  
  /** Путь к файлу с вводом */
  filePath: string;
  
  /** Распарсенные данные */
  data: Record<string, unknown>;
  
  /** Команда пользователя */
  userCommand: UserCommand;
  
  /** Время обработки в миллисекундах */
  processingTime: number;
}

/**
 * Команда пользователя в интерактивном режиме
 */
export type UserCommand = 'continue' | 'postpone';

/**
 * Конфигурация редактора
 */
export interface EditorConfig {
  /** Команда для запуска редактора */
  command?: string;
  
  /** Аргументы командной строки */
  args?: string[];
  
  /** Ожидать ли закрытия редактора */
  wait?: boolean;
}

/**
 * Формат файла для ввода
 */
export type FileFormat = 'markdown' | 'yaml' | 'json' | 'text';

/**
 * Вопрос пользователю
 */
export interface UserQuestion {
  /** Номер вопроса */
  number: number;
  
  /** Текст вопроса */
  text: string;
  
  /** Варианты ответов (опционально) */
  options?: string[];
  
  /** Обязателен ли ответ */
  required?: boolean;
}

/**
 * Ответы пользователя
 */
export interface UserAnswers {
  /** Ответы на вопросы по номерам */
  answers: Record<number, string>;
  
  /** Дополнительный текст (опционально) */
  additionalText?: string;
}
