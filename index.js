if (process.env.NODE_ENV !== 'production') require('dotenv').config();
console.log('GROQ_API_KEY exists:', !!process.env.GROQ_API_KEY);
console.log('TELEGRAM_TOKEN exists:', !!process.env.TELEGRAM_TOKEN);
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const client = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
const { initDb, getWords, addWord, deleteWord, getActiveDays, markDay, upsertUser, getAllUsers } = require('./db');
initDb();

app.get('/words/:telegramId', async (req, res) => {
  try {
    const words = await getWords(req.params.telegramId);
    res.json(words);
  } catch(e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.post('/words', async (req, res) => {
  try {
    const { telegramId, wordEn, wordRu } = req.body;
    await addWord(telegramId, wordEn, wordRu);
    await markDay(telegramId, new Date().toISOString().split('T')[0]);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.delete('/words/:telegramId/:wordId', async (req, res) => {
  try {
    await deleteWord(req.params.telegramId, req.params.wordId);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.get('/days/:telegramId', async (req, res) => {
  try {
    const days = await getActiveDays(req.params.telegramId);
    res.json(days);
  } catch(e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.post('/days', async (req, res) => {
  try {
    const { telegramId, day } = req.body;
    await markDay(telegramId, day);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Ошибка' });
  }
});
app.post('/translate', async (req, res) => {
  const { text } = req.body;
  try {
    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Переведи этот текст. Если текст на русском — переведи на английский. Если на английском — переведи на русский. Дай только перевод без лишних слов: "${text}"`
      }]
    });
    res.json({ result: response.choices[0].message.content });
  } catch(e) {
    res.status(500).json({ error: 'Ошибка перевода' });
  }
});

app.listen(3000, () => console.log('🌐 Сервер запущен на порту 3000'));
const SYSTEM_PROMPTS = {
  check: `You are a friendly English language tutor helping Russian-speaking users.
IMPORTANT: Always respond in Russian. Use English only for examples and corrections.
Your job: check the user's English text for mistakes.
Structure your response like this:
1. Краткая похвала за попытку
2. Список ошибок (если есть) с объяснением каждой
3. Исправленный вариант текста
4. Совет на будущее
If the text has no mistakes — say so and explain why it's correct.`,

  talk: `You are a friendly English conversation partner helping Russian-speaking users practice English.
IMPORTANT: Always respond in Russian, but encourage the user to write in English.
Your job: have a natural conversation, gently correct mistakes inline, suggest better phrases.
Structure your response like this:
1. Ответ на сообщение пользователя (на русском)
2. Если были ошибки — мягко укажи в скобках: (Кстати, правильнее будет: "...")
3. Предложи тему или вопрос чтобы продолжить разговор на английском`,

  words: `You are a vocabulary trainer for Russian-speaking English learners.
IMPORTANT: Always respond in Russian. Use English only for the words being studied.
Your job: help the user learn new English words interactively.
When user sends a topic or word — give:
1. 5 полезных слов по теме с переводом и произношением
2. Пример предложения для каждого слова
3. Мини-задание: попроси использовать одно из слов в предложении
When user sends a sentence using the word — check it and praise them.`,

  grammar: `You are a grammar tutor for Russian-speaking English learners.
IMPORTANT: Always respond in Russian. Use English only for grammar examples.
Your job: explain English grammar rules clearly using the user's own examples.
Structure your response like this:
1. Объяснение правила простым языком
2. Примеры правильного использования
3. Частые ошибки которые делают русскоязычные
4. Мини-тест: дай 2-3 предложения где нужно выбрать правильный вариант`,
};

const userSessions = {};

function getSession(chatId) {
  if (!userSessions[chatId]) {
    userSessions[chatId] = { mode: null, history: [] };
  }
  return userSessions[chatId];
}

function getMainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📝 Проверка текста', callback_data: 'mode_check' },
          { text: '💬 Разговорная практика', callback_data: 'mode_talk' },
        ],
        [
          { text: '📖 Словарный тренажёр', callback_data: 'mode_words' },
          { text: '📚 Грамматика', callback_data: 'mode_grammar' },
        ],
        [
          { text: '🏠 Главное меню', callback_data: 'menu' },
        ],
      ],
    },
  };
}

function getModeDescriptions() {
  return {
    check: '📝 *Проверка текста*\n\nОтправь мне любой текст на английском — я найду ошибки, объясню их и дам исправленный вариант.',
    talk: '💬 *Разговорная практика*\n\nПиши мне на английском на любую тему! Я буду отвечать, мягко исправлять ошибки и поддерживать разговор.',
    words: '📖 *Словарный тренажёр*\n\nНапиши тему или слово — например "путешествия" или "работа" — и я дам тебе 5 полезных слов с заданием.',
    grammar: '📚 *Грамматика*\n\nНапиши вопрос о грамматике или предложение где не уверен — я объясню правило и дам мини-тест.',
  };
}

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userSessions[chatId] = { mode: null, history: [] };

  bot.sendMessage(
    chatId,
    `👋 Привет! Я твой AI помощник для изучения английского языка!\n\nВыбери режим чтобы начать:`,
    getMainMenu()
  );
});

// Обработка кнопок
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = getSession(chatId);

  await bot.answerCallbackQuery(query.id);

  if (data === 'menu') {
    session.mode = null;
    session.history = [];
    bot.sendMessage(chatId, '🏠 Главное меню — выбери режим:', getMainMenu());
    return;
  }

  if (data.startsWith('mode_')) {
    const mode = data.replace('mode_', '');
    session.mode = mode;
    session.history = [];

    const descriptions = getModeDescriptions();
    bot.sendMessage(chatId, descriptions[mode] + '\n\n_Для смены режима нажми_ 🏠', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'menu' }]],
      },
    });
  }
});

