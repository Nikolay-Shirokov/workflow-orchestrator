/**
 * Базовые типы и интерфейсы для Workflow Orchestrator
 */

// Экспорт типов файлового ввода
export * from './file-input-types.js';

/**
 * Конфигурация рабочего процесса
 */
export interface WorkflowConfig {
  name: string;
  version: string;
  description?: string;
  author?: string;
  created?: string;
  settings: WorkflowSettings;
  adapters?: AdapterConfig[];
  roles?: Record<string, RoleConfig>;
  steps: WorkflowStep[];
}

/**
 * Настройки рабочего процесса
 */
export interface WorkflowSettings {
  artifacts_dir: string;
  default_adapter?: string;
  parallel_execution?: boolean;
  max_retries?: number;
  timeout?: number;
  log_level?: string;
  mcp_tools?: MCPToolConfig[];
  
  /** Режим ввода по умолчанию */
  default_input_mode?: 'file' | 'console';
  
  /** Формат файла по умолчанию */
  default_file_format?: 'markdown' | 'yaml' | 'json' | 'text';
  
  /** Конфигурация редактора по умолчанию */
  default_editor?: {
    command?: string;
    args?: string[];
    wait?: boolean;
  };
}

/**
 * Конфигурация MCP-инструмента
 * @deprecated Используйте StepCapabilities.mcp_tools вместо этого.
 * MCP-серверы теперь настраиваются на уровне CLI-утилиты, а не workflow.
 */
export interface MCPToolConfig {
  /** Имя инструмента */
  name: string;

  /** Команда для проверки доступности */
  checkCommand?: string;

  /** Ожидаемый код выхода при успехе */
  expectedExitCode?: number;

  /** Таймаут проверки в миллисекундах */
  timeout?: number;

  /** Обязателен ли инструмент */
  required?: boolean;
}

/**
 * Информация о MCP-инструменте
 * @deprecated Используйте StepCapabilities.mcp_tools вместо этого.
 */
export interface MCPToolInfo {
  /** Имя инструмента */
  name: string;

  /** Описание инструмента */
  description: string;

  /** Доступен ли инструмент */
  available: boolean;

  /** Версия инструмента (если доступна) */
  version?: string;

  /** Дополнительные метаданные */
  metadata?: Record<string, unknown>;
}

/**
 * Контекст MCP для передачи в модель
 * @deprecated Используйте StepCapabilities вместо этого.
 */
export interface MCPContext {
  /** Доступные инструменты */
  available_tools: string[];

  /** Недоступные инструменты */
  unavailable_tools: string[];

  /** Детальная информация об инструментах */
  tools: Record<string, MCPToolInfo>;

  /** Флаги доступности для условного выполнения */
  flags: Record<string, boolean>;
}

/**
 * Конфигурация CLI-адаптера
 */
export interface AdapterConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  parser?: string;
  timeout?: number;
  /** Использовать stdin для передачи промпта вместо аргументов командной строки */
  useStdin?: boolean;
}

/**
 * Конфигурация роли
 */
export interface RoleConfig {
  adapter: string;
  model?: string;
  role_definition?: string;
  custom_instructions?: string;
  permissions?: (string | Record<string, string>)[];
  temperature?: number;
  max_tokens?: number;

  /**
   * Capabilities по умолчанию для всех шагов этой роли
   * Шаг может переопределить capabilities частично или полностью
   *
   * Приоритет: step.permissions.capabilities > role.default_capabilities
   *
   * @see StepCapabilities
   */
  default_capabilities?: StepCapabilities;
}

/**
 * Шаг рабочего процесса
 */
