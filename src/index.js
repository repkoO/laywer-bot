import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { mainMenu, servicesMenu, paymentMenu } from "./constants/menu.js";
import { services } from "./constants/services.js";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

dotenv.config();

const TOKEN = process.env.ACCESS_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "258095033";
const bot = new TelegramBot(TOKEN, { polling: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализация базы данных
let db;
(async () => {
  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  // Создаем таблицу заказов
  await db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      name TEXT,
      phone TEXT,
      email TEXT,
      service_name TEXT,
      service_price TEXT,
      service_description TEXT,
      payment_url TEXT,
      is_paid BOOLEAN DEFAULT 0,
      payment_date TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Database initialized");
})();

// Хранилище данных пользователей 
const userData = new Map();
const userState = new Map();

// Состояния пользователя
const USER_STATES = {
  AWAITING_CONSENT: 'awaiting_consent',
  AWAITING_NAME: 'awaiting_name',
  AWAITING_PHONE: 'awaiting_phone',
  AWAITING_EMAIL: 'awaiting_email',
  READY_FOR_PAYMENT: 'ready_for_payment'
};

// Функции для работы с базой данных
async function saveOrderToDatabase(chatId, data, service, isPaid = false) {
  try {
    await db.run(
      `INSERT INTO orders (chat_id, name, phone, email, service_name, service_price, service_description, payment_url, is_paid, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        chatId,
        data.name,
        data.phone,
        data.email,
        service.name,
        service.price,
        service.description,
        service.paymentUrl || service.videoUrl,
        isPaid ? 1 : 0
      ]
    );
    console.log(`Order saved for user ${chatId}`);
  } catch (error) {
    console.error('Error saving order to database:', error);
  }
}

async function getAllOrders() {
  try {
    return await db.all(`
      SELECT * FROM orders
      ORDER BY created_at DESC
    `);
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

// Проверка является ли пользователь администратором
function isAdmin(chatId) {
  return chatId.toString() === ADMIN_CHAT_ID.toString();
}

// Обработка команды /start
bot.onText(/\/start|\/help/, (msg) => {
  const chatId = msg.chat.id;
  userState.delete(chatId);
  userData.delete(chatId);
  const photoDir = path.join(__dirname, "assets", "hello.jpg");
  const caption = `Всех приветствую!
Меня зовут Нина, практикующий юрист и автор проекта Call My Lawyer ⚖️
Я и моя команда помогаем компаниям и предпринимателям чувствовать себя уверенно в юридических вопросах.

В этом боте вы можете:
— выбрать и заказать юридические услуги,
— получить юридические материалы и чек-листы,
— получать рассылку об изменениях в законах и рекомендации от меня.

Всё просто, прозрачно и по делу — как я люблю 💼`;

  bot.sendPhoto(chatId, photoDir, {
    parse_mode: "Markdown",
    caption: caption,
    reply_markup: mainMenu.reply_markup
  });
});

// Команда для администратора /orders
bot.onText(/\/orders/, async (msg) => {
  const chatId = msg.chat.id;

  // Проверяем, является ли пользователь администратором
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, "⛔ У вас нет прав доступа к этой команде.");
    return;
  }

  try {
    const orders = await getAllOrders();

    if (orders.length === 0) {
      bot.sendMessage(chatId, "📭 Заказов пока нет.");
      return;
    }

    // Отправляем по 10 заказов за раз, чтобы не превысить лимит сообщения
    for (let i = 0; i < orders.length; i += 10) {
      const chunk = orders.slice(i, i + 10);
      let message = `📊 Всего заказов: ${orders.length}\n\n`;

      chunk.forEach((order, index) => {
        const orderNumber = i + index + 1;
        const paidStatus = order.is_paid ? "✅ Оплачен" : "❌ Не оплачен";
        const date = new Date(order.created_at).toLocaleString('ru-RU');

        message +=
          `📋 Заказ #${orderNumber}\n` +
          `👤 Имя: ${order.name}\n` +
          `📞 Телефон: ${order.phone}\n` +
          `📧 Email: ${order.email}\n` +
          `🎯 Услуга: ${order.service_name}\n` +
          `💰 Цена: ${order.service_price}\n` +
          `📅 Дата: ${date}\n` +
          `💳 Статус: ${paidStatus}\n` +
          `---\n\n`;
      });

      bot.sendMessage(chatId, message);
    }

  } catch (error) {
    console.error('Error in /orders command:', error);
    bot.sendMessage(chatId, "❌ Произошла ошибка при получении заказов.");
  }
});

// Обработка обычных сообщений (кнопки главного меню)
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Проверяем, не находится ли пользователь в процессе оформления
  const state = userState.get(chatId);
  if (state && state !== 'idle') {
    handleUserInput(chatId, text, msg);
    return;
  }

  if (text === 'Услуги') {
    showServices(chatId);
  }
});