// Обработка сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
// Сохраняем пользователя
await upsertUser(String(chatId), msg.from.first_name, msg.from.username);
  if (!text || text.startsWith('/')) return;

  const session = getSession(chatId);

  if (!session.mode) {
    bot.sendMessage(chatId, 'Выбери режим чтобы начать 👇', getMainMenu());
    return;
  }

  session.history.push({ role: 'user', content: text });

  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }

  try {
    await bot.sendChatAction(chatId, 'typing');

    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS[session.mode] },
        ...session.history,
      ],
    });

    const reply = response.choices[0].message.content;

    session.history.push({ role: 'assistant', content: reply });

    bot.sendMessage(chatId, reply, {
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'menu' }]],
      },
    });
  } catch (error) {
    console.error('Error:', error);
    bot.sendMessage(chatId, '😔 Что-то пошло не так. Попробуй ещё раз!');
  }
});
const schedule = require('node-cron');

schedule.schedule('0 14 * * *', async () => {
  // 14:00 UTC = 19:00 по Варшаве
  console.log('📬 Отправляем напоминания...');
  
  const users = await getAllUsers();
  const today = new Date().toISOString().split('T')[0];

  for (const user of users) {
    try {
      const activeDays = await getActiveDays(user.telegram_id);
      const studiedToday = activeDays.includes(today);
      
      if (studiedToday) continue; // уже занимался сегодня — не беспокоим

      const words = await getWords(user.telegram_id);
      const firstName = user.first_name || 'друг';

      if (words.length === 0) {
        await bot.sendMessage(user.telegram_id,
          `👋 Привет, ${firstName}! Попробуй добавить первые слова в словарь — я помогу их запомнить! 📖`,
          getMainMenu()
        );
      } else {
        const randomWords = words.sort(() => 0.5 - Math.random()).slice(0, 3);
        const wordList = randomWords.map(w => `• ${w.word_en} — ${w.word_ru}`).join('\n');
        
        await bot.sendMessage(user.telegram_id,
          `Hey ${firstName}! 👋 Давно не практиковались — давай повторим?\n\nВот несколько слов из твоего словаря:\n${wordList}\n\nОткрой приложение и потренируйся на флэшкардах! 🃏`,
          getMainMenu()
        );
      }
    } catch(e) {
      console.error(`Ошибка отправки для ${user.telegram_id}:`, e.message);
    }
  }
});
console.log('🤖 Бот запущен!');