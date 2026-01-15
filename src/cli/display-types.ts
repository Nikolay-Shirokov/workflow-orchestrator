/**
 * Типы для интерактивного отображения CLI
 * 
 * Содержит интерфейсы для состояния отображения и конфигурации
 */

import { TerminalColor } from './terminal-renderer.js';

/**
 * Статус шага для отображения
 */
export type DisplayStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Информация о шаге для отображения
 */
export interface StepDisplayInfo {
  /** Номер шага */
  number: number;
  
  /** ID шага */
  id: string;
  
  /** Название шага */
  name: string;
  
  /** Тип шага */
  type?: string;
  
  /** Статус выполнения */
  status: DisplayStepStatus;
  
  /** Длительность выполнения в миллисекундах */
  duration?: number;
  
  /** Список созданных артефактов */
  artifacts?: string[];
  
  /** Сообщение об ошибке */
  error?: string;
  
  /** Используемая роль */
  role?: string;
  
  /** Используемый адаптер */
  adapter?: string;
  
  /** Используемая модель */
  model?: string;
}

/**
 * Информация о последнем действии
 */
export interface RecentActivityItem {
  /** Название шага */
  stepName: string;
  
  /** Статус выполнения */
  status: 'success' | 'failed';
  
  /** Длительность в миллисекундах */
  duration: number;
  
  /** Список артефактов */
  artifacts: string[];
}

/**
 * Информация о параллельном выполнении
 */
export interface ParallelStepInfo {
  /** ID шага */
  stepId: string;
  
  /** Название шага */
  stepName: string;
  
  /** Статус выполнения */
  status: string;
}

/**
 * Состояние отображения для интерактивного режима
 */
export interface DisplayState {
  /** Название рабочего процесса */
  workflowName: string;
  
  /** Версия рабочего процесса */
  workflowVersion: string;
  
  /** Директория артефактов */
  artifactsDir: string;
  
  /** Список всех шагов */
  steps: StepDisplayInfo[];
  
  /** Индекс текущего шага */
  currentStepIndex: number;
  
  /** История последних действий */
  recentActivity: RecentActivityItem[];
  
  /** Общее количество шагов */
  totalSteps: number;
  
  /** Количество завершенных шагов */
  completedSteps: number;
  
  /** Время начала выполнения (timestamp) */
  startTime: number;
  
  /** Параллельно выполняемые шаги */
  parallelSteps?: ParallelStepInfo[];
}

/**
 * Секция отображения
 */
export interface DisplaySection {
  /** Заголовок секции */
  title: string;
  
  /** Содержимое секции (массив строк) */
  content: string[];
  
  /** Цвет секции */
  color?: TerminalColor;
}

/**
 * Настройки интерактивного режима
 */
export interface InteractiveModeSettings {
  /** Интервал обновления в миллисекундах */
  refreshInterval: number;
  
  /** Максимальное количество последних действий */
  maxRecentActivity: number;
  
  /** Показывать ли прогресс-бар */
  showProgressBar: boolean;
  
  /** Показывать ли время выполнения */
  showElapsedTime: boolean;
}

/**
 * Настройки терминала
 */
export interface TerminalSettings {
  /** Минимальная ширина терминала */
  minWidth: number;
  
  /** Использовать ли цвета */
  useColors: boolean;
  
  /** Использовать ли рамки */
  useBorders: boolean;
}

/**
 * Конфигурация отображения
 */
export interface DisplayConfig {
  /** Режим отображения */
  mode: 'interactive' | 'log';
  
  /** Настройки интерактивного режима */
  interactive?: InteractiveModeSettings;
  
  /** Настройки терминала */
  terminal?: TerminalSettings;
}

/**
 * Утилиты для работы с состоянием отображения
 */
export class DisplayStateUtils {
  /**
   * Вычисление процента прогресса
   * Property 9: Корректность вычисления прогресса
   * 
   * @param completedSteps - Количество завершенных шагов
   * @param totalSteps - Общее количество шагов
   * @returns Процент выполнения (0-100)
   */
  static calculateProgress(completedSteps: number, totalSteps: number): number {
    if (totalSteps === 0) {
      return 0;
    }
    return (completedSteps / totalSteps) * 100;
  }

