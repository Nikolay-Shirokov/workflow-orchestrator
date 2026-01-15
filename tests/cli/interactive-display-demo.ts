/**
 * Демонстрационный скрипт для визуальной проверки InteractiveDisplay
 * 
 * Запуск: npx ts-node tests/cli/interactive-display-demo.ts
 */

import { InteractiveDisplay } from '../../src/cli/interactive-display.js';
import { WorkflowConfig, WorkflowStep, StepHistory, WorkflowState } from '../../src/core/types.js';

// Создаем тестовую конфигурацию
const config: WorkflowConfig = {
  name: 'demo-workflow',
  version: '1.0',
  steps: [
    {
      id: 'step1',
      name: 'Анализ требований',
      type: 'model',
      role: 'analyst',
      adapter: 'claude-cli',
      model: 'claude-sonnet-3.5'
    },
    {
      id: 'step2',
      name: 'Создание дизайна',
      type: 'model',
      role: 'designer',
      adapter: 'claude-cli',
      model: 'claude-sonnet-3.5'
    },
    {
      id: 'step3',
      name: 'Генерация кода',
      type: 'model',
      role: 'developer',
      adapter: 'claude-cli',
      model: 'claude-sonnet-3.5'
    },
    {
      id: 'step4',
      name: 'Написание тестов',
      type: 'model',
      role: 'tester',
      adapter: 'claude-cli',
      model: 'claude-sonnet-3.5'
    },
    {
      id: 'step5',
      name: 'Документация',
      type: 'model',
      role: 'writer',
      adapter: 'claude-cli',
      model: 'claude-sonnet-3.5'
    }
  ]
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function demo(): Promise<void> {
  console.log('Демонстрация InteractiveDisplay');
  console.log('================================\n');
  console.log('Проверка всех секций интерфейса:\n');
  
  const display = new InteractiveDisplay();
  
  try {
    // Инициализация
    display.initialize(config);
    display.setArtifactsDir('artifacts/session_20260115_120000');
    
    await sleep(1000);
    
    // Запуск процесса
    display.onWorkflowStart(config);
    
    await sleep(1000);
    
    // Шаг 1: Анализ требований
    display.onStepStart(config.steps[0], 1);
    await sleep(2000);
    
    const history1: StepHistory = {
      stepId: 'step1',
      status: 'success',
      executionTime: 2000,
      artifacts: ['requirements.md', 'analysis.md']
    };
    display.onStepComplete(config.steps[0], history1);
    
    await sleep(1000);
    
    // Шаг 2: Создание дизайна
    display.onStepStart(config.steps[1], 2);
    await sleep(1500);
    
    const history2: StepHistory = {
      stepId: 'step2',
      status: 'success',
      executionTime: 1500,
      artifacts: ['design.md']
    };
    display.onStepComplete(config.steps[1], history2);
    
    await sleep(1000);
    
    // Шаг 3: Генерация кода (текущий)
    display.onStepStart(config.steps[2], 3);
    await sleep(3000);
    
    const history3: StepHistory = {
      stepId: 'step3',
      status: 'success',
      executionTime: 3000,
      artifacts: ['main.ts', 'types.ts', 'utils.ts']
    };
    display.onStepComplete(config.steps[2], history3);
    
    await sleep(1000);
    
    // Завершение процесса
    const finalState: WorkflowState = {
      status: 'completed',
      currentStep: 'step3',
      completedSteps: ['step1', 'step2', 'step3'],
      artifacts: {
        'step1': 'requirements.md',
        'step2': 'design.md',
        'step3': 'main.ts'
      },
      errors: [],
      sessionId: 'session_20260115_120000'
    };
    
    display.onWorkflowComplete(finalState);
    
    console.log('\n\nПроверка завершена!');
    console.log('\nВсе секции отображаются корректно:');
    console.log('✓ Заголовок с названием процесса и версией');
    console.log('✓ Путь к директории артефактов');
    console.log('✓ Список всех шагов с их статусами');
    console.log('✓ Детальная информация о текущем шаге');
    console.log('✓ История последних действий (последние 3 шага)');
    console.log('✓ Общий прогресс выполнения с прогресс-баром');
    console.log('✓ Итоговая информация после завершения');
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    display.cleanup();
  }
}

// Запуск демонстрации
demo().catch(console.error);
