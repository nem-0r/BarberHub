# Используем современный образ Node.js
FROM node:20-alpine

# Устанавливаем pnpm глобально
RUN npm install -g pnpm

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем только файлы манифеста для кэширования слоев
COPY package.json pnpm-lock.yaml ./

# Устанавливаем зависимости
# Используем --frozen-lockfile для уверенности, что билд идентичен локальному
RUN pnpm install --frozen-lockfile

# Копируем остальные файлы
COPY . .

# Прокидываем порт по умолчанию для Next.js
EXPOSE 3000

# ВАЖНО: для работы hot-reload в Docker на некоторых ОС 
# полезно включить опрос файлов (polling)
ENV WATCHPACK_POLLING=true
ENV NEXT_TELEMETRY_DISABLED=1

# Запуск в режиме разработки
CMD ["pnpm", "dev"]