export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  description?: string;
  depends_on?: string[];
  condition?: string;
  
  // Для type: 'model'
  role?: string;
  adapter?: string;
  model?: string;
  prompt_template?: string;
  system_prompt?: string;
  
  // Для type: 'script'
  script?: string;
  shell?: string;
  
  // Для type: 'conditional'
  thenStep?: WorkflowStep;
  elseStep?: WorkflowStep;
  
  // Для type: 'parallel'
  steps?: WorkflowStep[];
  
  // Для type: 'loop'
  loop_iterations?: number;
  loop_variable?: string;
  loop_items?: unknown[];
  loop_body?: WorkflowStep;
  
  // Для type: 'user_input'
  input_format?: string;
  prompt_message?: string;
  validation?: ValidationRule[];
  
  /** Режим ввода: file или console */
  input_mode?: 'file' | 'console';
  
  /** Формат файла для file mode */
  file_format?: 'markdown' | 'yaml' | 'json' | 'text';
  
  /** Конфигурация редактора */
  editor?: {
    command?: string;
    args?: string[];
    wait?: boolean;
  };
  
  /** Включать ли вопросы в контекст */
  include_questions?: boolean;
  
  // Входы и выходы
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  
  // Настройки выполнения
  timeout?: number;
  retries?: number;
  continue_on_error?: boolean;

  /**
   * Разрешения для данного шага
   * Позволяет указать права доступа к файлам, shell и capabilities
   * @see StepPermissions
   */
  permissions?: StepPermissions;
}

/**
 * Тип шага
 */
export type StepType = 'model' | 'script' | 'conditional' | 'parallel' | 'loop' | 'user_input';

/**
 * Правило валидации
 */
export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: string;
  pattern?: string;
  message?: string;
}

/**
 * Состояние рабочего процесса
 */
export interface WorkflowState {
  sessionId: string;
  workflowName: string;
  workflowVersion: string;
  currentStep: string;
  status: WorkflowStatus;
  
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  
  completedSteps: string[];
  artifacts: Record<string, string>;
  context: Record<string, unknown>;
  history: StepHistory[];
  errors: WorkflowError[];
}

/**
 * Статус рабочего процесса
 */
export type WorkflowStatus = 'running' | 'paused' | 'completed' | 'failed';

/**
 * История выполнения шага
 */
export interface StepHistory {
  stepId: string;
  stepName: string;
  status: StepStatus;
  startedAt: string;
  completedAt: string;
  executionTime: number;
  adapter?: string;
  model?: string;
  artifacts: string[];
  error?: string;
}

/**
 * Статус шага
 */
export type StepStatus = 'success' | 'failed' | 'skipped';

/**
 * Ошибка рабочего процесса
 */
export interface WorkflowError {
  stepId: string;
  timestamp: string;
  error: string;
  stackTrace?: string;
  retryCount: number;
}

// ============================================================================
// CLI Adapter интерфейсы
// ============================================================================

/**
 * Интерфейс CLI-адаптера для взаимодействия с AI-моделями
 */
export interface CLIAdapter {
  /** Имя адаптера */
  name: string;
  
  /** Версия адаптера */
  version: string;
  
  /**
   * Проверка доступности утилиты
   * @returns Promise<boolean> - true если утилита доступна
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Выполнение запроса к модели
   * @param request - Запрос к адаптеру
   * @returns Promise<AdapterResponse> - Ответ от модели
   */
  execute(request: AdapterRequest): Promise<AdapterResponse>;
  
  /**
   * Парсинг ответа модели
   * @param rawOutput - Сырой вывод от CLI
   * @returns string - Распарсенный контент
   */
  parseResponse(rawOutput: string): string;
  
  /**
   * Обработка ошибок
   * @param error - Ошибка выполнения
   * @returns AdapterError - Структурированная ошибка
   */
  handleError(error: Error): AdapterError;
}

// ============================================================================
// Plugin System интерфейсы
// ============================================================================

/**
 * Метаданные плагина адаптера
 */
export interface AdapterPluginMetadata {
  /** Имя плагина */
  name: string;
  
  /** Версия плагина (semver) */
  version: string;
  
  /** Описание плагина */
  description?: string;
  
  /** Автор плагина */
  author?: string;
  
  /** Минимальная версия оркестратора */
  minOrchestratorVersion: string;
  
  /** Максимальная версия оркестратора (опционально) */
  maxOrchestratorVersion?: string;
  
  /** Зависимости от других плагинов */
  dependencies?: Record<string, string>;
  
  /** Теги для категоризации */
  tags?: string[];
}

/**
 * Фабрика для создания экземпляра адаптера
 */
