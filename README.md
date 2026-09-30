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

الخادم فقط يتصل بـ Firebase Admin SDK. المتصفح يستخدم Firebase Authentication للحصول على ID token ويرسله إلى tRPC، وكل عمليات البيانات تمر عبر Express/tRPC مع عزل `supermarketId` والصلاحيات.

قواعد Realtime Database في [`database.rules.json`](database.rules.json) تمنع القراءة والكتابة المباشرة من المتصفح؛ هذا مقصود لأن الخادم هو طبقة الوصول الوحيدة.

لا تضع أبدًا `FIREBASE_PRIVATE_KEY` أو Service Account JSON أو أي كلمة مرور في GitHub أو في كود المتصفح. إعدادات `VITE_FIREBASE_*` العامة فقط يمكن أن تصل للواجهة، أما مفاتيح `FIREBASE_*` الخاصة فتوضع في Vercel Environment Variables.

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

### إعدادات الخادم السرية

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_DATABASE_URL
OWNER_EMAIL              # اختياري لترقية الحساب المحدد إلى SUPER_ADMIN
OWNER_OPEN_ID            # اختياري للتوافق
JWT_SECRET               # مطلوب لجلسة Express القديمة/المساندة
```

`FIREBASE_PRIVATE_KEY` يجب أن يكون كاملًا بصيغة PEM، ويُحفظ في Vercel كقيمة سرية. إذا كان محفوظًا كسطر واحد فيجب أن يحتوي على `\\n` بين الأسطر؛ التطبيق يحولها تلقائيًا إلى أسطر PEM.

## إعداد Firebase

1. فعّل Email/Password من Firebase Console → Authentication → Sign-in method.
2. أضف نطاق Vercel إلى Authentication → Settings → Authorized domains.
3. أنشئ Realtime Database في نفس المشروع.
4. طبّق قواعد [`database.rules.json`](database.rules.json)، أو اجعل القواعد مكافئة لـ:

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

5. أضف متغيرات Vercel السابقة إلى **Production وPreview** ثم أعد النشر.
6. لا تضع Service Account JSON في المستودع. الاختبار `server/firebase.config.test.ts` يتحقق من اتصال Admin بالـ Realtime Database دون حفظ بيانات الاعتماد في الملفات.

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
- ملفات API: `api/index.ts` و `api/[...path].ts`
- لا تستخدم `SUPABASE_*` أو `POSTGRES_*` لهذا الإصدار؛ التخزين والتوثيق أصبحا Firebase بالكامل.
