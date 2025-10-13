// Главное меню (обычная клавиатура)
export const mainMenu = {
  reply_markup: {
    keyboard: [
      ["Услуги"],
      ['Кнопка 2'],
      ['Кнопка 3']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};


export const servicesMenu = {
  reply_markup: {
    inline_keyboard: [
      [
        {
          text: "Подача уведомления в Роскомнадзор",
          callback_data: "service_1"
        }
      ],
      [
        {
          text: "Пакет документов для психологов",
          callback_data: "service_2"
        }
      ],
      [
        {
          text: "Реклама по новым правилам",
          callback_data: "service_3"
        }
      ],
      [
        {
          text: "🔙 Назад",
          callback_data: "back_to_main"
        }
      ]
    ]
  }
};

export const paymentMenu = {
  reply_markup: {
    inline_keyboard: [
      [
        {
          text: "💳 Оплатить",
          callback_data: "make_payment"
        }
      ],
      [
        {
          text: "🔙 К услугам",
          callback_data: "back_to_services"
        }
      ]
    ]
  }
};