export type AdapterFactory = (config: AdapterConfig) => CLIAdapter;

/**
 * Интерфейс плагина адаптера
 */
export interface AdapterPlugin {
  /** Метаданные плагина */
  metadata: AdapterPluginMetadata;
  
  /** Фабрика для создания адаптера */
  createAdapter: AdapterFactory;
  
  /**
   * Инициализация плагина (опционально)
   * Вызывается при загрузке плагина
   */
  initialize?(): Promise<void>;
  
  /**
   * Очистка ресурсов (опционально)
   * Вызывается при выгрузке плагина
   */
  cleanup?(): Promise<void>;
  
  /**
   * Валидация конфигурации (опционально)
   * @param config - Конфигурация адаптера
   * @returns ValidationResult - Результат валидации
   */
  validateConfig?(config: AdapterConfig): ValidationResult;
}

/**
 * Результат валидации совместимости плагина
 */
export interface PluginCompatibilityResult {
  /** Совместим ли плагин */
  compatible: boolean;
  
  /** Причина несовместимости (если есть) */
  reason?: string;
  
  /** Предупреждения */
  warnings: string[];
  
  /** Проверенная версия оркестратора */
  orchestratorVersion: string;
  
  /** Версия плагина */
  pluginVersion: string;
}

/**
 * Опции загрузки плагина
 */
export interface PluginLoadOptions {
  /** Автоматически регистрировать адаптер */
  autoRegister?: boolean;
  
  /** Пропустить проверку совместимости */
  skipCompatibilityCheck?: boolean;
  
  /** Перезаписать существующий плагин с таким же именем */
  overwrite?: boolean;
  
  /** Валидировать конфигурацию при загрузке */
  validateConfig?: boolean;
}

/**
 * Дополнительные возможности модели (capabilities)
 * Расширяет базовые разрешения на файловую систему
 *
 * @remarks
 * Маппинг на CLI-флаги:
 * - web_search: Claude → WebSearch инструмент, Codex → --search, Gemini → google_web_search
 * - web_fetch: Claude → WebFetch инструмент, Gemini → web_fetch
 * - mcp_tools: Claude → --tools/--allowedTools, Codex → авто через codex mcp, Gemini → settings.json
 * - browser: Claude → --chrome (только Claude)
 */
export interface StepCapabilities {
  /**
   * Разрешить поиск в интернете
   * - Claude: добавляет WebSearch в --tools и --allowedTools
   * - Codex: добавляет флаг --search
   * - Gemini: разрешает инструмент google_web_search
   */
  web_search?: boolean;

  /**
   * Разрешить загрузку веб-страниц по URL
   * - Claude: добавляет WebFetch в --tools и --allowedTools
   * - Gemini: разрешает инструмент web_fetch
   * - Codex: не поддерживается
   */
  web_fetch?: boolean;

  /**
   * Разрешить использование MCP-инструментов
   * - true: разрешить все настроенные MCP-инструменты
   * - string[]: разрешить только указанные инструменты
   *
   * @remarks
   * MCP-серверы должны быть настроены на уровне CLI-утилиты:
   * - Claude: через --mcp-config или глобальную конфигурацию
   * - Codex: через `codex mcp add`
   * - Gemini: через mcpServers в settings.json или `gemini mcp add`
   */
  mcp_tools?: boolean | string[];

  /**
   * Разрешить интеграцию с браузером
   * - Claude: добавляет флаг --chrome
   * - Codex, Gemini: не поддерживается
   */
  browser?: boolean;
}

/**
 * Информация о поддержке capability адаптером
 */
export interface CapabilitySupport {
  /** Поддерживается ли capability данным адаптером */
  supported: boolean;

  /** CLI-флаги для включения capability */
  flags?: string[];

  /** Примечание о поддержке (например, требования к настройке) */
  note?: string;
}

/**
 * Адаптер с поддержкой capabilities
 * Расширяет базовый CLIAdapter методами для работы с capabilities
 */
export interface CapabilityAwareAdapter extends CLIAdapter {
  /**
   * Получить информацию о поддержке capabilities
   * @returns Объект с информацией о поддержке каждой capability
   */
  getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport>;

