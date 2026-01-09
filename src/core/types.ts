/**
 * Базовые типы и интерфейсы для Workflow Orchestrator
 */

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
}

/**
 * Конфигурация роли
 */
export interface RoleConfig {
  adapter: string;
  model?: string;
  role_definition?: string;
  custom_instructions?: string;
  permissions?: string[];
  temperature?: number;
  max_tokens?: number;
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
  
  // Для type: 'parallel'
  steps?: WorkflowStep[];
  
  // Для type: 'user_input'
  input_format?: string;
  prompt_message?: string;
  validation?: ValidationRule[];
  
  // Входы и выходы
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  
  // Настройки выполнения
  timeout?: number;
  retries?: number;
  continue_on_error?: boolean;
}

/**
 * Тип шага
 */
export type StepType = 'model' | 'script' | 'conditional' | 'parallel' | 'user_input';

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
