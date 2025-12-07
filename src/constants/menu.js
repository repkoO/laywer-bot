export const mainMenu = {
  reply_markup: {
    keyboard: [["Услуги"]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

export const servicesMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "Подача уведомления в РКН", callback_data: "service_1" }],
      [{ text: "Пакет документов для психолога", callback_data: "service_2" }],
      [{ text: "Вебинар «Реклама по новым правлам»", callback_data: "service_3" }],
      [{  text: "Получить видео урок", callback_data: "service_4" }],
      [{ text: "← Назад", callback_data: "back_to_main" }],
    ],
  },
};

export const paymentMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "💳 Перейти к оформлению", callback_data: "make_payment" }],
      [{ text: "← К услугам", callback_data: "back_to_services" }],
      [{ text: "🏠 Главное меню", callback_data: "back_to_main" }],
    ],
  },
};
