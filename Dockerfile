
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN mkdir -p assets

# Указываем переменные окружения
ENV PORT=3000

# Открываем порт
EXPOSE 3000

CMD ["node", "src/index.js"]