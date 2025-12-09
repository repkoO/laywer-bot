import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseManager {
  constructor() {
    this.db = new Database(path.join(__dirname, '..', '..', 'bot_database.db'));
    this.initDatabase();
  }

  initDatabase() {
    // Таблица заказов
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        user_name TEXT,
        user_phone TEXT,
        user_email TEXT,
        service_name TEXT NOT NULL,
        service_price TEXT NOT NULL,
        service_id TEXT,
        payment_status TEXT DEFAULT 'pending', -- pending, paid, free
        payment_date TEXT,
        order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        video_url TEXT,
        UNIQUE(chat_id, service_id, order_date)
      )
    `);

    // Индексы для быстрого поиска
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chat_id ON orders(chat_id);
      CREATE INDEX IF NOT EXISTS idx_payment_status ON orders(payment_status);
    `);

    console.log('✅ Database initialized');
  }

  // Сохранение заказа
  saveOrder(orderData) {
    const stmt = this.db.prepare(`
      INSERT INTO orders (
        chat_id, username, first_name, last_name,
        user_name, user_phone, user_email,
        service_name, service_price, service_id,
        payment_status, video_url
      ) VALUES (
        @chat_id, @username, @first_name, @last_name,
        @user_name, @user_phone, @user_email,
        @service_name, @service_price, @service_id,
        @payment_status, @video_url
      )
    `);

    try {
      const result = stmt.run(orderData);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error saving order:', error);
      return null;
    }
  }

  // Получение заказов пользователя
  getUserOrders(chatId) {
    const stmt = this.db.prepare(`
      SELECT * FROM orders
      WHERE chat_id = ?
      ORDER BY order_date DESC
      LIMIT 10
    `);

    return stmt.all(chatId);
  }

  // Обновление статуса оплаты
  updatePaymentStatus(orderId, chatId, status = 'paid') {
    const stmt = this.db.prepare(`
      UPDATE orders
      SET payment_status = ?,
          payment_date = datetime('now')
      WHERE id = ? AND chat_id = ?
    `);

    return stmt.run(status, orderId, chatId).changes > 0;
  }

  // Получение последнего заказа пользователя
  getLastOrder(chatId) {
    const stmt = this.db.prepare(`
      SELECT * FROM orders
      WHERE chat_id = ?
      ORDER BY order_date DESC
      LIMIT 1
    `);

    return stmt.get(chatId);
  }

  // Закрытие соединения (при завершении работы)
  close() {
    this.db.close();
  }
}

// Создаем единственный экземпляр
export const dbManager = new DatabaseManager();