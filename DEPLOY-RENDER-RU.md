# Публикация AlienStageTelegram на Render

Исходный проект лежит в архиве `AlienStageTelegram-email-login.zip`.
Render распаковывает его в папку `AlienStageTelegram`, применяет `render-fix.cjs` и запускает Node.js-сервер.

## Команды Render

- Build: `unzip -o "AlienStageTelegram-email-login.zip" -d . && node render-fix.cjs && cd AlienStageTelegram && npm install --omit=dev`
- Start: `cd AlienStageTelegram && npm start`
- Health check: `/health`

`render-fix.cjs` удаляет несовместимый с Express 5 catch-all маршрут `app.get('*', ...)` и не даёт отсутствующему ключу Resend останавливать запуск веб-сервера. Сам код отправки писем всё равно требует настроенный Resend.

## Настройка отправки кодов по email

В Render открой сервис `alien-stage-telegram` → **Environment** → **Add Environment Variable** и добавь:

- Key: `RESEND_API_KEY`
- Value: API-ключ из панели Resend

Для уже существующего Render Blueprint новая переменная с `sync: false` не запрашивается повторно автоматически, поэтому её нужно добавить вручную в Environment. Не публикуй API-ключ в GitHub и не отправляй его в чат.

Переменная `EMAIL_FROM` по умолчанию задана как `AlienStageTelegram <onboarding@resend.dev>`. Тестовый адрес Resend подходит только для ограниченного тестирования с разрешённым получателем; для публичной отправки писем требуется настроенный и подтверждённый домен отправителя.

## Важное ограничение бесплатного тарифа

Текущая версия проекта хранит аккаунты и данные в PostgreSQL, привязанном в `render.yaml`. Бесплатные ресурсы Render могут иметь ограничения и сроки действия. Перед использованием с реальными пользователями проверь актуальные условия плана и настрой резервное копирование. Загруженные файлы/аватары не должны полагаться на временную файловую систему Render для постоянного хранения.

Не публикуй JWT и API-ключи и не добавляй файл `.env` в GitHub.
