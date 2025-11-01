import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { mainMenu, servicesMenu, paymentMenu } from "./constants/menu.js";
import { services } from "./constants/services.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const TOKEN = process.env.ACCESS_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Хранилище данных пользователей (в продакшене лучше использовать БД)
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

Всё просто, прозрачно и по делу — как я люблю 💼`
  bot.sendPhoto(chatId, photoDir, {
    parse_mode: "Markdown",
    caption: caption,
    reply_markup: mainMenu.reply_markup
  });
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
bot.on('callback_query', (callbackQuery) => {
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

  const messageText =
    `🎯 ${service.name}\n\n` +
    `📝 ${service.description}\n\n` +
    `💰 Стоимость: ${service.price}₽\n\n` +
    `Для оплаты нажмите кнопку ниже:`;

  bot.sendMessage(
    chatId,
    messageText,
    {
      parse_mode: "HTML",
      reply_markup: paymentMenu.reply_markup
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
        [{ text: "💳 Перейти к оплате", callback_data: "confirm_order" }],
        [{ text: "✏️ Изменить данные", callback_data: "back_to_services" }]
      ]
    }
  };

  const summaryText =
    `📋 <b>Сводка заказа</b>\n\n` +
    `🎯 Услуга: ${service.name}\n` +
    `💰 Стоимость: ${service.price}₽\n\n` +
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
// Обработка оплаты
function processPayment(chatId) {
  const data = userData.get(chatId);
  const service = data.selectedService;

  const paymentKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Перейти к оплате", url: service.paymentUrl }],
        [{ text: "✅ Я оплатил", callback_data: "check_payment" }],
        [{ text: "↩️ Назад к услугам", callback_data: "back_to_services" }]
      ]
    }
  };

  bot.sendMessage(
    chatId,
    `🔄 Ваш заказ создан!\n\n` +
    `Для оплаты перейдите по ссылке ниже:\n\n` +
    `💰 Сумма: ${service.price}₽\n` +
    `🎯 Услуга: ${service.name}`,
    paymentKeyboard
  );
}

console.log("Bot started!");

// Errors

// Обработка ошибок polling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code, error.message);

  if (error.code === 'EFATAL') {
    console.log('Fatal error, restarting bot...');
    setTimeout(() => {
      bot.startPolling();
    }, 5000);
  }
});

// Обработка ошибок вебхука
bot.on('webhook_error', (error) => {
  console.error('Webhook error:', error);
});

// Обработка общих ошибок
bot.on('error', (error) => {
  console.error('General error:', error);
});