// Обработка ввода данных пользователя
function handleUserInput(chatId, text, msg) {
  const state = userState.get(chatId);
  const data = userData.get(chatId) || {};

  switch (state) {
    case USER_STATES.AWAITING_NAME:
      data.name = text;
      userData.set(chatId, data);
      userState.set(chatId, USER_STATES.AWAITING_PHONE);
      bot.sendMessage(chatId, "📞 Введите ваш номер телефона:", {
        reply_markup: { remove_keyboard: true }
      });
      break;

    case USER_STATES.AWAITING_PHONE:
      data.phone = text;
      userData.set(chatId, data);
      userState.set(chatId, USER_STATES.AWAITING_EMAIL);
      bot.sendMessage(chatId, "📧 Введите ваш email:", {
        reply_markup: { remove_keyboard: true }
      });
      break;

    case USER_STATES.AWAITING_EMAIL:
      // Простая валидация email
      if (text.includes('@') && text.includes('.')) {
        data.email = text;
        userData.set(chatId, data);
        userState.set(chatId, USER_STATES.READY_FOR_PAYMENT);
        showOrderSummary(chatId);
      } else {
        bot.sendMessage(chatId, "❌ Пожалуйста, введите корректный email адрес:");
      }
      break;
  }
}

// Показать услуги (inline-кнопки)
function showServices(chatId) {
  bot.sendMessage(
    chatId,
    "⌛ Загружаем услуги...",
    { reply_markup: { remove_keyboard: true } }
  ).then(() => {
    bot.sendMessage(
      chatId,
      "Выберите услугу:",
      servicesMenu
    );
  });
}

// Обработка inline-кнопок
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('service_')) {
    const serviceNumber = data.split('_')[1];
    showServiceDetails(chatId, serviceNumber);
  } else if (data === 'back_to_services') {
    userState.delete(chatId);
    userData.delete(chatId);
    showServices(chatId);
  } else if (data === 'back_to_main') {
    userState.delete(chatId);
    userData.delete(chatId);
    bot.sendMessage(chatId, 'Главное меню', mainMenu);
  } else if (data === 'make_payment') {
    showConsentForm(chatId);
  } else if (data === 'agree_to_terms') {
    startDataCollection(chatId);
  } else if (data === 'disagree_to_terms') {
    bot.sendMessage(chatId, "❌ Для оформления заказа необходимо согласие с условиями.");
  } else if (data === 'confirm_order') {
    processPayment(chatId);
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

function showServiceDetails(chatId, serviceNumber) {
  const service = services[serviceNumber];

  // Сохраняем выбранную услугу
  const data = userData.get(chatId) || {};
  data.selectedService = service;
  userData.set(chatId, data);

  const priceText = service.price === "0" ? "Бесплатно" : `${service.price}₽`;
  const buttonText = service.price === "0" ? "🎬 Получить доступ" : "💰 Оплатить услугу";

  const messageText =
    `🎯 ${service.name}\n\n` +
    `📝 ${service.description}\n\n` +
    `💰 Стоимость: ${priceText}\n\n` +
    `${service.price === "0" ? "Для получения доступа нажмите кнопку ниже:" : "Для оплаты нажмите кнопку ниже:"}`;

  bot.sendMessage(
    chatId,
    messageText,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: buttonText, callback_data: "make_payment" }],
          [{ text: "← Назад к услугам", callback_data: "back_to_services" }]
        ]
      }
    }
  );
}

// Показать форму согласия
function showConsentForm(chatId) {
  const consentMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Согласен", callback_data: "agree_to_terms" }],
        [{ text: "❌ Не согласен", callback_data: "disagree_to_terms" }]
      ]
    }
  };

  const consentText =
    `📋 <b>Согласие на обработку персональных данных</b>\n\n` +
    `Нажимая кнопку "Согласен", вы подтверждаете:\n\n` +
    `• Согласие на обработку персональных данных в соответствии с <a href="https://drive.google.com/drive/folders/11E5KSDpYaxeGVi0pp3b27su0H6F0FHbk">Политикой обработки ПДн</a>\n` +
    `• Принятие условий <a href="https://drive.google.com/drive/folders/11E5KSDpYaxeGVi0pp3b27su0H6F0FHbk">Публичной оферты</a>\n` +
    `• Согласие с <a href="https://drive.google.com/drive/folders/11E5KSDpYaxeGVi0pp3b27su0H6F0FHbk">Условиями предоставления услуг</a>`;

  userState.set(chatId, USER_STATES.AWAITING_CONSENT);

  bot.sendMessage(
    chatId,
    consentText,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: consentMenu.reply_markup
    }
  );
}

