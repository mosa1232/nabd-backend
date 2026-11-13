# نشر المنصة على Oracle Cloud (VPS مجاني)

النتيجة: المنصة تعمل 24 ساعة بلا نوم، مع قاعدة بيانات PostgreSQL على نفس السيرفر، وملفات مرفوعة دائمة، وشهادة HTTPS تلقائية، ونسخ احتياطي يومي مضغوط.

الحزمة جاهزة في هذا المستودع (`Dockerfile` و`docker-compose.yml` ومجلد `deploy/`)، وأنت تنفّذ الخطوات التالية بحسابك.

---

## 1) حساب Oracle Cloud
1. سجّل في <https://www.oracle.com/cloud/free/> (الخطة **Always Free**).
2. يطلب بطاقة دفع **للتحقق فقط**، ولا يُخصم منك شيء طالما بقيت ضمن الحدود المجانية.
3. اختر **Home Region** بعناية، فلا يمكن تغييره لاحقًا. اختر الأقرب لك (مثل Jeddah أو Dubai أو Frankfurt). الأجهزة المجانية متوفرة فقط في الـ Home Region.

## 2) إنشاء السيرفر
Compute ← Instances ← **Create instance**:
- **Image:** Ubuntu 24.04 (أو 22.04).
- **Shape:** `VM.Standard.A1.Flex` (Ampere ARM)، مثلًا **2 OCPU و12 GB** (المجاني حتى 4 OCPU و24 GB إجمالًا). إن ظهر خطأ `Out of host capacity` جرّب Availability Domain آخر، أو أعد المحاولة بعد ساعات (شائع).
- **Networking:** اترك «Assign a public IPv4 address» مفعّلًا.
- **SSH keys:** اضغط *Save private key* واحتفظ بالملف `.key` (لن يظهر ثانية).
- **Boot volume:** 50–100 GB.

بعد أن تعمل الآلة انسخ **Public IP**. الأفضل تثبيته: Networking ← IP management ← Reserved public IPs.

## 3) فتح المنافذ في لوحة Oracle (خطوة ينساها الجميع)
Networking ← Virtual cloud networks ← شبكتك ← Security Lists ← Default ← **Add Ingress Rules**:

| Source CIDR | Protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |
| `0.0.0.0/0` | UDP | `443` (اختياري، HTTP/3) |

بدونها لن يصل أحد إلى موقعك مهما كان السيرفر سليمًا. (جدار السيرفر نفسه يفتحه السكربت تلقائيًا.)

## 4) الدخول والتثبيت
من جهازك (PowerShell أو Terminal):
```bash
ssh -i مسار\الملف.key ubuntu@PUBLIC_IP
```
على السيرفر:
```bash
git clone https://github.com/mosa1232/nabd-backend.git
cd nabd-backend
bash deploy/setup-oracle.sh                 # تجربة أولى بدون دومين (HTTP على عنوان IP)
# أو مع دومين جاهز يشير إلى السيرفر:
# bash deploy/setup-oracle.sh nabd.example.com
```
السكربت يثبّت Docker، ويفتح المنافذ، ويُنشئ ملف `.env` بكلمات سر عشوائية جديدة، ويبني المنصة ويشغّلها. أول بناء يأخذ بضع دقائق. بعده افتح `http://PUBLIC_IP` في المتصفح.

## 5) الإعدادات بعد التثبيت
```bash
nano .env
```
- `BOOTSTRAP_ADMIN_EMAIL=بريدك` ← يصير مديرًا عند أول دخول (عبر Google أو بتسجيل حساب بهذا البريد).
- `ANTHROPIC_API_KEY=...` ← لتفعيل المساعد الكامل وتوليد الأسئلة من الملفات (اختياري).
- `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` ← للدخول عبر Google (اختياري).

ثم طبّق التغييرات: `sudo docker compose up -d`

## 6) الدومين وCloudflare
1. أضف الدومين في Cloudflare وغيّر الـ nameservers عند المسجّل.
2. أنشئ سجل **A** يشير إلى Public IP للسيرفر.
3. شغّل السكربت مع الدومين (أو ضع `DOMAIN=...` في `.env` ثم `sudo docker compose up -d`): سيجلب Caddy شهادة HTTPS مجانية تلقائيًا.
   - إن تعذّر إصدار الشهادة والسجل في وضع «Proxied»، اجعله **DNS only** (سحابة رمادية) حتى تصدر الشهادة ثم فعّل الوسيط.
4. في Cloudflare: SSL/TLS ← **Full (strict)**.
5. Caching ← Cache Rules: تجاوز التخزين المؤقت لمسارات `/api/*` و`/auth/*`.
6. حدّث في Google Console رابط الرجوع إلى `https://دومينك/auth/google/callback`.

## 7) التشغيل اليومي
| الأمر | وظيفته |
|---|---|
| `bash deploy/update.sh` | يسحب آخر كود من GitHub ويعيد التشغيل (ويأخذ نسخة احتياطية قبلها) |
| `sudo docker compose ps` | حالة الخدمات |
| `sudo docker compose logs app --tail 100` | سجل التطبيق |
| `sudo docker compose restart app` | إعادة تشغيل التطبيق |
| `bash deploy/restore.sh backups/ملف.sql.gz` | استعادة قاعدة البيانات من نسخة |

**النسخ الاحتياطي:** يتم تلقائيًا كل 24 ساعة في مجلد `backups/` بصيغة `.sql.gz` (تُحفظ آخر 14). لكنها على **نفس السيرفر**، فإن فُقد السيرفر فُقدت معه. انسخها خارجه بانتظام من جهازك:
```bash
scp -i مسار\الملف.key "ubuntu@PUBLIC_IP:~/nabd-backend/backups/*.gz" .
```

## 8) نقل بياناتك من Neon (اختياري)
إن كانت لديك بيانات على Neon وتريد نقلها (يشترط أن يكون النظام قد عمل مرة على الأقل ليُنشئ الجداول):
```bash
sudo docker run --rm postgres:17-alpine pg_dump --no-owner --clean --if-exists "رابط_Neon_المباشر" | gzip -9 > backups/from-neon.sql.gz
bash deploy/restore.sh backups/from-neon.sql.gz
```

## تنبيهات مهمة
- **Oracle قد يستردّ السيرفر الخامل:** في الخطة المجانية البحتة، الآلة التي يبقى استهلاكها منخفضًا جدًا لأسبوع قد تُسترد. التحويل إلى **Pay As You Go** (يبقى مجانيًا ما دمت ضمن الحدود المجانية) يمنع ذلك. وبسبب هذا الخطر نفسه احتفظ بنسخ احتياطية خارج السيرفر.
- **الأمان:** المنافذ المفتوحة 22 و80 و443 فقط، وقاعدة البيانات غير مكشوفة للإنترنت، والتحديثات الأمنية تُثبَّت تلقائيًا، و`fail2ban` يصدّ تخمين SSH. لا تنشر ملف `.key` ولا `.env` لأحد.
- **عامل واحد (worker):** مقصود، فحدود الاستخدام وفهرس البحث محفوظان في الذاكرة. يكفي لآلاف الطلاب على هذا العتاد.
- الملفات المرفوعة تُحفظ في Docker volume اسمه `uploads` وتبقى عند التحديث.
