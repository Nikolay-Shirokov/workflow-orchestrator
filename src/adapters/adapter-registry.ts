/**
 * Реестр CLI-адаптеров
 * Управляет регистрацией и доступом к CLI-адаптерам
 */

import { CLIAdapter, AdapterRegistry as IAdapterRegistry } from '../core/types.js';

/**
 * Реализация реестра адаптеров
 */
export class AdapterRegistry implements IAdapterRegistry {
  /** Хранилище адаптеров: имя -> адаптер */
  private adapters: Map<string, CLIAdapter> = new Map();

  /**
   * Регистрация адаптера в реестре
   * @param adapter - CLI-адаптер для регистрации
   * @throws Error если адаптер с таким именем уже зарегистрирован
   */
  register(adapter: CLIAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(
        `Адаптер с именем "${adapter.name}" уже зарегистрирован. ` +
        `Используйте другое имя или удалите существующий адаптер.`
      );
    }
    
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Получение адаптера по имени
   * @param name - Имя адаптера
   * @returns CLIAdapter | undefined - Адаптер или undefined если не найден
   */
  get(name: string): CLIAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Проверка наличия адаптера в реестре
   * @param name - Имя адаптера
   * @returns boolean - true если адаптер зарегистрирован
   */
  has(name: string): boolean {
    return this.adapters.has(name);
  }

  /**
   * Получение всех зарегистрированных адаптеров
   * @returns CLIAdapter[] - Массив всех адаптеров
   */
  getAll(): CLIAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Удаление адаптера из реестра
   * @param name - Имя адаптера для удаления
   * @returns boolean - true если адаптер был удален
   */
  unregister(name: string): boolean {
    return this.adapters.delete(name);
  }

  /**
   * Очистка всех адаптеров из реестра
   */
  clear(): void {
    this.adapters.clear();
  }

  /**
   * Получение количества зарегистрированных адаптеров
   * @returns number - Количество адаптеров
   */
  size(): number {
    return this.adapters.size;
  }
}
