# Как включить приём заказов и оплату

Это делается один раз, примерно за 40–60 минут. Ключи и пароли **никому не присылайте**, в том числе мне: вы вставляете их сами в настройках Cloudflare. Мне нужен будет только адрес программы (шаг 1.7).

Начинаем в **тестовом режиме Stripe**: деньги не списываются, заказ можно оплатить тестовой картой. Когда всё проверим, переключим на настоящие ключи (шаг 5).

---

## 1. Cloudflare: программа заказов и хранилище фото

1. Зарегистрируйтесь на **cloudflare.com** (бесплатно).
2. Слева в меню **R2 Object Storage** → включите R2. Cloudflare попросит банковскую карту, но 10 ГБ хранения бесплатно, нам этого хватит надолго.
3. **R2 → Create bucket**: имя `masaliya-siparis`, остальное не трогайте → **Create**. Хранилище закрытое, фото из него никто не увидит.
4. Слева **Workers & Pages → Create → Create Worker**: имя `masaliya-siparis` → **Deploy**. Затем **Edit code**: удалите весь текст и вставьте целиком содержимое файла `masaliya-siparis.js` (я его пришлю) → **Deploy**.
5. В этом же Worker: **Settings → Bindings → Add → R2 bucket**:
   - Variable name: `PHOTOS`
   - R2 bucket: `masaliya-siparis`
6. **Settings → Variables and Secrets → Add**. Добавьте по одной:

   | Имя | Тип | Значение |
   |---|---|---|
   | `SITE_URL` | Text | `https://masaliya.com` |
   | `OWNER_EMAIL` | Text | адрес, куда приходят заказы (тот же, что в Resend, шаг 3) |
   | `ADMIN_KEY` | Secret | длинный пароль для списка заказов, придумайте сами (20+ символов) |
   | `STRIPE_SECRET_KEY` | Secret | из шага 2.1 |
   | `STRIPE_WEBHOOK_SECRET` | Secret | из шага 2.2 |
   | `RESEND_API_KEY` | Secret | из шага 3.2 |

7. **Settings → Domains & Routes**: там адрес программы, вида `https://masaliya-siparis.ВАШЕ-ИМЯ.workers.dev`. **Пришлите мне этот адрес**: я подключу к нему сайт.
8. **Settings → Trigger events → Add → Cron trigger**: `0 3 * * *` (каждую ночь программа удаляет неоплаченные заказы старше 3 дней вместе с фото).

## 2. Stripe

1. В Stripe включите **Test mode** (переключатель вверху). **Developers → API keys → Secret key** (начинается с `sk_test_`) → скопируйте в Cloudflare как `STRIPE_SECRET_KEY`.
2. **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://masaliya-siparis.ВАШЕ-ИМЯ.workers.dev/api/stripe`
   - Events: `checkout.session.completed` и `checkout.session.async_payment_succeeded`
   - После создания откройте его и скопируйте **Signing secret** (`whsec_…`) в Cloudflare как `STRIPE_WEBHOOK_SECRET`.
3. **Settings → Payment methods**: включены карты, Apple Pay, Google Pay.
4. **Settings → Customer emails**: включите письма об успешной оплате (чек покупателю).
5. **Settings → Branding**: загрузите логотип Masaliya (`masaliya-isaret-altin.png`), цвет кнопки `#7a2434`. Так страница оплаты будет в стиле сайта.

## 3. Resend: письма о новых заказах

1. Зарегистрируйтесь на **resend.com** с тем адресом, на который хотите получать заказы. Пока свой домен не подключён, Resend отправляет письма только на адрес владельца аккаунта.
2. **API Keys → Create API Key** → скопируйте в Cloudflare как `RESEND_API_KEY`.

## 4. Проверка (вместе со мной)

Когда пришлёте адрес из шага 1.7, я подключу сайт, и вы сделаете тестовый заказ:
- карта `4242 4242 4242 4242`, любой будущий срок, любой CVC;
- после оплаты вы попадёте на страницу «Teşekkürler»;
- вам придёт письмо с заказом, адресом и тремя фото;
- заказ появится в Stripe (в тестовом режиме).

## 5. Переключение на настоящие платежи

В Stripe выключите Test mode и повторите шаги 2.1 и 2.2 уже в живом режиме. В Cloudflare замените `STRIPE_SECRET_KEY` (`sk_live_…`) и `STRIPE_WEBHOOK_SECRET` (новый `whsec_…`). Перед этим заполните данные продавца на страницах «Satış Sözleşmesi» и «KVKK».

---

## Где смотреть заказы

- **Список всех заказов:** `https://masaliya-siparis.ВАШЕ-ИМЯ.workers.dev/admin?key=ВАШ_ADMIN_KEY`. Сохраните эту ссылку в закладки и никому не давайте.
- **Письмо о каждом оплаченном заказе:** книга, имя ребёнка, набор, коробка, текст открытки, сумма, адрес, телефон, e-mail и кнопка «Siparişi ve fotoğrafları aç».
- **Stripe** (сайт и приложение): все оплаты, адреса и номер заказа (`MSL-…`) в описании платежа.
