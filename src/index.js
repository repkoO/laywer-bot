import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { mainMenu, servicesMenu } from "./constants/menu.js";
import { services } from "./constants/services.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

dotenv.config();

const TOKEN = process.env.ACCESS_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "854129215";
const bot = new TelegramBot(TOKEN, { polling: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ORDERS_FILE = './orders.json';

let ordersCache = [];

async function initOrders() {
  try {
    const data = await fs.readFile(ORDERS_FILE, 'utf-8');
    ordersCache = JSON.parse(data);
  } catch (error) {
    ordersCache = [];
  }
}

async function saveOrdersToFile() {
  try {
    await fs.writeFile(ORDERS_FILE, JSON.stringify(ordersCache, null, 2));
  } catch (error) {
    console.error('Error saving orders to disk:', error);
  }
}

initOrders();

const userData = new Map();
const userState = new Map();

const USER_STATES = {
  AWAITING_CONSENT: 'awaiting_consent',
  AWAITING_NAME: 'awaiting_name',
  AWAITING_PHONE: 'awaiting_phone',
  AWAITING_EMAIL: 'awaiting_email',
  READY_FOR_PAYMENT: 'ready_for_payment'
};

async function saveOrderToFile(chatId, data, service, isPaid = false) {
  try {
    const order = {
      id: ordersCache.length > 0 ? Math.max(...ordersCache.map(o => o.id)) + 1 : 1,
      chat_id: chatId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      service_name: service.name,
      service_price: service.price,
      service_description: service.description,
      payment_url: service.paymentUrl || service.videoUrl,
      is_paid: isPaid,
      created_at: new Date().toISOString()
    };

    ordersCache.push(order);

    const maxOrders = 10;
    if (ordersCache.length > maxOrders) {
      ordersCache.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      ordersCache.splice(0, ordersCache.length - maxOrders);
      ordersCache.forEach((order, index) => {
        order.id = index + 1;
      });
    }

    await saveOrdersToFile();
    console.log(`Order saved for user ${chatId}. Total orders: ${ordersCache.length}`);
  } catch (error) {
    console.error('Error saving order:', error);
  }
}

async function markOrderAsPaidInFile(orderId) {
  const orderIndex = ordersCache.findIndex(o => o.id === orderId);
  if (orderIndex !== -1) {
    ordersCache[orderIndex].is_paid = true;
    await saveOrdersToFile();
  }
}

function getAllOrdersFromFile() {
  return ordersCache;
}

function getOrdersByChatIdFromFile(chatId) {
  return ordersCache.filter(order => order.chat_id === chatId);
}

function isAdmin(chatId) {
  return chatId.toString() === ADMIN_CHAT_ID.toString();
}

bot.onText(/\/start|\/help/, (msg) => {
  const chatId = msg.chat.id;
  userState.delete(chatId);
  userData.delete(chatId);
  const photoDir = path.join(__dirname, "assets", "hello.jpg");
  const caption = `Всех приветствую!\nМеня зовут Нина, практикующий юрист и автор проекта Call My Lawyer ⚖️\nЯ и моя команда помогаем компаниям и предпринимателям чувствовать себя уверенно в юридических вопросах.\n\nВ этом боте вы можете:\n— выбрать и заказать юридические услуги,\n— получить юридические материалы и чек-листы,\n— получать рассылку об изменениях в законах и рекомендации от меня.\n\nВсё просто, прозрачно и по делу — как я люблю 💼`;

  bot.sendPhoto(chatId, photoDir, {
    parse_mode: "Markdown",
    caption: caption,
    reply_markup: mainMenu.reply_markup
  });
});

bot.onText(/\/orders/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    return bot.sendMessage(chatId, "⛔ У вас нет прав доступа к этой команде.");
  }

  const orders = getAllOrdersFromFile();

  if (orders.length === 0) {
    return bot.sendMessage(chatId, "📭 Заказов пока нет.");
  }

  for (let i = 0; i < orders.length; i += 10) {
    const chunk = orders.slice(i, i + 10);
    let message = `📊 Всего заказов: ${orders.length}\n\n`;

    chunk.forEach((order, index) => {
      const orderNumber = i + index + 1;
      const paidStatus = order.is_paid ? "✅ Оплачен" : "❌ Не оплачен";
      const date = new Date(order.created_at).toLocaleString('ru-RU');
      message += `📋 Заказ #${orderNumber}\n👤 Имя: ${order.name}\n📞 Телефон: ${order.phone}\n📧 Email: ${order.email}\n🎯 Услуга: ${order.service_name}\n💰 Цена: ${order.service_price}\n📅 Дата: ${date}\n💳 Статус: ${paidStatus}\n---\n\n`;
    });

    bot.sendMessage(chatId, message);
  }
});

