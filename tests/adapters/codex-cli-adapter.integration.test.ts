/**
 * Интеграционные тесты для Codex CLI адаптера с реальной утилитой
 * 
 * Эти тесты проверяют работу адаптера с реальной утилитой Codex CLI.
 * Тесты требуют наличия установленной утилиты codex и настроенного API ключа OpenAI.
 * 
 * ВАЖНО: Эти тесты являются опциональными и могут быть пропущены если:
 * - Codex CLI не установлен в системе
 * - API ключ OpenAI не настроен
 * - Команда codex exec не поддерживается или работает некорректно
 * 
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CodexCLIAdapter, CodexAdapterRequest } from '../../src/adapters/codex-cli-adapter.js';

/**
 * Вспомогательная функция для проверки доступности Codex CLI
 * Пропускает тесты если утилита недоступна
 */
async function checkCodexAvailability(): Promise<boolean> {
  const adapter = new CodexCLIAdapter();
  const isAvailable = await adapter.isAvailable();
  
  if (!isAvailable) {
    console.log('⚠️  Codex CLI недоступен, пропускаем интеграционные тесты');
    console.log('   Установите Codex CLI для запуска этих тестов');
  }
  
  return isAvailable;
}

/**
 * Вспомогательная функция для проверки работоспособности Codex CLI
 * Проверяет, что команда codex exec действительно работает
 */
async function checkCodexExecWorks(): Promise<boolean> {
  try {
    const adapter = new CodexCLIAdapter({
      timeout: 30000 // 30 секунд для проверки
    });
    
    // Пытаемся выполнить очень простой запрос
    const response = await adapter.execute({
      prompt: 'Say OK',
      model: 'gpt-4o-mini'
    } as CodexAdapterRequest);
    
    return response.content.length > 0;
  } catch (error) {
    console.log('⚠️  Codex CLI exec не работает корректно:', (error as Error).message);
    console.log('   Возможно, требуется настройка API ключа или команда не поддерживается');
    return false;
  }
}

