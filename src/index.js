import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { mainMenu, servicesMenu, paymentMenu } from "./constants/menu.js";

dotenv.config();

const TOKEN = process.env.ACCESS_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

// Обработка команды /start
bot.onText(/\/start|\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Добро пожаловать! Выберите опцию:", mainMenu);
});

// Обработка обычных сообщений (кнопки главного меню)
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === 'Услуги') {
    showServices(chatId);
  } else if (text === 'нас') {
    bot.sendMessage(chatId, "Мы - лучшая юридическая компания!");
  } else if (text === '📞 Контакты') {
    bot.sendMessage(chatId, "Наши контакты:\nТелефон: +7 XXX XXX-XX-XX\nEmail: info@example.com");
  } else if (text === '🛒 Мои заказы') {
    bot.sendMessage(chatId, "Здесь будут ваши заказы...");
  }
});

// Показать услуги (inline-кнопки)
function showServices(chatId) {
  // Сначала скрываем клавиатуру предыдущего сообщения
  bot.sendMessage(
    chatId,
    "⌛ Загружаем услуги...",
    { reply_markup: { remove_keyboard: true } }
  ).then(() => {
    // Затем показываем услуги
    bot.sendMessage(
      chatId,
      "Тут нужен текст описывающий общие услуги",
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
    showServices(chatId);
  } else if (data === 'back_to_main') {
    bot.sendMessage(chatId, 'Главное меню', mainMenu);
  } else if (data === 'make_payment') {
    processPayment(chatId);
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

function showServiceDetails(chatId, serviceNumber) {
  const services = {
    '1': { name: "Подача уведомления в Роскомнадзор", price: 'Цена услуги', description: "Описание услуги" },
    '2': { name: "Пакет документов для психологов", price: 'Цена услуги', description: "Описание услуги" },
    '3': { name: "Реклама по новым правилам", price: 'Цена услуги', description: "Описание услуги" }
  };

  const service = services[serviceNumber];

  bot.sendMessage(
    chatId,
    `🎯 ${service.name}\n\n` +
    `📝 ${service.description}\n\n` +
    `💰 Цена: ${service.price}₽\n\n` +
    `Для оплаты нажмите кнопку ниже:`,
    paymentMenu
  );
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