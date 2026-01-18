/**
 * Отображение прогресса выполнения рабочего процесса
 * 
 * Предоставляет визуальную индикацию прогресса с цветным выводом
 */

import { WorkflowConfig, WorkflowState, WorkflowStep, StepHistory, Logger } from '../core/types.js';
import { IProgressDisplay } from './display-types.js';

/**
 * Класс для отображения прогресса
 * Реализует интерфейс IProgressDisplay для совместимости с оркестратором
 */
export class ProgressDisplay implements IProgressDisplay {
  private logger: Logger;
  private startTime: number = 0;
  private currentStepStartTime: number = 0;
  private totalSteps: number = 0;
  private completedSteps: number = 0;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Обработчик начала процесса
   */
  onWorkflowStart(config: WorkflowConfig): void {
    this.startTime = Date.now();
    this.totalSteps = config.steps.length;
    this.completedSteps = 0;

    this.logger.info(`\n${'='.repeat(60)}`);
    this.logger.info(`Запуск процесса: ${config.name} v${config.version}`);
    if (config.description) {
      this.logger.info(`Описание: ${config.description}`);
    }
    this.logger.info(`Всего шагов: ${this.totalSteps}`);
    this.logger.info(`${'='.repeat(60)}\n`);
  }

  /**
   * Обработчик начала шага
   */
  onStepStart(step: WorkflowStep, stepNumber: number): void {
    this.currentStepStartTime = Date.now();

    this.logger.info(`\n[${ stepNumber}/${this.totalSteps}] Начало шага: ${step.name}`);
    this.logger.info(`  ID: ${step.id}`);
    this.logger.info(`  Тип: ${step.type}`);
    
    if (step.role) {
      this.logger.info(`  Роль: ${step.role}`);
    }
    
    if (step.adapter) {
      this.logger.info(`  Адаптер: ${step.adapter}`);
    }

    if (step.depends_on && step.depends_on.length > 0) {
      this.logger.info(`  Зависит от: ${step.depends_on.join(', ')}`);
    }

    // Индикатор прогресса
    const progress = ((stepNumber - 1) / this.totalSteps) * 100;
    const progressBar = this.createProgressBar(progress, 40);
    this.logger.info(`  Прогресс: ${progressBar} ${progress.toFixed(1)}%`);
  }

  /**
   * Обработчик завершения шага
   */
  onStepComplete(_step: WorkflowStep, history: StepHistory): void {
    this.completedSteps++;
    const executionTime = Date.now() - this.currentStepStartTime;

    if (history.status === 'success') {
      this.logger.info(`  ✓ Шаг завершен успешно (${executionTime}ms)`);
    } else if (history.status === 'failed') {
      this.logger.error(`  ✗ Шаг завершился с ошибкой (${executionTime}ms)`);
      if (history.error) {
        this.logger.error(`  Ошибка: ${history.error}`);
      }
    } else if (history.status === 'skipped') {
      this.logger.warn(`  ○ Шаг пропущен`);
    }

    if (history.artifacts.length > 0) {
      this.logger.info(`  Создано артефактов: ${history.artifacts.length}`);
      for (const artifact of history.artifacts) {
        this.logger.debug(`    - ${artifact}`);
      }
    }

    // Обновленный индикатор прогресса
    const progress = (this.completedSteps / this.totalSteps) * 100;
    const progressBar = this.createProgressBar(progress, 40);
    this.logger.info(`  Прогресс: ${progressBar} ${progress.toFixed(1)}%`);
  }

  /**
   * Обработчик ошибки шага
   */
  onStepError(step: WorkflowStep, error: Error): void {
    this.logger.error(`\n✗ Ошибка выполнения шага: ${step.name}`);
    this.logger.error(`  ${error.message}`);
    
    if (error.stack) {
      this.logger.debug(`  Stack trace:\n${error.stack}`);
    }
  }

  /**
   * Обработчик завершения процесса
   */
  onWorkflowComplete(state: WorkflowState): void {
    const totalTime = Date.now() - this.startTime;
    const minutes = Math.floor(totalTime / 60000);
    const seconds = ((totalTime % 60000) / 1000).toFixed(1);

    this.logger.info(`\n${'='.repeat(60)}`);
    
    if (state.status === 'completed') {
      this.logger.info(`✓ Процесс завершен успешно`);
    } else if (state.status === 'failed') {
      this.logger.error(`✗ Процесс завершился с ошибкой`);
    } else {
      this.logger.warn(`○ Процесс остановлен (статус: ${state.status})`);
    }

    this.logger.info(`Время выполнения: ${minutes}m ${seconds}s`);
    this.logger.info(`Завершено шагов: ${state.completedSteps.length}/${this.totalSteps}`);
    this.logger.info(`Создано артефактов: ${Object.keys(state.artifacts).length}`);
    
    if (state.errors.length > 0) {
      this.logger.info(`Ошибок: ${state.errors.length}`);
    }

    this.logger.info(`Сессия: ${state.sessionId}`);
    this.logger.info(`${'='.repeat(60)}\n`);
  }

  /**
   * Отображение сообщения о паузе для ввода пользователя
   */
  onUserInputRequired(step: WorkflowStep, message: string): void {
    this.logger.info(`\n⏸ Требуется ввод пользователя`);
    this.logger.info(`  Шаг: ${step.name}`);
    this.logger.info(`  ${message}`);
  }

  /**
   * Отображение параллельного выполнения
   */
  onParallelStart(steps: WorkflowStep[]): void {
    this.logger.info(`\n⚡ Параллельное выполнение ${steps.length} шагов:`);
    for (const step of steps) {
      this.logger.info(`  - ${step.name} (${step.id})`);
    }
  }

  /**
   * Отображение завершения параллельного выполнения
   */
  onParallelComplete(results: Array<{ stepId: string; status: string }>): void {
    this.logger.info(`\n⚡ Параллельное выполнение завершено:`);
    for (const result of results) {
      const emoji = result.status === 'success' ? '✓' : result.status === 'failed' ? '✗' : '○';
      this.logger.info(`  ${emoji} ${result.stepId}: ${result.status}`);
    }
  }

  /**
   * Финализация отображения - пустая реализация для логового режима
   */
  finalize(): void {
    // Не требуется для логового режима
  }

  /**
   * Создание индикатора прогресса
   */
  private createProgressBar(progress: number, width: number): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }
}
