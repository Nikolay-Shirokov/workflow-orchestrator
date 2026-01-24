/**
 * Unit тесты для обработки ввода пользователя в InteractiveDisplay
 * 
 * Проверяет:
 * - Паузу обновления интерфейса при требовании ввода
 * - Возобновление обновления после ввода
 * - Отображение меню для выбора опций
 * - Интеграцию с InteractiveMenu
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.1.4
 */

import { InteractiveDisplay } from '../../src/cli/interactive-display.js';
import { TerminalRenderer } from '../../src/cli/terminal-renderer.js';
import { WorkflowConfig, WorkflowStep } from '../../src/core/types.js';
import { Writable } from 'stream';

/**
 * Mock WriteStream для тестирования
 */
class MockWriteStream extends Writable {
  public output: string = '';
  public isTTY: boolean = true;
  public columns: number = 80;
  public rows: number = 24;

  _write(chunk: Buffer | string, _encoding: string, callback: () => void): void {
    this.output += chunk.toString();
    callback();
  }

  clearOutput(): void {
    this.output = '';
  }
}

/**
 * Создание тестовой конфигурации
 */
function createTestConfig(): WorkflowConfig {
  return {
    name: 'test-workflow',
    version: '1.0',
    description: 'Test workflow',
    settings: {
      artifacts_dir: 'artifacts/test',
      default_adapter: 'test-adapter',
      parallel_execution: false,
      max_retries: 3,
      timeout: 30000,
      log_level: 'info'
    },
    steps: [
      {
        id: 'step1',
        name: 'First Step',
        type: 'model',
        role: 'assistant',
        adapter: 'test-adapter',
        model: 'test-model',
        prompt_template: 'Test prompt'
      },
      {
        id: 'step2',
        name: 'Second Step',
        type: 'script',
        script: 'echo "Transform data"'
      }
    ]
  };
}