  /**
   * Преобразовать capabilities в аргументы командной строки
   * @param capabilities - Набор capabilities для преобразования
   * @returns Массив аргументов командной строки
   */
  mapCapabilitiesToArgs(capabilities: StepCapabilities): string[];
}

/**
 * Разрешения для шага workflow
 * Определяет что модель может делать во время выполнения шага
 */
export interface StepPermissions {
  /** Паттерны файлов разрешенных для чтения (glob) */
  read?: string[];

  /** Паттерны файлов разрешенных для записи (glob) */
  write?: string[];

  /** Разрешено ли выполнять shell-команды */
  execute?: boolean;

  /** Режим полного доступа без ограничений (ОПАСНО!) */
  fullAccess?: boolean;

  /**
   * Дополнительные возможности модели
   * @see StepCapabilities
   */
  capabilities?: StepCapabilities;
}

/**
 * Запрос к CLI-адаптеру
 */
export interface AdapterRequest {
  /** Промпт для модели */
  prompt: string;

  /** Модель для использования (опционально) */
  model?: string;

  /** Температура генерации (опционально) */
  temperature?: number;

  /** Максимальное количество токенов (опционально) */
  maxTokens?: number;

  /** Системный промпт (опционально) */
  systemPrompt?: string;

  /** Переменные окружения (опционально) */
  env?: Record<string, string>;

  /** Таймаут в миллисекундах (опционально) */
  timeout?: number;

  /** Путь к выходному файлу для сохранения результата */
  outputFile?: string;

  /** Разрешения для данного запроса */
  permissions?: StepPermissions;

  /**
   * Дополнительные возможности для данного запроса
   * Обычно извлекаются из permissions.capabilities или role.default_capabilities
   * @see StepCapabilities
   */
  capabilities?: StepCapabilities;
}

/**
 * Метаданные ответа адаптера
 */
export interface AdapterResponseMetadata {
  /** Код выхода процесса */
  exitCode?: number;

  /** Вывод в stderr */
  stderr?: string;

  /** Путь к файлу, из которого был прочитан результат */
  outputFile?: string;

  /** Источник результата: файл или stdout */
  resultSource?: 'file' | 'stdout';

  /** Примененный режим sandbox (для Codex) */
  sandboxMode?: string;

  /** Дополнительные данные */
  [key: string]: unknown;
}

/**
 * Ответ от CLI-адаптера
 */
export interface AdapterResponse {
  /** Контент ответа */
  content: string;

  /** Использованная модель */
  model: string;

  /** Количество использованных токенов (опционально) */
  tokensUsed?: number;

  /** Время выполнения в миллисекундах */
  executionTime: number;

  /** Дополнительные метаданные (опционально) */
  metadata?: AdapterResponseMetadata;
}

/**
 * Ошибка адаптера
 */
export interface AdapterError {
  /** Код ошибки */
  code: string;
  
  /** Сообщение об ошибке */
  message: string;
  
  /** Можно ли повторить операцию */
  retryable: boolean;
  
  /** Оригинальная ошибка */
  originalError: Error;
}

// ============================================================================
// Template Engine интерфейсы
// ============================================================================

/**
 * Интерфейс движка шаблонов
 */
export interface TemplateEngine {
  /**
   * Рендеринг шаблона с подстановкой переменных
   * @param template - Текст шаблона
   * @param context - Контекст для подстановки
   * @returns string - Отрендеренный текст
   */
  render(template: string, context: TemplateContext): string;
  
  /**
   * Загрузка шаблона из файла
   * @param path - Путь к файлу шаблона
   * @returns string - Содержимое шаблона
   */
  loadTemplate(path: string): string;
  
  /**
   * Валидация шаблона
   * @param template - Текст шаблона
   * @returns ValidationResult - Результат валидации
   */
  validate(template: string): ValidationResult;
}

/**
 * Контекст шаблона
 */
export interface TemplateContext {
  /** Переменные из состояния */
  variables: Record<string, unknown>;
  
