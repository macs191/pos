# سوقي — Supermarket POS SaaS

تطبيق Web يعمل كتطبيق Android قابل للتثبيت عبر PWA، ومخصص لنقاط البيع وإدارة المتجر باللغة العربية وواجهة RTL.

## المميزات

- تسجيل وإنشاء حساب بالبريد وكلمة المرور عبر **Firebase Authentication**.
- بدء مجاني لمدة 15 يومًا لكل متجر جديد، مع تحكم Super Admin في الاشتراك والحالة وتاريخ الانتهاء.
- كتالوج منتجات عالمي مشترك بين جميع المتاجر؛ كل منتج مرتبط بباركود وسعر، بلا ميزان أو كميات مخزون.
- إرسال تغييرات أسعار المنتجات الموجودة إلى قائمة مراجعة مدير الموقع قبل نشر السعر الجديد للجميع.
- تخزين المتاجر والمستخدمين والفواتير وسجلات التدقيق في **Firebase Realtime Database**.
- كاميرا الهاتف تعمل على شاشة نقطة البيع للقراءة المستمرة للمنتجات، مع طابور سريع لا يسقط المسحات المتتابعة.
- عند حفظ الفاتورة، يُنطق الإجمالي بالعربية عبر Speech Synthesis عند دعم المتصفح.
- مسح مستمر في قسم المنتجات: قراءة الباركود تفتح نافذة إضافة الاسم والسعر، ثم تعود الكاميرا تلقائيًا؛ المنتجات الجديدة تظهر عالميًا.
- لوحة Super Admin تعرض المنتجات العامة وتعديلها، طلبات اعتماد الأسعار، المتاجر، الحسابات، الأدوار، وحالة الاشتراكات وإحصاءات المدفوع وغير المدفوع.
- تصميم Android-first، وضع مستقل، manifest، service worker، تنقل سفلي للهاتف وsafe-area.

## بنية التخزين والأمان

المتصفح يستخدم Firebase Web SDK لتسجيل الدخول ويرسل Firebase ID token إلى API. يتحقق الخادم من الرمز عبر Firebase Admin SDK، وتُنفذ كل عمليات قاعدة البيانات بصلاحية الخدمة. لا يقرأ العميل بيانات المنصة ولا يكتب فيها مباشرة.

قواعد Realtime Database في [`database.rules.json`](database.rules.json) ترفض الوصول المباشر من العملاء. صلاحيات Firebase Admin سرية وخادمية فقط.

يتطلب الخادم `FIREBASE_SERVICE_ACCOUNT_JSON` (أو Google Application Default Credentials في البيئة المناسبة) مع `FIREBASE_DATABASE_URL` و`FIREBASE_PROJECT_ID`. لا تضع ملف الحساب أو مفتاحه في Git أو في متغيرات `VITE_*`.

## متغيرات Vercel المطلوبة

### إعدادات المتصفح العامة

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

### إعدادات التطبيق العامة

```text
FIREBASE_DATABASE_URL
FIREBASE_PROJECT_ID
FIREBASE_SERVICE_ACCOUNT_JSON # سر خادمي: JSON حساب خدمة Firebase في سطر واحد، لا تضعه في Git أو متغيرات VITE_
OWNER_EMAIL              # اختياري لترقية الحساب المحدد إلى SUPER_ADMIN
OWNER_OPEN_ID            # اختياري للتوافق
```

إعدادات الويب `VITE_FIREBASE_*` ليست أسرارًا. `FIREBASE_SERVICE_ACCOUNT_JSON` سر كامل الصلاحية: خزّنه في Vercel Project Settings → Environment Variables فقط، وأعد النشر بعد إضافته.

## إعداد Firebase

1. فعّل Email/Password من Firebase Console → Authentication → Sign-in method.
2. أضف نطاق Vercel إلى Authentication → Settings → Authorized domains.
3. أنشئ Realtime Database في نفس المشروع.
4. أنشئ حساب خدمة من Firebase Console → Project settings → Service accounts، ثم خزّن JSON كمتغير خادمي `FIREBASE_SERVICE_ACCOUNT_JSON`، مع `FIREBASE_DATABASE_URL` و`FIREBASE_PROJECT_ID`.