  /**
   * Создание прогресс-бара
   * Property 10: Формат прогресс-бара
   * 
   * @param progress - Процент прогресса (0-100)
   * @param width - Ширина прогресс-бара в символах
   * @returns Строка с прогресс-баром
   */
  static createProgressBar(progress: number, width: number): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }

  /**
   * Форматирование времени выполнения
   * 
   * @param milliseconds - Время в миллисекундах
   * @returns Отформатированная строка (например, "1m 23.5s")
   */
  static formatExecutionTime(milliseconds: number): string {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = ((milliseconds % 60000) / 1000).toFixed(1);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Обновление состояния при начале шага
   * 
   * @param state - Текущее состояние
   * @param stepIndex - Индекс начинаемого шага
   * @returns Обновленное состояние
   */
  static updateStateOnStepStart(state: DisplayState, stepIndex: number): DisplayState {
    const updatedSteps = [...state.steps];
    if (stepIndex >= 0 && stepIndex < updatedSteps.length) {
      updatedSteps[stepIndex] = {
        ...updatedSteps[stepIndex],
        status: 'running'
      };
    }

    return {
      ...state,
      steps: updatedSteps,
      currentStepIndex: stepIndex
    };
  }

  /**
   * Обновление состояния при завершении шага
   * Property 6: Обновление статуса шага
   * 
   * @param state - Текущее состояние
   * @param stepIndex - Индекс завершенного шага
   * @param status - Статус завершения
   * @param duration - Длительность выполнения
   * @param artifacts - Список артефактов
   * @param error - Сообщение об ошибке (если есть)
   * @returns Обновленное состояние
   */
  static updateStateOnStepComplete(
    state: DisplayState,
    stepIndex: number,
    status: 'completed' | 'failed' | 'skipped',
    duration: number,
    artifacts: string[] = [],
    error?: string
  ): DisplayState {
    const updatedSteps = [...state.steps];
    if (stepIndex >= 0 && stepIndex < updatedSteps.length) {
      updatedSteps[stepIndex] = {
        ...updatedSteps[stepIndex],
        status,
        duration,
        artifacts,
        error
      };
    }

    // Обновление истории последних действий
    const newActivity: RecentActivityItem = {
      stepName: updatedSteps[stepIndex].name,
      status: status === 'completed' ? 'success' : 'failed',
      duration,
      artifacts
    };

    // Ограничение размера истории (Property 8)
    const maxRecentActivity = 3;
    const updatedActivity = [newActivity, ...state.recentActivity].slice(0, maxRecentActivity);

    // Подсчет завершенных шагов
    const completedSteps = updatedSteps.filter(
      step => step.status === 'completed' || step.status === 'failed' || step.status === 'skipped'
    ).length;

    return {
      ...state,
      steps: updatedSteps,
      recentActivity: updatedActivity,
      completedSteps
    };
  }

  /**
   * Создание начального состояния отображения
   * 
   * @param workflowName - Название процесса
   * @param workflowVersion - Версия процесса
   * @param artifactsDir - Директория артефактов
   * @param steps - Список шагов
   * @returns Начальное состояние
   */
  static createInitialState(
    workflowName: string,
    workflowVersion: string,
    artifactsDir: string,
    steps: Array<{ id: string; name: string; type?: string; role?: string; adapter?: string; model?: string }>
  ): DisplayState {
    return {
      workflowName,
      workflowVersion,
      artifactsDir,
      steps: steps.map((step, index) => ({
        number: index + 1,
        id: step.id,
        name: step.name,
        type: step.type,
        status: 'pending',
        role: step.role,
        adapter: step.adapter,
        model: step.model
      })),
      currentStepIndex: -1,
      recentActivity: [],
      totalSteps: steps.length,
      completedSteps: 0,
      startTime: Date.now()
    };
  }

  /**
   * Создание конфигурации по умолчанию
   * 
   * @param mode - Режим отображения
   * @returns Конфигурация по умолчанию
   */
  static createDefaultConfig(mode: 'interactive' | 'log' = 'interactive'): DisplayConfig {
    return {
      mode,
      interactive: {
        refreshInterval: 100,
        maxRecentActivity: 3,
        showProgressBar: true,
        showElapsedTime: true
      },
      terminal: {
        minWidth: 60,
        useColors: true,
        useBorders: true
      }
    };
  }
}