// Обработка обычных сообщений
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  const state = userState.get(chatId);
  if (state && state !== 'idle') {
    handleUserInput(chatId, text, msg);
    return;
  }

  if (text === 'Услуги') {
    showServices(chatId);
  }
});

function handleUserInput(chatId, text, msg) {
  const state = userState.get(chatId);
  const data = userData.get(chatId) || {};

  switch (state) {
    case USER_STATES.AWAITING_NAME:
      data.name = text;
      userData.set(chatId, data);
      userState.set(chatId, USER_STATES.AWAITING_PHONE);
      bot.sendMessage(chatId, "📞 Введите ваш номер телефона:", { reply_markup: { remove_keyboard: true } });
      break;
    case USER_STATES.AWAITING_PHONE:
      data.phone = text;
      userData.set(chatId, data);
      userState.set(chatId, USER_STATES.AWAITING_EMAIL);
      bot.sendMessage(chatId, "📧 Введите ваш email:", { reply_markup: { remove_keyboard: true } });
      break;
    case USER_STATES.AWAITING_EMAIL:
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

function showServices(chatId) {
  bot.sendMessage(chatId, "⌛ Загружаем услуги...", { reply_markup: { remove_keyboard: true } })
    .then(() => bot.sendMessage(chatId, "Выберите услугу:", servicesMenu));
}

bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('service_')) {
    showServiceDetails(chatId, data.split('_')[1]);
  } else if (data === 'back_to_services') {
    userState.delete(chatId); userData.delete(chatId);
    showServices(chatId);
  } else if (data === 'back_to_main') {
    userState.delete(chatId); userData.delete(chatId);
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
  const data = userData.get(chatId) || {};
  data.selectedService = service;
  userData.set(chatId, data);

  const priceText = service.price === "0" ? "Бесплатно" : `${service.price}₽`;
  const buttonText = service.price === "0" ? "🎬 Получить доступ" : "💰 Оплатить услугу";
  const messageText = `🎯 ${service.name}\n\n📝 ${service.description}\n\n💰 Стоимость: ${priceText}\n\n${service.price === "0" ? "Для получения доступа нажмите кнопку ниже:" : "Для оплаты нажмите кнопку ниже:"}`;

  bot.sendMessage(chatId, messageText, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: buttonText, callback_data: "make_payment" }],
        [{ text: "← Назад к услугам", callback_data: "back_to_services" }]
      ]
    }
  });
}

function showConsentForm(chatId) {
  userState.set(chatId, USER_STATES.AWAITING_CONSENT);
  const consentText = `📋 <b>Согласие на обработку персональных данных</b>\n\nНажимая кнопку "Согласен", вы подтверждаете:\n\n• Согласие на обработку персональных данных в соответствии с <a href="https://drive.google.com/file/d/11XAWXuFeEMtmKZis0deQBsZEEGzWzPWC/view?usp=sharing">Политикой обработки ПДн</a>\n• Принятие условий <a href="https://drive.google.com/file/d/1TlontZGvs9nTqmUC4XKchMGvgFjbUfYC/view?usp=drive_link">Публичной оферты</a>\n• Согласие с <a href="https://drive.google.com/file/d/1TtOodK-VuY7rU3RjEoKz95jvsdQ5nwiP/view?usp=drive_link">Условиями предоставления услуг</a>`;

  bot.sendMessage(chatId, consentText, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Согласен", callback_data: "agree_to_terms" }],
        [{ text: "❌ Не согласен", callback_data: "disagree_to_terms" }]
      ]
    }
  });
}