  /**
   * Функция для загрузки артефактов
   * @param path - Путь к артефакту
   * @returns string - Содержимое артефакта
   */
  loadArtifact(path: string): string;
  
  /**
   * Условная функция
   * @param condition - Условие
   * @param thenValue - Значение если true
   * @param elseValue - Значение если false (опционально)
   * @returns string - Результат
   */
  if(condition: boolean, thenValue: string, elseValue?: string): string;
  
  /**
   * Функция для работы со списками
   * @param items - Массив элементов
   * @param template - Шаблон для каждого элемента
   * @returns string - Результат
   */
  forEach(items: unknown[], template: string): string;
}

/**
 * Результат валидации
 */
export interface ValidationResult {
  /** Валиден ли шаблон */
  valid: boolean;
  
  /** Список ошибок */
  errors: ValidationError[];
  
  /** Список предупреждений */
  warnings: ValidationWarning[];
}

/**
 * Ошибка валидации
 */
export interface ValidationError {
  /** Сообщение об ошибке */
  message: string;
  
  /** Номер строки (опционально) */
  line?: number;
  
  /** Номер колонки (опционально) */
  column?: number;
  
  /** Код ошибки */
  code: string;
}

/**
 * Предупреждение валидации
 */
export interface ValidationWarning {
  /** Сообщение предупреждения */
  message: string;
  
  /** Номер строки (опционально) */
  line?: number;
  
  /** Номер колонки (опционально) */
  column?: number;
}

// ============================================================================
// Расширенная обработка ошибок
// ============================================================================

/**
 * Категория ошибки
 */
export type ErrorCategory = 'config' | 'execution' | 'state' | 'user_input';

/**
 * Серьезность ошибки
 */
export type ErrorSeverity = 'fatal' | 'error' | 'warning';

/**
 * Параметры для создания WorkflowError
 */
export interface ErrorParams {
  /** Код ошибки */
  code: string;
  
  /** Категория ошибки */
  category: ErrorCategory;
  
  /** Серьезность ошибки */
  severity: ErrorSeverity;
  
  /** Сообщение об ошибке */
  message: string;
  
  /** Контекст ошибки */
  context: Record<string, unknown>;
  
  /** Можно ли восстановиться */
  recoverable: boolean;
  
  /** Предложения по исправлению */
  suggestions: string[];
}

/**
 * Класс ошибки рабочего процесса
 */
export class WorkflowErrorClass extends Error {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: Record<string, unknown>;
  recoverable: boolean;
  suggestions: string[];
  
  constructor(params: ErrorParams) {
    super(params.message);
    this.name = 'WorkflowError';
    this.code = params.code;
    this.category = params.category;
    this.severity = params.severity;
    this.context = params.context;
    this.recoverable = params.recoverable;
    this.suggestions = params.suggestions;
    
    // Сохраняем правильный stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkflowErrorClass);
    }
  }
}

// ============================================================================
// Execution Context интерфейсы
// ============================================================================

/**
 * Контекст выполнения
 */
export interface ExecutionContext {
  /** Состояние рабочего процесса */
  state: WorkflowState;
  
  /** Реестр адаптеров */
  adapters: AdapterRegistry;
  
  /** Движок шаблонов */
  templateEngine: TemplateEngine;
  
  /** Менеджер артефактов */
  artifactManager: ArtifactManager;
  
  /** Логгер */
  logger: Logger;
  /** Индикатор прогресса (для интерактивного режима, опционально) */
  progress?: unknown;
}

/**
 * Реестр адаптеров
 */
export interface AdapterRegistry {
  /**
   * Регистрация адаптера
   * @param adapter - CLI-адаптер
   */
  register(adapter: CLIAdapter): void;
  
  /**
   * Получение адаптера по имени
   * @param name - Имя адаптера
   * @returns CLIAdapter | undefined
   */
  get(name: string): CLIAdapter | undefined;
  
  /**
   * Проверка наличия адаптера
   * @param name - Имя адаптера
   * @returns boolean
   */
  has(name: string): boolean;
  
  /**
   * Получение всех адаптеров
   * @returns CLIAdapter[]
   */
  getAll(): CLIAdapter[];
  
