# Euroclub Admin — панель пушів + бокового меню

React + Vite + TS, інлайн-стилі, lucide-react. Firestore для даних,
Cloud Messaging + serverless-функція (Vercel) для розсилки push.

## 1. Firebase

Використовуй **той самий Firebase-проєкт**, що й у мобільному euroclub-app
(або створи новий, якщо його ще нема — тоді ці ж дані потім віддаси в
основний чат для інтеграції).

1. Firebase Console → Project Settings → General → "Your apps" → якщо нема
   Web-app, додай (`</>`) — отримаєш `firebaseConfig` (apiKey, authDomain, ...).
2. Увімкни Firestore (Build → Firestore Database → Create database).
3. Увімкни Cloud Messaging (зазвичай увімкнено за замовчуванням).
4. Project Settings → Service Accounts → **Generate new private key** —
   завантажиться JSON-файл. Він потрібен ТІЛЬКИ серверній функції, ніколи
   не клади його у фронтенд-код чи в git.

## 2. Локальний запуск

```bash
npm install
cp .env.example .env
# заповни .env значеннями з firebaseConfig + свій пароль VITE_ADMIN_PASSWORD
npm run dev
```

Serverless-функція (`/api/send-push`) локально через `npm run dev` не
підніметься (це Vite, не Vercel) — для локального тесту відправки постав
`vercel dev` (`npm i -g vercel`, далі `vercel dev`), або перевіряй форму
"наживо" вже після першого деплою на Vercel.

## 3. Деплой (Vercel)

1. Заливаєш репозиторій (або `vercel` CLI з цієї папки напряму, без git).
2. У Vercel Project Settings → Environment Variables додаєш:
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
     `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
     `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
   - `VITE_ADMIN_PASSWORD` — пароль входу в панель
   - `FIREBASE_SERVICE_ACCOUNT` — **весь вміст** JSON-ключа з кроку 1.4,
     вставлений як один рядок (Vercel приймає багаторядкові значення теж,
     головне — валідний JSON)
3. Deploy. Готово — і фронт, і `/api/send-push` живуть на одному домені.

## 4. Firestore security rules

Дивись `firestore.rules.example` — і обов'язково прочитай коментар зверху
файлу. Панель не має справжньої автентифікації (лише пароль на фронті), тому
правила Firestore не можуть по-справжньому відрізнити адміна від будь-кого
іншого. Для внутрішньої панелі з довірених рук це прийнятний компроміс, але
не показуй посилання на панель нікому зайвому і не вважай пароль захистом
від навмисної атаки.

## 5. Структура даних (те, що йде в основний чат euroclub-app)

- `side_menu_items` — документ на пункт: `{ order, icon, label, url }`.
  `icon` — один з: `FileText`, `Gift`, `Map`, `Bus`, `Star`, `Share2`, `Info`.
- `device_tokens` — документ на користувача, **ID документа = uid**, поле
  `token: string`. (Уточнення проти брифу: замість мапи `{uid: token}` в
  одному документі зроблено окремий документ на кожного користувача — так
  можна оновлювати/видаляти токен без гонки записів і легше рахувати
  кількість пристроїв.)
- `push_campaigns` — пише лише serverless-функція:
  `{ title, body, deepLink|null, sentAt, targetCount, successCount, status }`.

## 6. Що повернути в чат euroclub-app

1. `firebaseConfig` (apiKey, projectId, і т.д.) — той самий, що в `.env`.
2. Це README (або просто скажи, що структура колекцій — як тут, без змін).
3. Формат `deepLink` — зараз це вільний текстовий рядок (URL або кастомна
   схема типу `euroclub://routes`), який кладеться в `data.deepLink` пейлоду
   push-повідомлення. Мобільний додаток сам вирішує, як його парсити.

## Обмеження, свідомо прийняті за брифом

- Немає Firebase Auth — простий пароль на фронті, легко обійти технічно
  підкованій людині. Прийнятно для внутрішнього інструменту.
- `localStorage`/`sessionStorage` ніде не використовуються — стан входу в
  панель живе тільки в пам'яті React і губиться при перезавантаженні
  сторінки (свідомий вибір, а не недогляд).
- Реордер пунктів меню — кнопками вгору/вниз, без drag-and-drop (простіше,
  надійніше при кількох одночасних адмінах).
