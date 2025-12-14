import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { mainMenu, servicesMenu } from "./constants/menu.js";
import { services } from "./constants/services.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import crypto from 'crypto';

dotenv.config();

const TOKEN = process.env.ACCESS_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "854129215";
const bot = new TelegramBot(TOKEN, { polling: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Хранилище данных в JSON файле
const ORDERS_FILE = './orders.json';

const ROBOKASSA_CONFIG = {
  merchantLogin: process.env.ROBOKASSA_MERCHANT_LOGIN,
  password1: process.env.ROBOKASSA_PASSWORD1,
  password2: process.env.ROBOKASSA_PASSWORD2,
  isTest: process.env.ROBOKASSA_TEST === 'true',
  resultUrl: `https://repkoo-laywer-bot-72c5.twc1.net/robokassa-result`,
};

// Загрузка заказов из файла
async function loadOrders() {
  try {
    const data = await fs.readFile(ORDERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Если файла нет, создаем пустой массив
    await saveOrders([]);
    return [];
  }
}

// Сохранение заказов в файл
async function saveOrders(orders) {
  try {
    await fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2));
  } catch (error) {
    console.error('Error saving orders:', error);
  }
}

// Хранилище данных пользователей (временное)
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

// Функции для работы с заказами
async function saveOrderToFile(chatId, data, service, isPaid = false) {
  try {
    const orders = await loadOrders();
    const order = {
      id: orders.length > 0 ? Math.max(...orders.map(o => o.id)) + 1 : 1,
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

    orders.push(order);

    // Сохраняем только 10 последних заказов
    const maxOrders = 10;
    if (orders.length > maxOrders) {
      // Удаляем самые старые заказы
      orders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const ordersToKeep = orders.slice(-maxOrders);

      // Переиндексируем ID
      ordersToKeep.forEach((order, index) => {
        order.id = index + 1;
      });

      await saveOrders(ordersToKeep);
    } else {
      await saveOrders(orders);
    }

    console.log(`Order saved for user ${chatId}. Total orders: ${orders.length}`);
  } catch (error) {
    console.error('Error saving order to file:', error);
  }
}

// После функции saveOrderToFile (~строка 90)
function generateRobokassaPaymentLink(orderData) {
  const { merchantLogin, password1, isTest } = ROBOKASSA_CONFIG;
  const { outSum, invId, description, email } = orderData;

  // Генерация подписи
  const signatureString = `${merchantLogin}:${outSum}:${invId}:${password1}`;
  const signature = crypto.createHash('md5').update(signatureString).digest('hex');

  // Формирование URL
  let url = `https://auth.robokassa.ru/Merchant/Index.aspx?` +
    `MerchantLogin=${merchantLogin}&` +
    `OutSum=${outSum}&` +
    `InvId=${invId}&` +
    `Description=${encodeURIComponent(description)}&` +
    `SignatureValue=${signature}&` +
    `Email=${email}`;

  if (isTest) {
    url += '&IsTest=1';
  }

  return url;
}

async function getAllOrdersFromFile() {
  try {
    return await loadOrders();
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

async function getOrdersByChatIdFromFile(chatId) {
  try {
    const orders = await loadOrders();
    return orders.filter(order => order.chat_id === chatId);
  } catch (error) {
    console.error('Error fetching user orders:', error);
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

  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, "⛔ У вас нет прав доступа к этой команде.");
    return;
  }

  try {
    const orders = await getAllOrdersFromFile();

    if (orders.length === 0) {
      bot.sendMessage(chatId, "📭 Заказов пока нет.");
      return;
    }

    // Отправляем по 10 заказов за раз
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
  } else if (data.startsWith('check_payment_')) {
    const invId = data.split('_')[2];
    checkPaymentStatus(chatId, invId);
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

// После функции processPayment
async function checkPaymentStatus(chatId, invId) {
  try {
    const orders = await loadOrders();
    const order = orders.find(o => o.paymentId == invId && o.chat_id == chatId);

    if (!order) {
      bot.sendMessage(chatId, "❌ Заказ не найден");
      return;
    }

    if (order.is_paid) {
      // Отправляем материалы
      await sendPaymentMaterials(chatId, order);
    } else {
      bot.sendMessage(chatId, "⏳ Оплата еще не поступила. Попробуйте проверить позже.");
    }
  } catch (error) {
    console.error('Error checking payment:', error);
    bot.sendMessage(chatId, "❌ Ошибка при проверке оплаты");
  }
}
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

  // Для бесплатных услуг проверяем, нет ли уже активного заказа
  if (service.price === "0" || service.price === 0 || parseFloat(service.price) === 0) {
    const activeOrder = await getUserActiveOrder(chatId);

    // Если у пользователя уже есть неоплаченный заказ на эту услугу
    if (activeOrder && activeOrder.service_name === service.name && !activeOrder.is_paid) {
      // Просто показываем ссылку на видео без создания нового заказа
      const videoLink = service.videoUrl || service.paymentUrl;
      const freeServiceKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "▶️ Получить видео", url: videoLink }],
            [{ text: "↩️ К другим услугам", callback_data: "back_to_services" }]
          ]
        }
      };

       const invId = Date.now();

         await saveOrderToFile(chatId, {
          ...data,
          paymentId: invId,
          paymentStatus: 'pending'
        }, service, false);

        const paymentData = {
          outSum: service.price,
          invId: invId,
          description: `Оплата услуги: ${service.name}`,
          email: data.email,
          chatId: chatId
        };

        const paymentUrl = generateRobokassaPaymentLink(paymentData);

      bot.sendMessage(
        chatId,
        `🎉 Вот ваша ссылка на видео-урок:\n\n` +
        `🔗 ${videoLink}`,
        freeServiceKeyboard
      );

      // Обновляем заказ как оплаченный (бесплатная услуга)
      await markOrderAsPaidInFile(activeOrder.id);

      // Очищаем временные данные
      userData.delete(chatId);
      userState.delete(chatId);
      return;
    }

    // Если активного заказа нет, продолжаем стандартный процесс
    handleFreeService(chatId, data);
    return;
  }

  // Сохраняем заказ в файл (для платных услуг)
  await saveOrderToFile(chatId, data, service, false);

  const paymentKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Перейти к оплате", url: service.paymentUrl }],
        [{ text: "✅ Я оплатил", callback_data: "mark_as_paid" }],
        [{ text: "↩️ Назад к услугам", callback_data: "back_to_services" }]
      ]
    }
  };

  if (ADMIN_CHAT_ID) {
    const adminMessage = `🆕 Новый заказ!\n\n...` +
      `🔢 Номер заказа: ${invId}\n` +
      `🔗 Ссылка на оплату: ${paymentUrl}`;
    bot.sendMessage(ADMIN_CHAT_ID, adminMessage);
  }

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

  // Сохраняем бесплатный заказ в файл как оплаченный сразу
  await saveOrderToFile(chatId, userDataObj, service, true);

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