  /**
   * Создание адаптера из конфигурации
   * @param config - Конфигурация адаптера
   * @returns CLIAdapter
   */
  createFromConfig(config: Partial<AdapterConfig> & { name: string; type?: string; baseUrl?: string; apiKey?: string; defaultModel?: string; headers?: Record<string, string> }): CLIAdapter;
  
  /**
   * Регистрация адаптеров из массива конфигураций
   * @param configs - Массив конфигураций адаптеров
   */
  registerFromConfigs(configs: Array<Partial<AdapterConfig> & { name: string; type?: string; baseUrl?: string; apiKey?: string; defaultModel?: string; headers?: Record<string, string> }>): void;
}

/**
 * Менеджер артефактов
 */
export interface ArtifactManager {
  /**
   * Сохранение артефакта
   * @param sessionId - ID сессии
   * @param stepId - ID шага
   * @param name - Имя артефакта
   * @param content - Содержимое
   * @returns Promise<string> - Путь к сохраненному файлу
   */
  save(sessionId: string, stepId: string, name: string, content: string): Promise<string>;
  
  /**
   * Загрузка артефакта
   * @param path - Путь к артефакту
   * @returns Promise<string> - Содержимое артефакта
   */
  load(path: string): Promise<string>;
  
  /**
   * Проверка существования артефакта
   * @param path - Путь к артефакту
   * @returns Promise<boolean>
   */
  exists(path: string): Promise<boolean>;
  
  /**
   * Получение списка артефактов для сессии
   * @param sessionId - ID сессии
   * @returns Promise<ArtifactInfo[]>
   */
  list(sessionId: string): Promise<ArtifactInfo[]>;
}

/**
 * Информация об артефакте
 */
export interface ArtifactInfo {
  /** Путь к файлу */
  path: string;
  
  /** Имя артефакта */
  name: string;
  
  /** ID шага */
  stepId: string;
  
  /** Размер в байтах */
  size: number;
  
  /** Время создания */
  createdAt: string;
  
  /** Метаданные */
  metadata?: Record<string, unknown>;
}

/**
 * Интерфейс логгера
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ============================================================================
// Step Executor интерфейсы
// ============================================================================

/**
 * Исполнитель шагов
 */
export interface StepExecutor {
  /**
   * Выполнение одного шага
   * @param step - Шаг для выполнения
   * @param context - Контекст выполнения
   * @returns Promise<StepResult>
   */
  executeStep(step: WorkflowStep, context: ExecutionContext): Promise<StepResult>;
  
  /**
   * Параллельное выполнение шагов
   * @param steps - Массив шагов
   * @param context - Контекст выполнения
   * @returns Promise<StepResult[]>
   */
  executeParallel(steps: WorkflowStep[], context: ExecutionContext): Promise<StepResult[]>;
  
  /**
   * Выполнение с повторами
   * @param step - Шаг для выполнения
   * @param context - Контекст выполнения
   * @param maxRetries - Максимальное количество повторов
   * @returns Promise<StepResult>
   */
  executeWithRetry(
    step: WorkflowStep,
    context: ExecutionContext,
    maxRetries: number
  ): Promise<StepResult>;
}

/**
 * Результат выполнения шага
 */
export interface StepResult {
  /** ID шага */
  stepId: string;
  
  /** Статус выполнения */
  status: StepStatus;
  
  /** Выходные данные */
  outputs: Record<string, unknown>;
  
  /** Пути к артефактам */
  artifacts: string[];
  
  /** Время выполнения в миллисекундах */
  executionTime: number;
  
  /** Ошибка (если есть) */
  error?: Error;
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Конфигурация повторов
 */
export interface RetryConfig {
  /** Максимальное количество повторов */
  maxRetries: number;
  
  /** Стратегия задержки */
  backoffStrategy: 'fixed' | 'exponential' | 'linear';
  
  /** Начальная задержка в миллисекундах */
  initialDelay: number;
  
  /** Максимальная задержка в миллисекундах */
  maxDelay: number;
  
  /** Коды ошибок, для которых можно повторить */
  retryableErrors: string[];
}
