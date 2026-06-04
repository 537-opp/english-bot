const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS words (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      word_en TEXT NOT NULL,
      word_ru TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS active_days (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      day TEXT NOT NULL,
      UNIQUE(telegram_id, day)
    )
  `);

  console.log('✅ База данных готова');
}

async function getWords(telegramId) {
  const result = await pool.query(
    'SELECT * FROM words WHERE telegram_id = $1 ORDER BY id DESC',
    [telegramId]
  );
  return result.rows;
}

async function addWord(telegramId, wordEn, wordRu) {
  await pool.query(
    'INSERT INTO words (telegram_id, word_en, word_ru) VALUES ($1, $2, $3)',
    [telegramId, wordEn, wordRu]
  );
}

async function deleteWord(telegramId, wordId) {
  await pool.query(
    'DELETE FROM words WHERE id = $1 AND telegram_id = $2',
    [wordId, telegramId]
  );
}

async function getActiveDays(telegramId) {
  const result = await pool.query(
    'SELECT day FROM active_days WHERE telegram_id = $1',
    [telegramId]
  );
  return result.rows.map(r => r.day);
}

async function markDay(telegramId, day) {
  await pool.query(
    'INSERT INTO active_days (telegram_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [telegramId, day]
  );
}

module.exports = { initDb, getWords, addWord, deleteWord, getActiveDays, markDay };