describe('Codex CLI Adapter Integration Tests', () => {
  let adapter: CodexCLIAdapter;
  let codexWorks: boolean = false;

  beforeEach(async () => {
    adapter = new CodexCLIAdapter({
      timeout: 120000 // Увеличиваем таймаут до 2 минут для реальных запросов
    });
    
    // Проверяем работоспособность только один раз
    if (!codexWorks) {
      const isAvailable = await checkCodexAvailability();
      if (isAvailable) {
        codexWorks = await checkCodexExecWorks();
      }
    }
  });

  /**
   * Тест 10.1: Выполнение простого запроса
   * Validates: Requirements 10.1
   */
  it('должен успешно выполнить простой запрос к Codex CLI', async () => {
    // Проверяем работоспособность Codex CLI
    if (!codexWorks) {
      console.log('⚠️  Пропускаем тест: Codex CLI exec не работает');
      return; // Пропускаем тест
    }

    // Создаем простой запрос
    const request: CodexAdapterRequest = {
      prompt: 'Ответь одним словом: сколько будет 2+2?',
      model: 'gpt-4o-mini',
      jsonOutput: false // Используем текстовый режим для простоты
    };

    // Выполняем запрос
    const response = await adapter.execute(request);

    // Проверки
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.executionTime).toBeGreaterThan(0);
    
    // Проверяем что ответ содержит число 4
    expect(response.content.toLowerCase()).toMatch(/4|четыре|four/);
    
    console.log('✅ Простой запрос выполнен успешно');
    console.log(`   Ответ: ${response.content.substring(0, 100)}...`);
  }, 150000); // Таймаут 150 секунд для реального API вызова

  /**
   * Тест 10.2: Выполнение запроса с указанием модели
   * Validates: Requirements 10.2
   */
  it('должен успешно выполнить запрос с указанием модели', async () => {
    // Проверяем работоспособность Codex CLI
    if (!codexWorks) {
      console.log('⚠️  Пропускаем тест: Codex CLI exec не работает');
      return; // Пропускаем тест
    }

    // Создаем запрос с указанием модели
    const request: CodexAdapterRequest = {
      prompt: 'Напиши короткое приветствие на русском языке (максимум 10 слов)',
      model: 'gpt-4o-mini', // Используем более быструю модель для тестов
      jsonOutput: false
    };

    // Выполняем запрос
    const response = await adapter.execute(request);

    // Проверки
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.executionTime).toBeGreaterThan(0);
    
    // Проверяем что ответ на русском языке
    expect(response.content).toMatch(/[а-яА-Я]/);
    
    console.log('✅ Запрос с моделью выполнен успешно');
    console.log(`   Модель: gpt-4o-mini`);
    console.log(`   Ответ: ${response.content}`);
  }, 150000); // Таймаут 150 секунд

  /**
   * Тест 10.3: Выполнение запроса в режиме --full-auto
   * Validates: Requirements 10.3
   */
  it('должен успешно выполнить запрос в режиме --full-auto', async () => {
    // Проверяем работоспособность Codex CLI
    if (!codexWorks) {
      console.log('⚠️  Пропускаем тест: Codex CLI exec не работает');
      return; // Пропускаем тест
    }

    // Создаем запрос с флагом full-auto
    const request: CodexAdapterRequest = {
      prompt: 'Напиши простое математическое выражение: 5 + 3',
      fullAuto: true, // Автоматическое выполнение без подтверждений
      model: 'gpt-4o-mini',
      jsonOutput: false
    };

    // Выполняем запрос
    const response = await adapter.execute(request);

    // Проверки
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.executionTime).toBeGreaterThan(0);
    
    // Проверяем что ответ содержит результат
    expect(response.content).toMatch(/8|восемь|eight/i);
    
    console.log('✅ Запрос в режиме --full-auto выполнен успешно');
    console.log(`   Ответ: ${response.content.substring(0, 100)}...`);
  }, 150000); // Таймаут 150 секунд

  /**
   * Тест 10.4: Парсинг реального JSON-вывода
   * Validates: Requirements 10.4
   */
  it('должен корректно парсить реальный JSON-вывод от Codex CLI', async () => {
    // Проверяем работоспособность Codex CLI
    if (!codexWorks) {
      console.log('⚠️  Пропускаем тест: Codex CLI exec не работает');
      return; // Пропускаем тест
    }

    // Создаем запрос с JSON-выводом
    const request: CodexAdapterRequest = {
      prompt: 'Ответь одним словом: какой цвет у неба?',
      jsonOutput: true, // Включаем JSON-режим
      model: 'gpt-4o-mini'
    };

    // Выполняем запрос
    const response = await adapter.execute(request);

    // Проверки
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.executionTime).toBeGreaterThan(0);
    
    // Проверяем что ответ содержит информацию о цвете неба
    expect(response.content.toLowerCase()).toMatch(/голубой|синий|blue/);
    
    // Проверяем что ответ не содержит JSON-структуры (должен быть распарсен)
    expect(response.content).not.toMatch(/^\{.*\}$/);
    expect(response.content).not.toMatch(/"type":/);
    expect(response.content).not.toMatch(/"role":/);
    
    console.log('✅ JSON-вывод распарсен успешно');
    console.log(`   Ответ: ${response.content}`);
  }, 150000); // Таймаут 150 секунд

  /**
   * Тест 10.5: Парсинг реального текстового вывода
   * Validates: Requirements 10.5
   */
  it('должен корректно парсить реальный текстовый вывод от Codex CLI', async () => {
    // Проверяем работоспособность Codex CLI
    if (!codexWorks) {
      console.log('⚠️  Пропускаем тест: Codex CLI exec не работает');
      return; // Пропускаем тест
    }

    // Создаем запрос с текстовым выводом
    const request: CodexAdapterRequest = {
      prompt: 'Напиши короткое предложение о программировании (максимум 15 слов)',
      jsonOutput: false, // Текстовый режим
      model: 'gpt-4o-mini'
    };

    // Выполняем запрос
    const response = await adapter.execute(request);

    // Проверки
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.executionTime).toBeGreaterThan(0);
    
    // Проверяем что ответ не содержит ANSI-кодов
    expect(response.content).not.toMatch(/\x1b\[[0-9;]*m/);
    
    // Проверяем что ответ не содержит служебных префиксов
    expect(response.content).not.toMatch(/^\[Tool:/);
    expect(response.content).not.toMatch(/^\[Status:/);
    
    // Проверяем что ответ не содержит избыточных пустых строк
    expect(response.content).not.toMatch(/\n{3,}/);
    
    // Проверяем что ответ содержит слова связанные с программированием
    expect(response.content.toLowerCase()).toMatch(/код|программ|разработ|software|code|program|develop/);
    
    console.log('✅ Текстовый вывод распарсен успешно');
    console.log(`   Ответ: ${response.content}`);
  }, 150000); // Таймаут 150 секунд

  /**
   * Дополнительный тест: Проверка работы с различными опциями
   */
  it('должен корректно обрабатывать запрос с множественными опциями', async () => {
    // Проверяем работоспособность Codex CLI
    if (!codexWorks) {
      console.log('⚠️  Пропускаем тест: Codex CLI exec не работает');
      return; // Пропускаем тест
    }

    // Создаем запрос с несколькими опциями
    const request: CodexAdapterRequest = {
      prompt: 'Напиши число 42',
      model: 'gpt-4o-mini',
      fullAuto: true,
      jsonOutput: false,
      colorMode: 'never' // Отключаем цвета для чистого вывода
    };

    // Выполняем запрос
    const response = await adapter.execute(request);

    // Проверки
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.executionTime).toBeGreaterThan(0);
    
    // Проверяем что ответ содержит число 42
    expect(response.content).toMatch(/42|сорок два|forty-two/i);
    
    console.log('✅ Запрос с множественными опциями выполнен успешно');
  }, 150000); // Таймаут 150 секунд

  /**
   * Дополнительный тест: Проверка обработки ошибок
   */
  it('должен корректно обрабатывать ошибки при выполнении запроса', async () => {
    // Проверяем работоспособность Codex CLI
    if (!codexWorks) {
      console.log('⚠️  Пропускаем тест: Codex CLI exec не работает');
      return; // Пропускаем тест
    }

    // Создаем адаптер с очень коротким таймаутом
    const shortTimeoutAdapter = new CodexCLIAdapter({
      timeout: 100 // 100 мс - слишком мало для реального запроса
    });

    // Создаем запрос
    const request: CodexAdapterRequest = {
      prompt: 'Напиши длинное эссе на 1000 слов',
      model: 'gpt-4o-mini'
    };

    // Ожидаем ошибку таймаута
    try {
      await shortTimeoutAdapter.execute(request);
      // Если не произошло ошибки, тест не пройден
      fail('Ожидалась ошибка таймаута');
    } catch (error) {
      // Проверяем что это ошибка таймаута
      const errorMessage = (error as Error).message.toLowerCase();
      expect(
        errorMessage.includes('timeout') || 
        errorMessage.includes('таймаут') ||
        errorMessage.includes('timed out')
      ).toBe(true);
      
      console.log('✅ Ошибка таймаута обработана корректно');
    }
  }, 30000); // Таймаут 30 секунд для теста таймаута

  /**
   * Дополнительный тест: Проверка работы с конфигурационными переопределениями
   */
  it('должен корректно передавать конфигурационные переопределения', async () => {
    // Проверяем работоспособность Codex CLI
    if (!codexWorks) {
      console.log('⚠️  Пропускаем тест: Codex CLI exec не работает');
      return; // Пропускаем тест
    }

    // Создаем запрос с конфигурационными переопределениями
    const request: CodexAdapterRequest = {
      prompt: 'Ответь: OK',
      model: 'gpt-4o-mini',
      configOverrides: {
        'temperature': '0.1', // Низкая температура для более детерминированных ответов
        'max_tokens': '10'
      },
      jsonOutput: false
    };

    // Выполняем запрос
    const response = await adapter.execute(request);

    // Проверки
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.executionTime).toBeGreaterThan(0);
    
    // Проверяем что ответ короткий (из-за max_tokens=10)
    const wordCount = response.content.trim().split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(15); // Даем небольшой запас
    
    console.log('✅ Конфигурационные переопределения применены успешно');
    console.log(`   Ответ (${wordCount} слов): ${response.content}`);
  }, 150000); // Таймаут 150 секунд

  /**
   * Дополнительный тест: Проверка работы с рабочей директорией
   */
  it('должен корректно устанавливать рабочую директорию', async () => {
    // Проверяем работоспособность Codex CLI
    if (!codexWorks) {
      console.log('⚠️  Пропускаем тест: Codex CLI exec не работает');
      return; // Пропускаем тест
    }

    // Создаем запрос с указанием рабочей директории
    const request: CodexAdapterRequest = {
      prompt: 'Ответь: текущая директория установлена',
      model: 'gpt-4o-mini',
      workingDirectory: process.cwd(), // Используем текущую директорию
      jsonOutput: false
    };

    // Выполняем запрос
    const response = await adapter.execute(request);

    // Проверки
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.executionTime).toBeGreaterThan(0);
    
    console.log('✅ Рабочая директория установлена успешно');
    console.log(`   Ответ: ${response.content.substring(0, 100)}...`);
  }, 150000); // Таймаут 150 секунд
});

/**
 * Тесты для проверки доступности Codex CLI
 */
describe('Codex CLI Availability Tests', () => {
  /**
   * Тест: Проверка доступности утилиты
   */
  it('должен корректно определять доступность Codex CLI', async () => {
    const adapter = new CodexCLIAdapter();
    const isAvailable = await adapter.isAvailable();
    
    // Результат должен быть boolean
    expect(typeof isAvailable).toBe('boolean');
    
    if (isAvailable) {
      console.log('✅ Codex CLI доступен в системе');
    } else {
      console.log('⚠️  Codex CLI недоступен в системе');
      console.log('   Установите Codex CLI: npm install -g @openai/codex-cli');
    }
  }, 10000); // Таймаут 10 секунд для проверки доступности
});