تأكد من نشر القواعد الموجودة في `database.rules.json`؛ وهي تمنع وصول Firebase Web SDK مباشرة، بينما يستخدم الخادم Firebase Admin SDK بصلاحيات حساب الخدمة.

5. أضف متغيرات `VITE_FIREBASE_*` العامة إلى بيئة البناء، والمتغيرات الخادمية المذكورة أعلاه إلى إعدادات Vercel ثم أعد النشر.

## الدخول إلى لوحة Super Admin

الحساب الذي يطابق `OWNER_EMAIL` الموثق في Firebase (أو `OWNER_OPEN_ID`) يصبح `SUPER_ADMIN`. أنشئ الحساب في Firebase Authentication وسجّل دخوله؛ ينشئ الخادم ملف المتجر والمستخدم. إذا بقي حساب قديم بلا `supermarketId`، أعد تسجيل الدخول ليُصلح الربط تلقائيًا.

يمكن لـ Super Admin:

- مشاهدة مؤشرات المتاجر والمستخدمين والمنتجات والفواتير والاشتراكات المدفوعة وغير المدفوعة.
- تفعيل أو تعطيل المستخدمين وتعديل أدوارهم.
- تغيير حالة الاشتراك وتاريخ الانتهاء.
- تعديل بيانات المتاجر والمنتجات العامة، وتعطيل المنتج أو تفعيله.
- مراجعة طلبات تغيير الأسعار واعتمادها أو رفضها.

## الاستخدام على Android

افتح رابط HTTPS في Chrome على الهاتف، ثم اختر **Add to Home screen / تثبيت التطبيق**. بعد التثبيت يفتح التطبيق بوضع مستقل. بعد تسجيل الدخول، افتح **نقطة البيع**؛ تُفعّل الكاميرا الخلفية ويستمر المسح. اسمح للكاميرا والميكروفون عند استخدام الميزات الصوتية.

الكاميرا تحتاج HTTPS وصلاحية المتصفح. إذا لم يدعم المتصفح Web Speech API، يبقى إدخال الباركود النصي والكاميرا متاحين.

## أوامر صوتية أمثلة

- «اعمل فاتورة جديدة».
- «مياه معدنية بخمسة».
- «شيبسي بالطماطم عدد ثلاثة».
- «احفظ».

ومن شاشة المنتجات، اضغط «إضافة منتج / مسح باركود». عند وجود الباركود يُعرض سعره، ويمكن إرسال سعر مقترح للموافقة؛ وعند عدم وجوده أدخل الاسم والسعر فقط. بعد الحفظ تعود الكاميرا تلقائيًا.

## التطوير والاختبار

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm dev
```

الاختبارات تشمل تسجيل الخروج ومنطق السلة والإجمالي. اتصال Firebase Admin الفعلي يحتاج متغيرات الخدمة السرية الموثقة أعلاه.

## النشر على Vercel

- أمر التثبيت: `pnpm install --frozen-lockfile`
- أمر البناء: `pnpm build`
- مجلد الإخراج: `dist/public`
- **Root Directory:** اتركه فارغًا أو اجعله جذر المستودع الذي يحتوي `package.json` و`vercel.json` و`api/`؛ لا تختَر `client`.
- ملفات API: `api/index.ts` و`api/[...path].ts` و`api/trpc/[...path].ts`
- بعد إضافة المتغيرات، نفّذ Redeploy من تبويب Deployments؛ متغيرات `VITE_*` تُضمَّن أثناء البناء ولا تظهر بأثر رجعي في Deployment قديم.
- للتحقق من نشر API، يجب أن يعيد `POST /api/trpc/auth.me` استجابة tRPC، وليس `404 NOT_FOUND`.
- لا تستخدم `SUPABASE_*` أو `POSTGRES_*` لهذا الإصدار؛ التخزين والتوثيق أصبحا Firebase بالكامل.

### تحميل ملف البيئة في الاختبار

تستدعي ملفات `api/index.ts` و`api/trpc/[...path].ts` `dotenv/config` عند بدء التشغيل، لذلك تُقرأ قيم ملف `.env` الموجود في جذر المشروع تلقائيًا في بيئة اختبار تتيح تضمينه. في Vercel تُقرأ القيم من بيئة Function إذا لم يكن ملف `.env` موجودًا. لا تُضمّن قيم Service Account الحقيقية في هذا المستودع؛ استخدم قالب `.env.template` للمتغيرات فقط.
