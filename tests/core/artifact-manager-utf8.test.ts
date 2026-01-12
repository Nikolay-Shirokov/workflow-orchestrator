/**
 * Тесты для проверки корректности работы с UTF-8 в ArtifactManager
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DefaultArtifactManager } from '../../src/core/artifact-manager.js';
import * as fs from 'fs/promises';

describe('ArtifactManager UTF-8 Encoding', () => {
  let artifactManager: DefaultArtifactManager;
  const testBaseDir = './test-artifacts-utf8';
  const sessionId = 'test-utf8-session';

  beforeEach(async () => {
    artifactManager = new DefaultArtifactManager({
      baseDir: testBaseDir,
      saveMetadata: false, // Отключаем метаданные для простоты
    });
  });

  afterEach(async () => {
    // Очистка тестовых артефактов
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // Игнорируем ошибки при очистке
    }
  });

  it('должен корректно сохранять и загружать русский текст', async () => {
    const russianText = `# Заголовок на русском

Это текст на русском языке с различными символами:
- Кириллица: АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ
- Строчные: абвгдеёжзийклмнопрстуфхцчшщъыьэюя
- Специальные: №, ©, ®, ™`;

    const artifactPath = await artifactManager.save(
      sessionId,
      'step1',
      'russian.md',
      russianText
    );

    const loaded = await artifactManager.load(artifactPath);
    expect(loaded).toBe(russianText);
  });

  it('должен корректно сохранять и загружать многоязычный текст', async () => {
    const multilingualText = `# Multilingual Test

- English: Hello World!
- Русский: Привет Мир!
- Deutsch: Hallo Welt!
- Français: Bonjour le monde!
- 中文: 你好世界!
- 日本語: こんにちは世界!
- العربية: مرحبا بالعالم!
- עברית: שלום עולם!`;

    const artifactPath = await artifactManager.save(
      sessionId,
      'step1',
      'multilingual.md',
      multilingualText
    );

    const loaded = await artifactManager.load(artifactPath);
    expect(loaded).toBe(multilingualText);
  });

  it('должен корректно сохранять и загружать эмодзи', async () => {
    const emojiText = `# Эмодзи тест

🎉 🚀 💻 📝 ✅ ❌ 🔥 💡 🌟 ⭐ 🎯 🏆 🎨 🎭 🎪 🎬`;

    const artifactPath = await artifactManager.save(
      sessionId,
      'step1',
      'emoji.md',
      emojiText
    );

    const loaded = await artifactManager.load(artifactPath);
    expect(loaded).toBe(emojiText);
  });

  it('должен корректно сохранять специальные символы', async () => {
    const specialChars = `# Специальные символы

Математические: ∑ ∏ ∫ √ ∞ ≈ ≠ ≤ ≥
Валюты: $ € £ ¥ ₽ ₴ ₹
Стрелки: → ← ↑ ↓ ⇒ ⇐ ⇑ ⇓
Другие: © ® ™ § ¶ † ‡ • ‰ ′ ″`;

    const artifactPath = await artifactManager.save(
      sessionId,
      'step1',
      'special.md',
      specialChars
    );

    const loaded = await artifactManager.load(artifactPath);
    expect(loaded).toBe(specialChars);
  });

  it('должен сохранять файлы в UTF-8 без BOM', async () => {
    const testText = 'Тестовый текст';
    
    const artifactPath = await artifactManager.save(
      sessionId,
      'step1',
      'test.md',
      testText
    );

    // Читаем файл как буфер
    const buffer = await fs.readFile(artifactPath);
    
    // Проверяем, что нет BOM (UTF-8 BOM: EF BB BF)
    const hasBOM = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
    expect(hasBOM).toBe(false);
    
    // Проверяем, что файл читается как UTF-8
    const content = buffer.toString('utf-8');
    expect(content).toBe(testText);
  });

  it('должен корректно работать с большими файлами (потоковая передача)', async () => {
    // Создаём большой текст (больше порога потоковой передачи)
    const largeText = 'Повторяющийся текст на русском языке. '.repeat(50000);
    
    const artifactPath = await artifactManager.save(
      sessionId,
      'step1',
      'large.md',
      largeText
    );

    const loaded = await artifactManager.load(artifactPath);
    expect(loaded).toBe(largeText);
  });

  it('должен корректно сохранять пустые строки и переносы', async () => {
    const textWithNewlines = `Первая строка

Третья строка (после пустой)

Пятая строка

Конец`;

    const artifactPath = await artifactManager.save(
      sessionId,
      'step1',
      'newlines.md',
      textWithNewlines
    );

    const loaded = await artifactManager.load(artifactPath);
    expect(loaded).toBe(textWithNewlines);
  });
});