async function getUserActiveOrder(chatId) {
  try {
    const orders = await loadOrders();
    // Ищем последний неоплаченный заказ пользователя
    const userOrders = orders.filter(order => order.chat_id === chatId);
    if (userOrders.length > 0) {
      // Возвращаем последний заказ
      return userOrders[userOrders.length - 1];
    }
    return null;
  } catch (error) {
    console.error('Error getting user active order:', error);
    return null;
  }
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

import express from 'express';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Маршрут для получения уведомлений от Robokassa
app.post('/robokassa-result', async (req, res) => {
  try {
    const { OutSum, InvId, SignatureValue } = req.body;

    // Проверяем подпись
    const signatureString = `${OutSum}:${InvId}:${ROBOKASSA_CONFIG.password2}`;
    const calculatedSignature = crypto.createHash('md5').update(signatureString).digest('hex');

    if (calculatedSignature.toLowerCase() !== SignatureValue.toLowerCase()) {
      console.error('Invalid signature from Robokassa');
      return res.send(`ERROR`);
    }

    // Обновляем статус заказа
    const orders = await loadOrders();
    const orderIndex = orders.findIndex(o => o.paymentId == InvId);

    if (orderIndex !== -1) {
      orders[orderIndex].is_paid = true;
      orders[orderIndex].paid_at = new Date().toISOString();
      orders[orderIndex].paymentStatus = 'completed';

      await saveOrders(orders);

      // Отправляем материалы пользователю
      const order = orders[orderIndex];
      await sendPaymentMaterials(order.chat_id, order);

      // Оповещаем администратора
      if (ADMIN_CHAT_ID) {
        const adminMsg = `✅ Оплата получена!\n\n` +
          `🔢 Номер заказа: ${InvId}\n` +
          `💰 Сумма: ${OutSum} руб.\n` +
          `👤 Пользователь: ${order.name}`;
        bot.sendMessage(ADMIN_CHAT_ID, adminMsg);
      }
    }

    res.send(`OK${InvId}`);
  } catch (error) {
    console.error('Error processing Robokassa result:', error);
    res.send('ERROR');
  }
});

// Функция отправки материалов после оплаты
async function sendPaymentMaterials(chatId, order) {
  const service = services.find(s => s.name === order.service_name);

  if (service) {
    const materialsKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📥 Получить материалы", url: service.videoUrl || service.paymentUrl }],
          [{ text: "↩️ К другим услугам", callback_data: "back_to_services" }]
        ]
      }
    };

    bot.sendMessage(
      chatId,
      `✅ Оплата подтверждена!\n\n` +
      `🎯 Услуга: ${order.service_name}\n` +
      `💰 Сумма: ${order.service_price}₽\n\n` +
      `🔗 Ссылка на материалы:`,
      materialsKeyboard
    );

    // Очищаем временные данные
    userData.delete(chatId);
    userState.delete(chatId);
  }
}

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server started on port ${PORT}`);
});