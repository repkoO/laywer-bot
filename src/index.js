import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { mainMenu, servicesMenu, paymentMenu } from "./constants/menu.js";
import { services } from "./constants/services.js";

dotenv.config();

const TOKEN = process.env.ACCESS_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

// Обработка команды /start
bot.onText(/\/start|\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Добро пожаловать! Выберите опцию:", mainMenu);
});

// Обработка обычных сообщений (кнопки главного меню)
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "Услуги") {
    showServices(chatId);
  }
});

// Показать услуги (inline-кнопки)
function showServices(chatId) {
  // Сначала скрываем клавиатуру предыдущего сообщения
  bot
    .sendMessage(chatId, "⌛ Загружаем услуги...", {
      reply_markup: { remove_keyboard: true },
    })
    .then(() => {
      // Затем показываем услуги
      bot.sendMessage(chatId, "Выберите услугу:", servicesMenu);
    });
}

// Обработка inline-кнопок
bot.on("callback_query", (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith("service_")) {
    const serviceNumber = data.split("_")[1];
    showServiceDetails(chatId, serviceNumber);
  } else if (data === "back_to_services") {
    showServices(chatId);
  } else if (data === "back_to_main") {
    bot.sendMessage(chatId, "Главное меню", mainMenu);
  } else if (data === "make_payment") {
    processPayment(chatId);
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

function showServiceDetails(chatId, serviceNumber) {
  const service = services[serviceNumber];

  const messageText =
    `🎯 ${service.name}\n\n` +
    `📝 ${service.description}\n\n` +
    `💰 Стоимость: ${service.price}₽\n\n` +
    `Для оплаты нажмите кнопку ниже:`;

  bot.sendMessage(chatId, messageText, {
    parse_mode: "HTML",
    reply_markup: paymentMenu.reply_markup,
  });
}

// Обработка оплаты
function processPayment(chatId) {
  // Здесь будет логика интеграции с платежной системой
  // Пока просто имитация

  bot.sendMessage(
    chatId,
    "🔄 Перенаправляем на страницу оплаты...\n\n" +
      "После успешной оплаты вы получите доступ к услуге."
  );

  // Через 2 секунды "успешная оплата"
  setTimeout(() => {
    bot.sendMessage(
      chatId,
      "✅ Оплата прошла успешно!\n\n" +
        "Ваша услуга активирована. Специалист свяжется с вами в течение 24 часов."
    );
  }, 2000);
}

console.log("Bot started!");
