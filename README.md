# سوقي — Supermarket POS SaaS

تطبيق Web يعمل كتطبيق Android قابل للتثبيت عبر PWA، ومخصص لنقاط البيع وإدارة المتجر باللغة العربية وواجهة RTL.

## المميزات

- تسجيل وإنشاء حساب بالبريد وكلمة المرور عبر **Firebase Authentication**.
- بدء مجاني لمدة 15 يومًا لكل متجر جديد، مع تحكم Super Admin في الاشتراك والحالة وتاريخ الانتهاء.
- تخزين كامل للمتاجر، المستخدمين، المنتجات، العملاء، الفواتير، المخزون، الحركات وسجلات التدقيق في **Firebase Realtime Database**.
- ربط المنتجات داخل المتجر بالباركود؛ المسح المتكرر لنفس المنتج يزيد الكمية بدل إنشاء سطر جديد.
- كاميرا الهاتف تعمل على شاشة نقطة البيع للقراءة المستمرة للمنتجات، مع طابور سريع لا يسقط المسحات المتتابعة.
- عند حفظ الفاتورة، يُنطق الإجمالي بالعربية عبر Speech Synthesis عند دعم المتصفح.
- إضافة وتعديل المنتجات بالباركود، والبحث الصوتي العربي عن اسم المنتج وسعره وكميته.
- لوحة Super Admin لإدارة المستخدمين، الأدوار، تفعيل الحسابات، المتاجر، الاشتراكات، المنتجات، الأقسام وحالات الفواتير.
- تصميم Android-first، وضع مستقل، manifest، service worker، تنقل سفلي للهاتف وsafe-area.

## بنية التخزين والأمان

المتصفح يستخدم Firebase Web SDK لتسجيل الدخول، ثم يرسل Firebase ID token إلى طبقة REST/tRPC. تُحفظ هوية المستخدم في `profiles/{uid}`، وتُربط بياناته بالـ UID والمتجر والاشتراك.

قواعد Realtime Database في [`database.rules.json`](database.rules.json) تتحقق من UID المصادق عليه. لا يستخدم هذا الإصدار Firebase Admin أو Service Account.

يستخدم هذا الإصدار إعدادات Firebase Web العامة `VITE_FIREBASE_*` فقط؛ لا توجد حاجة إلى `FIREBASE_PRIVATE_KEY` أو `FIREBASE_CLIENT_EMAIL` أو أسرار Admin.

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
VITE_FIREBASE_DATABASE_URL
OWNER_EMAIL              # اختياري لترقية الحساب المحدد إلى SUPER_ADMIN
OWNER_OPEN_ID            # اختياري للتوافق
```

لا توجد مفاتيح Service Account أو قيم PEM في هذا الإصدار.

## إعداد Firebase

1. فعّل Email/Password من Firebase Console → Authentication → Sign-in method.
2. أضف نطاق Vercel إلى Authentication → Settings → Authorized domains.
3. أنشئ Realtime Database في نفس المشروع.
4. طبّق قواعد [`database.rules.json`](database.rules.json) من Firebase CLI؛ فهي تسمح للمستخدم المصادق عليه بالوصول وتقيّد `profiles/{uid}` بمالك UID.

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "profiles": {
      "$uid": {
        ".read": "auth.uid === $uid",
        ".write": "auth.uid === $uid"
      }
    }
  }
}
```

5. أضف متغيرات `VITE_FIREBASE_*` العامة إلى بيئة البناء ثم أعد النشر.
6. لا تحتاج إلى Service Account JSON أو متغيرات Firebase Admin.

## الدخول إلى لوحة Super Admin

الحساب الذي يطابق `OWNER_EMAIL` يصبح `SUPER_ADMIN` عند أول دخول. يجب أن يكون الحساب موجودًا في Firebase Authentication أولًا، ثم يسجل دخوله مرة واحدة حتى ينشئ الخادم سجل المتجر والمستخدم. بعد ذلك تظهر شاشة **الإدارة العليا** في القائمة.

يمكن لـ Super Admin:

- مشاهدة مؤشرات المتاجر والمستخدمين والمنتجات والفواتير.
- تفعيل أو تعطيل المستخدمين وتعديل أدوارهم.
- تغيير حالة الاشتراك وتاريخ الانتهاء.
- تعطيل المنتجات وتعديل حالات الفواتير.

## الاستخدام على Android

افتح رابط HTTPS في Chrome على الهاتف، ثم اختر **Add to Home screen / تثبيت التطبيق**. بعد التثبيت يفتح التطبيق بوضع مستقل. بعد تسجيل الدخول، افتح **نقطة البيع**؛ تُفعّل الكاميرا الخلفية ويستمر المسح. اسمح للكاميرا والميكروفون عند استخدام الميزات الصوتية.

الكاميرا تحتاج HTTPS وصلاحية المتصفح. إذا لم يدعم المتصفح Web Speech API، يبقى إدخال الباركود النصي والكاميرا متاحين.

## أوامر صوتية أمثلة

- «اعمل فاتورة جديدة».
- «مياه معدنية بخمسة».
- «شيبسي بالطماطم عدد ثلاثة».
- «احفظ».

ومن شاشة المنتجات، امسح باركودًا جديدًا ثم قل الاسم والسعر و«احفظ». يمكن دائمًا استخدام الكتابة كبديل.

## التطوير والاختبار

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm dev
```

الاختبارات تشمل تسجيل الخروج، منطق السلة والإجمالي، واختبار اتصال Firebase Admin بالـ Realtime Database. الاختبار الأخير يحتاج متغيرات Firebase السرية الصحيحة.

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
