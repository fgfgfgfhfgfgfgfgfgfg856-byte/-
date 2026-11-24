# AlienStageTelegram на Render

Проект распаковывается из `AlienStageTelegram-email-login.zip` в каталог `AlienStageTelegram`. Скрипт `render-fix.cjs` во время сборки заменяет вход по email-коду на мгновенную регистрацию по нику и паролю, добавляет хеширование пароля и убирает email-проверку для подарков.

## Команды Render
- Build: `unzip -o "AlienStageTelegram-email-login.zip" -d . && node render-fix.cjs && cd AlienStageTelegram && npm install --omit=dev`
- Start: `cd AlienStageTelegram && npm start`
- Health check: `/health`

## Регистрация и вход
Почта и телефон не нужны. Для регистрации человек указывает отображаемое имя, уникальный ник и пароль от 8 до 128 символов. Пароль хранится только в виде хеша scrypt. Для следующего входа используются ник и пароль. Сброса пароля по почте нет — пароль нужно сохранить.

В старых аккаунтах, созданных до перехода на пароль, поле пароля отсутствует; для входа в них понадобится отдельное восстановление или новый ник.

## Переменные
- `DATABASE_URL` — PostgreSQL.
- `JWT_SECRET` — секрет сессии (Render генерирует из `render.yaml`).
- `STARTER_TOKENS` — стартовый баланс (по умолчанию 100).

Не публикуй секреты и не добавляй `.env` в GitHub.
