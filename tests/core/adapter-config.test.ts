/**
 * Property-based тесты для конфигурации CLI-адаптеров
 * 
 * Feature: workflow-orchestrator, Property 1: Круговой обход конфигурации адаптера
 * Validates: Requirements 1.1
 */

import * as fc from 'fast-check';
import { AdapterConfig } from '../../src/core/types';

/**
 * Функция для сериализации конфигурации адаптера в JSON
 */
function serializeAdapterConfig(config: AdapterConfig): string {
  return JSON.stringify(config);
}

/**
 * Функция для десериализации конфигурации адаптера из JSON
 */
function deserializeAdapterConfig(json: string): AdapterConfig {
  return JSON.parse(json) as AdapterConfig;
}

/**
 * Генератор произвольных конфигураций адаптеров для property-based тестирования
 */
const arbitraryAdapterConfig = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  command: fc.string({ minLength: 1, maxLength: 100 }),
  args: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
    { nil: undefined }
  ),
  env: fc.option(
    fc.dictionary(
      fc.string({ minLength: 1, maxLength: 30 }),
      fc.string({ maxLength: 100 })
    ),
    { nil: undefined }
  ),
  parser: fc.option(
    fc.constantFrom('json', 'yaml', 'text', 'markdown'),
    { nil: undefined }
  ),
  timeout: fc.option(
    fc.integer({ min: 100, max: 600000 }),
    { nil: undefined }
  ),
});

describe('AdapterConfig Property Tests', () => {
  /**
   * Свойство 1: Круговой обход конфигурации адаптера
   * 
   * Для любой валидной конфигурации CLI-адаптера, сохранение и последующая 
   * загрузка конфигурации должны производить эквивалентную конфигурацию 
   * со всеми сохраненными полями.
   * 
   * Проверяет: Требование 1.1
   */
  test('Property 1: Круговой обход конфигурации адаптера - сериализация и десериализация сохраняют все поля', () => {
    fc.assert(
      fc.property(arbitraryAdapterConfig, (originalConfig) => {
        // Сериализуем конфигурацию
        const serialized = serializeAdapterConfig(originalConfig);
        
        // Десериализуем обратно
        const deserialized = deserializeAdapterConfig(serialized);
        
        // Проверяем, что все обязательные поля сохранились
        expect(deserialized.name).toBe(originalConfig.name);
        expect(deserialized.command).toBe(originalConfig.command);
        
        // Проверяем опциональные поля
        if (originalConfig.args !== undefined) {
          expect(deserialized.args).toEqual(originalConfig.args);
        } else {
          expect(deserialized.args).toBeUndefined();
        }
        
        if (originalConfig.env !== undefined) {
          expect(deserialized.env).toEqual(originalConfig.env);
        } else {
          expect(deserialized.env).toBeUndefined();
        }
        
        if (originalConfig.parser !== undefined) {
          expect(deserialized.parser).toBe(originalConfig.parser);
        } else {
          expect(deserialized.parser).toBeUndefined();
        }
        
        if (originalConfig.timeout !== undefined) {
          expect(deserialized.timeout).toBe(originalConfig.timeout);
        } else {
          expect(deserialized.timeout).toBeUndefined();
        }
        
        // Проверяем полное равенство объектов
        expect(deserialized).toEqual(originalConfig);
      }),
      { numRuns: 100 } // Минимум 100 итераций согласно требованиям
    );
  });

  /**
   * Дополнительный тест: проверка идемпотентности
   * Двойная сериализация/десериализация должна давать тот же результат
   */
  test('Property 1 (extended): Идемпотентность круговой сериализации', () => {
    fc.assert(
      fc.property(arbitraryAdapterConfig, (originalConfig) => {
        // Первый круг
        const serialized1 = serializeAdapterConfig(originalConfig);
        const deserialized1 = deserializeAdapterConfig(serialized1);
        
        // Второй круг
        const serialized2 = serializeAdapterConfig(deserialized1);
        const deserialized2 = deserializeAdapterConfig(serialized2);
        
        // Результаты должны быть идентичны
        expect(deserialized2).toEqual(deserialized1);
        expect(deserialized2).toEqual(originalConfig);
        expect(serialized2).toBe(serialized1);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Граничный случай: пустые массивы и объекты
   */
  test('Property 1 (edge case): Обработка пустых коллекций', () => {
    const configWithEmptyCollections: AdapterConfig = {
      name: 'test-adapter',
      command: 'test-command',
      args: [],
      env: {},
    };

    const serialized = serializeAdapterConfig(configWithEmptyCollections);
    const deserialized = deserializeAdapterConfig(serialized);

    expect(deserialized).toEqual(configWithEmptyCollections);
    expect(deserialized.args).toEqual([]);
    expect(deserialized.env).toEqual({});
  });

  /**
   * Граничный случай: специальные символы в строках
   */
  test('Property 1 (edge case): Специальные символы в строках', () => {
    const configWithSpecialChars: AdapterConfig = {
      name: 'test-adapter-"quotes"',
      command: 'cmd\\with\\backslashes',
      args: ['arg with spaces', 'arg\nwith\nnewlines', 'arg\twith\ttabs'],
      env: {
        'KEY_WITH_SPECIAL': 'value"with"quotes',
        'KEY_WITH_UNICODE': 'значение на русском 🚀',
      },
    };

    const serialized = serializeAdapterConfig(configWithSpecialChars);
    const deserialized = deserializeAdapterConfig(serialized);

    expect(deserialized).toEqual(configWithSpecialChars);
  });
});