// Начать сбор данных пользователя
function startDataCollection(chatId) {
  userState.set(chatId, USER_STATES.AWAITING_NAME);

  bot.sendMessage(
    chatId,
    "✅ Согласие получено! Теперь нам нужны ваши данные для оформления заказа.\n\n" +
    "👤 Введите ваше имя и фамилию:",
    { reply_markup: { remove_keyboard: true } }
  );
}

// Показать сводку заказа
function showOrderSummary(chatId) {
  const data = userData.get(chatId);
  const service = data.selectedService;

  const orderMenu = {
    reply_markup: {
      inline_keyboard: [
        [{
          text: service.price === "0" ? "🎬 Получить видео" : "💳 Перейти к оплате",
          callback_data: "confirm_order"
        }],
        [{ text: "✏️ Изменить данные", callback_data: "back_to_services" }]
      ]
    }
  };

  const priceText = service.price === "0" ? "Бесплатно" : `${service.price}₽`;

  const summaryText =
    `📋 <b>Сводка заказа</b>\n\n` +
    `🎯 Услуга: ${service.name}\n` +
    `💰 Стоимость: ${priceText}\n\n` +
    `<b>Ваши данные:</b>\n` +
    `👤 Имя: ${data.name}\n` +
    `📞 Телефон: ${data.phone}\n` +
    `📧 Email: ${data.email}\n\n` +
    `Всё верно?`;

  bot.sendMessage(
    chatId,
    summaryText,
    {
      parse_mode: "HTML",
      reply_markup: orderMenu.reply_markup
    }
  );
}

// Обработка оплаты
async function processPayment(chatId) {
  const data = userData.get(chatId);
  const service = data.selectedService;

  // Сохраняем заказ в базу данных
  await saveOrderToDatabase(chatId, data, service, false);

  if (service.price === "0" || service.price === 0 || parseFloat(service.price) === 0) {
    handleFreeService(chatId, data);
    return;
  }

  const paymentKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Перейти к оплате", url: service.paymentUrl }],
        [{ text: "✅ Я оплатил", callback_data: "mark_as_paid" }],
        [{ text: "↩️ Назад к услугам", callback_data: "back_to_services" }]
      ]
    }
  };

  bot.sendMessage(
    chatId,
    `🔄 Ваш заказ создан!\n\n` +
    `Для оплаты перейдите по ссылке ниже:\n\n` +
    `💰 Сумма: ${service.price}₽\n` +
    `🎯 Услуга: ${service.name}\n\n` +
    `После оплаты нажмите "✅ Я оплатил"`,
    paymentKeyboard
  );

  // Оповещаем администратора о новом заказе
  if (ADMIN_CHAT_ID) {
    const adminMessage =
      `🆕 Новый заказ!\n\n` +
      `👤 Имя: ${data.name}\n` +
      `📞 Телефон: ${data.phone}\n` +
      `📧 Email: ${data.email}\n` +
      `🎯 Услуга: ${service.name}\n` +
      `💰 Цена: ${service.price}₽\n` +
      `💳 Статус: Ожидает оплаты\n` +
      `🆔 ID пользователя: ${chatId}`;

    bot.sendMessage(ADMIN_CHAT_ID, adminMessage);
  }
}

async function handleFreeService(chatId, userDataObj) {
  const service = userDataObj.selectedService;
  const videoLink = service.videoUrl || service.paymentUrl;

  // Сохраняем бесплатный заказ в базу
  await saveOrderToDatabase(chatId, userDataObj, service, true);

  const freeServiceKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️ Получить видео", url: videoLink }],
        [{ text: "↩️ К другим услугам", callback_data: "back_to_services" }]
      ]
    }
  };

  bot.sendMessage(
    chatId,
    `🎉 Ваш заказ оформлен!\n\n` +
    `🎯 Услуга: ${service.name}\n` +
    `💰 Стоимость: Бесплатно\n\n` +
    `🔗 Ссылка на видео-урок:\n${videoLink}`,
    freeServiceKeyboard
  );

  // Оповещаем администратора о бесплатном заказе
  if (ADMIN_CHAT_ID) {
    const adminMessage =
      `🎬 Новый бесплатный заказ!\n\n` +
      `👤 Имя: ${userDataObj.name}\n` +
      `📞 Телефон: ${userDataObj.phone}\n` +
      `📧 Email: ${userDataObj.email}\n` +
      `🎯 Услуга: ${service.name}\n` +
      `🆔 ID пользователя: ${chatId}`;

    bot.sendMessage(ADMIN_CHAT_ID, adminMessage);
  }

  // Очищаем временные данные
  userData.delete(chatId);
  userState.delete(chatId);
}

console.log("Bot started!");

// Errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code, error.message);
  if (error.code === 'EFATAL') {
    setTimeout(() => {
      bot.startPolling();
    }, 5000);
  }
});

bot.on('error', (error) => {
  console.error('General error:', error);
});