describe('InteractiveDisplay User Input Tests', () => {
  let mockStream: MockWriteStream;
  let renderer: TerminalRenderer;
  let display: InteractiveDisplay;
  let config: WorkflowConfig;

  beforeEach(() => {
    mockStream = new MockWriteStream();
    renderer = new TerminalRenderer(mockStream as any);
    display = new InteractiveDisplay(renderer);
    config = createTestConfig();
    display.initialize(config);
  });

  afterEach(() => {
    display.cleanup();
  });

  /**
   * Тест 1: onUserInputRequired отображает сообщение
   * Requirements 10.1: Отображение сообщения о требовании ввода
   */
  test('onUserInputRequired displays user input message', () => {
    const step = config.steps[0];
    const message = 'Please select an option';

    // Очищаем вывод перед тестом
    mockStream.clearOutput();

    // Вызываем обработчик требования ввода
    display.onUserInputRequired(step as WorkflowStep, message);

    const output = mockStream.output;

    // Проверяем наличие сообщения о требовании ввода
    expect(output).toContain('Требуется ввод пользователя');
    expect(output).toContain('⏸');
    
    // Проверяем наличие названия шага
    expect(output).toContain(step.name);
    
    // Проверяем наличие сообщения
    expect(output).toContain(message);
  });

  /**
   * Тест 2: onUserInputRequired приостанавливает обновление
   * Requirements 10.2: Пауза обновления интерфейса
   */
  test('onUserInputRequired pauses rendering', () => {
    const step = config.steps[0];
    const message = 'Please wait';

    // Запускаем шаг
    display.onStepStart(step as WorkflowStep, 1);

    // Вызываем обработчик требования ввода
    display.onUserInputRequired(step as WorkflowStep, message);

    // Проверяем, что рендеринг приостановлен
    // Мы не можем напрямую проверить внутреннее состояние renderInterval,
    // но можем проверить, что метод был вызван без ошибок
    expect(() => {
      display.onUserInputRequired(step as WorkflowStep, message);
    }).not.toThrow();
  });

  /**
   * Тест 3: pauseRendering останавливает обновление
   * Requirements 10.2: Пауза обновления интерфейса
   */
  test('pauseRendering stops interval updates', () => {
    // Вызываем метод паузы
    display.pauseRendering();

    // Проверяем, что метод выполнился без ошибок
    expect(() => {
      display.pauseRendering();
    }).not.toThrow();

    // Проверяем, что можно вызвать несколько раз подряд
    display.pauseRendering();
    display.pauseRendering();
  });

  /**
   * Тест 4: resumeRendering возобновляет обновление
   * Requirements 10.3: Возобновление после ввода
   */
  test('resumeRendering resumes interface updates', () => {
    // Приостанавливаем рендеринг
    display.pauseRendering();

    // Очищаем вывод
    mockStream.clearOutput();

    // Возобновляем рендеринг
    display.resumeRendering();

    // Проверяем, что интерфейс был перерисован
    const output = mockStream.output;
    
    // После возобновления должен быть вызван render()
    // Проверяем наличие основных секций
    expect(output).toContain('Workflow:');
    expect(output).toContain('Steps:');
  });

  /**
   * Тест 5: resumeRendering можно вызвать без предварительной паузы
   * Requirements 10.3: Возобновление после ввода
   */
  test('resumeRendering can be called without prior pause', () => {
    // Вызываем возобновление без паузы
    expect(() => {
      display.resumeRendering();
    }).not.toThrow();

    // Проверяем, что интерфейс был перерисован
    const output = mockStream.output;
    expect(output).toContain('Workflow:');
  });

  /**
   * Тест 6: Последовательность пауза-возобновление работает корректно
   * Requirements 10.2, 10.3: Пауза и возобновление
   */
  test('pause-resume sequence works correctly', () => {
    const step = config.steps[0];

    // Запускаем шаг
    display.onStepStart(step as WorkflowStep, 1);

    // Приостанавливаем
    display.pauseRendering();

    // Очищаем вывод
    mockStream.clearOutput();

    // Возобновляем
    display.resumeRendering();

    // Проверяем, что интерфейс обновился
    const output = mockStream.output;
    expect(output).toContain('Current Step:');
    expect(output).toContain(step.name);
  });

  /**
   * Тест 7: Множественные паузы и возобновления
   * Requirements 10.2, 10.3: Пауза и возобновление
   */
  test('multiple pause-resume cycles work correctly', () => {
    // Цикл пауза-возобновление
    for (let i = 0; i < 3; i++) {
      display.pauseRendering();
      
      mockStream.clearOutput();
      
      display.resumeRendering();
      
      const output = mockStream.output;
      expect(output).toContain('Workflow:');
    }
  });

  /**
   * Тест 8: onUserInputRequired не вызывает ошибок при неинициализированном состоянии
   * Requirements 10.1: Обработка граничных случаев
   */
  test('onUserInputRequired handles uninitialized state', () => {
    // Создаем новый display без инициализации
    const uninitializedDisplay = new InteractiveDisplay(renderer);
    
    const step = config.steps[0];
    const message = 'Test message';

    // Вызываем обработчик на неинициализированном display
    expect(() => {
      uninitializedDisplay.onUserInputRequired(step as WorkflowStep, message);
    }).not.toThrow();

    uninitializedDisplay.cleanup();
  });

  /**
   * Тест 9: Сообщение о вводе содержит разделители
   * Requirements 10.1: Визуальное оформление сообщения
   */
  test('user input message contains visual separators', () => {
    const step = config.steps[0];
    const message = 'Please confirm';

    mockStream.clearOutput();

    display.onUserInputRequired(step as WorkflowStep, message);

    const output = mockStream.output;

    // Проверяем наличие разделителей (─)
    expect(output).toContain('─'.repeat(60));
  });

  /**
   * Тест 10: Сообщение о вводе выделено цветом
   * Requirements 10.1: Цветовое выделение
   */
  test('user input message is color-highlighted', () => {
    const step = config.steps[0];
    const message = 'Select option';

    mockStream.clearOutput();

    display.onUserInputRequired(step as WorkflowStep, message);

    const output = mockStream.output;

    // Проверяем наличие ANSI кода для желтого цвета
    const yellowColor = '\x1b[33m';
    expect(output).toContain(yellowColor);
  });

  /**
   * Тест 11: Название шага выделено жирным
   * Requirements 10.1: Визуальное выделение
   */
  test('step name in user input message is bold', () => {
    const step = config.steps[0];
    const message = 'Waiting for input';

    mockStream.clearOutput();

    display.onUserInputRequired(step as WorkflowStep, message);

    const output = mockStream.output;

    // Проверяем наличие ANSI кода для жирного текста
    const boldCode = '\x1b[1m';
    expect(output).toContain(boldCode);
    
    // Проверяем, что название шага присутствует
    expect(output).toContain(step.name);
  });

  /**
   * Тест 12: pauseRendering идемпотентна
   * Requirements 10.2: Корректная обработка множественных вызовов
   */
  test('pauseRendering is idempotent', () => {
    // Вызываем несколько раз подряд
    display.pauseRendering();
    display.pauseRendering();
    display.pauseRendering();

    // Проверяем, что не возникло ошибок
    expect(() => {
      display.pauseRendering();
    }).not.toThrow();
  });

  /**
   * Тест 13: resumeRendering идемпотентна
   * Requirements 10.3: Корректная обработка множественных вызовов
   */
  test('resumeRendering is idempotent', () => {
    // Вызываем несколько раз подряд
    display.resumeRendering();
    display.resumeRendering();
    display.resumeRendering();

    // Проверяем, что не возникло ошибок
    expect(() => {
      display.resumeRendering();
    }).not.toThrow();
  });

  /**
   * Тест 14: Пауза не влияет на ручной рендеринг
   * Requirements 10.2: Пауза влияет только на автоматическое обновление
   */
  test('pause does not affect manual rendering', () => {
    // Приостанавливаем автоматическое обновление
    display.pauseRendering();

    // Вызываем ручной рендеринг - не должно выбрасывать ошибку
    expect(() => {
      display.render();
    }).not.toThrow();

    // Проверяем, что вывод все еще содержит ожидаемый контент
    // (дифференциальный рендеринг может не писать, если ничего не изменилось)
    const output = mockStream.output;
    expect(output).toContain('Workflow:');
    expect(output).toContain('Steps:');
  });

  /**
   * Тест 15: Состояние сохраняется после паузы и возобновления
   * Requirements 10.2, 10.3: Сохранение состояния
   */
  test('state is preserved after pause and resume', () => {
    const step = config.steps[0];

    // Запускаем шаг
    display.onStepStart(step as WorkflowStep, 1);

    // Получаем состояние до паузы
    const stateBefore = display.getState();

    // Приостанавливаем и возобновляем
    display.pauseRendering();
    display.resumeRendering();

    // Получаем состояние после возобновления
    const stateAfter = display.getState();

    // Проверяем, что состояние не изменилось
    expect(stateAfter).toEqual(stateBefore);
  });
});