function startDataCollection(chatId) {
  userState.set(chatId, USER_STATES.AWAITING_NAME);
  bot.sendMessage(chatId, "✅ Согласие получено! Теперь нам нужны ваши данные для оформления заказа.\n\n👤 Введите ваше имя и фамилию:", { reply_markup: { remove_keyboard: true } });
}

function showOrderSummary(chatId) {
  const data = userData.get(chatId);
  const service = data.selectedService;
  const priceText = service.price === "0" ? "Бесплатно" : `${service.price}₽`;
  const summaryText = `📋 <b>Сводка заказа</b>\n\n🎯 Услуга: ${service.name}\n💰 Стоимость: ${priceText}\n\n<b>Ваши данные:</b>\n👤 Имя: ${data.name}\n📞 Телефон: ${data.phone}\n📧 Email: ${data.email}\n\nВсё верно?`;

  bot.sendMessage(chatId, summaryText, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: service.price === "0" ? "🎬 Получить видео" : "💳 Перейти к оплате", callback_data: "confirm_order" }],
        [{ text: "✏️ Изменить данные", callback_data: "back_to_services" }]
      ]
    }
  });
}

async function processPayment(chatId) {
  const data = userData.get(chatId);
  const service = data.selectedService;

  if (service.price === "0" || service.price === 0 || parseFloat(service.price) === 0) {
    const activeOrder = getOrdersByChatIdFromFile(chatId).pop();

    if (activeOrder && activeOrder.service_name === service.name && !activeOrder.is_paid) {
      const videoLink = service.videoUrl || service.paymentUrl;
      bot.sendMessage(chatId, `🎉 Вот ваша ссылка на видео-урок:\n\n🔗 ${videoLink}`, {
        reply_markup: { inline_keyboard: [[{ text: "▶️ Получить видео", url: videoLink }], [{ text: "↩️ К другим услугам", callback_data: "back_to_services" }]] }
      });
      await markOrderAsPaidInFile(activeOrder.id);
      userData.delete(chatId); userState.delete(chatId);
      return;
    }
    handleFreeService(chatId, data);
    return;
  }

  await saveOrderToFile(chatId, data, service, false);

  bot.sendMessage(chatId, `🔄 Ваш заказ создан!\n\nДля оплаты перейдите по ссылке ниже:\n\n💰 Сумма: ${service.price}₽\n🎯 Услуга: ${service.name}\n\nПосле оплаты нажмите "✅ Я оплатил"`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Перейти к оплате", url: service.paymentUrl }],
        [{ text: "✅ Я оплатил", callback_data: "mark_as_paid" }],
        [{ text: "↩️ Назад к услугам", callback_data: "back_to_services" }]
      ]
    }
  });

  if (ADMIN_CHAT_ID) {
    bot.sendMessage(ADMIN_CHAT_ID, `🆕 Новый заказ!\n\n👤 Имя: ${data.name}\n📞 Телефон: ${data.phone}\n📧 Email: ${data.email}\n🎯 Услуга: ${service.name}\n💰 Цена: ${service.price}₽\n💳 Статус: Ожидает оплаты\n🆔 ID пользователя: ${chatId}`);
  }
}

async function handleFreeService(chatId, userDataObj) {
  const service = userDataObj.selectedService;
  const videoLink = service.videoUrl || service.paymentUrl;

  await saveOrderToFile(chatId, userDataObj, service, true);

  bot.sendMessage(chatId, `🎉 Ваш заказ оформлен!\n\n🎯 Услуга: ${service.name}\n💰 Стоимость: Бесплатно\n\n🔗 Ссылка на видео-урок:\n${videoLink}`, {
    reply_markup: { inline_keyboard: [[{ text: "▶️ Получить видео", url: videoLink }], [{ text: "↩️ К другим услугам", callback_data: "back_to_services" }]] }
  });

  if (ADMIN_CHAT_ID) {
    bot.sendMessage(ADMIN_CHAT_ID, `🎬 Новый бесплатный заказ!\n\n👤 Имя: ${userDataObj.name}\n📞 Телефон: ${userDataObj.phone}\n📧 Email: ${userDataObj.email}\n🎯 Услуга: ${service.name}\n🆔 ID пользователя: ${chatId}`);
  }

  userData.delete(chatId);
  userState.delete(chatId);
}

console.log("Bot started!");

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code, error.message);
});