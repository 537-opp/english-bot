const { createClient } = require('@libsql/client');
const path = require('path');

const db = createClient({
  url: 'file:' + path.join(__dirname, 'english_bot.db'),
});

async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      word_en TEXT NOT NULL,
      word_ru TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS active_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      day TEXT NOT NULL,
      UNIQUE(telegram_id, day)
    )
  `);

  console.log('✅ База данных готова');
}

async function getWords(telegramId) {
  const result = await db.execute({
    sql: 'SELECT * FROM words WHERE telegram_id = ? ORDER BY id DESC',
    args: [telegramId],
  });
  return result.rows;
}

async function addWord(telegramId, wordEn, wordRu) {
  await db.execute({
    sql: 'INSERT INTO words (telegram_id, word_en, word_ru) VALUES (?, ?, ?)',
    args: [telegramId, wordEn, wordRu],
  });
}

async function deleteWord(telegramId, wordId) {
  await db.execute({
    sql: 'DELETE FROM words WHERE id = ? AND telegram_id = ?',
    args: [wordId, telegramId],
  });
}

async function getActiveDays(telegramId) {
  const result = await db.execute({
    sql: 'SELECT day FROM active_days WHERE telegram_id = ?',
    args: [telegramId],
  });
  return result.rows.map(r => r.day);
}

async function markDay(telegramId, day) {
  await db.execute({
    sql: 'INSERT OR IGNORE INTO active_days (telegram_id, day) VALUES (?, ?)',
    args: [telegramId, day],
  });
}

module.exports = { initDb, getWords, addWord, deleteWord, getActiveDays, markDay };