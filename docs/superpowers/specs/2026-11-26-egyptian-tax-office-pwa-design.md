# وثيقة التصميم المعماري: دفتر المكتب الضريبي المصري (Egyptian Tax Office PWA — v14)

> **الحالة:** موثّق ومطابق للكود الفعلي (`v14` / `CACHE_NAME = 'egyptian-tax-office-pwa-v14'`)
> **المسار:** `github_pwa/`
> **تاريخ التوثيق:** 2026-11-26

---

## 1. الغرض والدوافع (Intent & Why)

تطبيق ويب تقدمي (**PWA**) يعمل **Offline-First** بالعربية (RTL) لإدارة العمل اليومي داخل مكتب المحاسبة والمراجعة الضريبية في مصر: متابعة ملفات الممولين (الطعون، الفحص التقديري، اللجان الداخلية ولجان الطعن، العقارات، الورثة، والتوقف)، وإدارة أجندة الجلسات وتأجيلاتها المتتالية مع تنبيهات المواعيد، وحساب الضرائب ومقابل التأخير عبر 5 حاسبات تشريعية دقيقة، وتوليد صحف الطعن والمذكرات القانونية الجاهزة للطباعة (A4)، مع حفظ مزدوج محلي (`localStorage` + `IndexedDB`) ومزامنة سحابية فورية بين الأجهزة عبر **Supabase** (`REST` + `Realtime WebSocket`).

### الأهداف (Goals)
1. **استمرارية العمل أوفلاين 100%:** فتح التطبيق وتشغيل كافة الواجهات والحاسبات والمراجع والنسخ الاحتياطي دون اتصال إنترنت عبر Service Worker (`sw.js` بإصدار `egyptian-tax-office-pwa-v14`).
2. **منع ضياع البيانات:** حفظ مزدوج في `localStorage` و`IndexedDB`، مع محرك `Undo/Redo` (30 خطوة) ونظام `Checkpoints` شبيه بـ Git (50 نقطة استرجاع) وتصدير/استرجاع `.json` و`.csv`.
3. **مزامنة متعددة الأجهزة خالية من التعارض (Conflict-Free Entity Merge):** دمج على مستوى الكيان (`client` و`session`) مع `deletedIds` tombstones، ومضاعفة `monotonicTimeCursor`، ودمج سجل تأجيلات الجلسات `history` دون فقدان أي تعديل.
4. **دقة تشريعية ومحاسبية مصرية:** تغطية شرائح القانون 91 لسنة 2005 وتعديلاته (2005–2026) بما فيها قانون 7 لسنة 2024، والمادة 3 من قانون 30 لسنة 2023، وقانون التسهيلات 6 لسنة 2025، وقانون 157 لسنة 2025 (قيمة مضافة مقاولات 14%)، وقانون 151 لسنة 2026 (تصرفات عقارية 60 يوماً)، والمادة 110 والمادة 45 مكرراً (سقف 100%) والمادة 87 مكرراً.

### غير الأهداف (Non-Goals)
- ليس نظام ERP محاسبي متكامل لإصدار الفواتير الإلكترونية أو الربط المباشر مع منظومة SAP لمصلحة الضرائب.
- لا يدعم تعدد المستخدمين بصلاحيات منفصلة (Multi-Tenant RBAC)؛ المشروع مصمم كدفتر مكتب موحد (`id = 'main_office'`).
- لا يوفر تشفيرًا برمجيًا (Client-Side Encryption) لبيانات `localStorage`/`IndexedDB` أو خادم Web Push (VAPID) مستقل حالياً.

### الأهداف المضادة (Anti-Goals)
- **عدم الاعتماد على Build Tools أو Frameworks ثقيلة:** لا `npm`، لا `Webpack/Vite`، لا `React/Vue`؛ ملفات Vanilla JS/CSS/HTML مباشرة قابلة للاستضافة الفورية على GitHub Pages.
- **عدم استبدال السجل السحابي بـ Last-Write-Wins أعمى:** يُحظر الكتابة فوق سجل `tax_office_state` دون جلب ودمج الحالة البعيدة عبر `mergeTwoAppStates` (إلا عند طلب `forceReplaceCloud: true` صراحةً).

### القيود العامة (Global Constraints)
- **إصدار الكاش:** `CACHE_NAME = 'egyptian-tax-office-pwa-v14'` في `sw.js`.
- **اتجاه الواجهة والخط:** `lang="ar" dir="rtl"` مع خط `Tajawal` (Google Fonts) وأرقام جدولية `.num-tabular` (`direction: ltr; font-variant-numeric: tabular-nums`).
- **نموذج المزامنة:** مستند واحد موحد (`tax_office_state.id = 'main_office'`) + سجل حركات خفيف (`tax_sync_commits` بحد أقصى 100 سجل عبر Trigger).
- **بذر البيانات المعتمد:** `SEED_CLIENTS_VERSION = 3` بإجمالي **21 ممولاً** في `window.DEFAULT_CLIENTS` (`data.js`).

---

## 2. البدائل المفحوصة والمعمارية المختارة

| البعد | البدائل المفحوصة | القرار المختار والسبب |
| :--- | :--- | :--- |
| **البنية الأمامية** | React/Vite SPA مقابل Vanilla JS Modules | **Vanilla JS بدون Build Step:** تشغيل فوري على GitHub Pages، كاش مباشر لكل ملف في `sw.js`، وصفر تعقيد صيانة. |
| **التخزين المحلي** | `localStorage` فقط مقابل `IndexedDB` فقط مقابل مزدوج | **حفظ مزدوج (`localStorage` + `IndexedDB`):** `localStorage` للقراءة المتزامنة السريعة عند الإقلاع، و`IndexedDB` (`EgyptianTaxOfficeDB` v2) بسعة أكبر وحماية ضد مسح المتصفح عبر `navigator.storage.persist()`. |
| **المزامنة السحابية** | جداول علائقية منفصلة (`clients`, `tasks`) مقابل مستند JSONB موحد | **Single-Document JSONB (`tax_office_state`) + `mergeTwoAppStates`:** يبقي التطبيق Offline-First بالكامل، ويسمح بمزامنة ذرية في طلب REST واحد وبث Realtime عبر قناة واحدة. |

---

## 3. هيكل الملفات وترتيب التحميل (File & Module Architecture)

تُحمَّل السكربتات في نهاية `<body>` داخل `index.html` بالترتيب الإلزامي التالي (اعتماد متبادل عبر النطاق العام `window`):

| الترتيب | الملف | الحجم التقريبي | المسؤولية الأساسية |
| :---: | :--- | :---: | :--- |
| — | `index.html` | ~56 KB | الهيكل الدلالي: شاشة القفل `#authLockScreen`، الهيدر، التبويبات الـ 4 (`#view-clients`, `#view-tasks`, `#view-calc`, `#view-reference`)، حاوية الطباعة `#printReportContainer`، والـ 4 Modals. |
| — | `styles.css` | ~41 KB | نظام التصميم Ink-Blue Ledger (`data-theme="light"` / `"dark"`)، تنسيق البطاقات، شريط التنقل السفلي للموبايل، وتنسيقات `@media print` (A4). |
| — | `manifest.json` و`icon.svg` | ~1.1 KB | بيانات PWA (`display: "standalone"`, `theme_color: "#1E3A5F"`, `background_color: "#F7F5F2"`). |
| — | `sw.js` | ~3.6 KB | Service Worker بإصدار `egyptian-tax-office-pwa-v14`، كاش الـ 14 ملفاً، معالجة `push` و`SHOW_LOCAL_NOTIFICATION` و`notificationclick`. |
| 1 | `data.js` | ~14.8 KB | تعريف `window.SEED_CLIENTS_VERSION = 3`، ومصفوفة الـ 21 ممولاً `window.DEFAULT_CLIENTS`، و`window.DEFAULT_SESSIONS = []` (`window.DEFAULT_TASKS`). |
| 2 | `data_refs.js` | ~35.4 KB | موسوعة `window.REFERENCE_ITEMS` (25 بطاقة مرجعية موزعة على 4 تصنيفات). |
| 3 | `app_core.js` | ~69.6 KB | نواة الحالة `appState`، القفل `OFFICE_PIN`، الثيم، `IndexedDB`/`localStorage`، الدمج `mergeTwoAppStates`، محرك `Undo/Redo`، محرك `Checkpoints`، محرك الإشعارات، ومزامنة Supabase (`REST` + `Realtime`). |
| 4 | `app_views.js` | ~34.2 KB | القوائم المخصصة `syncCustomDropdowns`، عرض بطاقات الممولين `renderClients`، عرض الجلسات `renderTasks`، خط زمن التأجيلات `renderSessionPostponementTimelineHtml`، وتوليد تقارير الطباعة `populatePrintOfficeReport` و`populatePrintLegalMemo`. |
| 5 | `app_calc_law91.js` | ~13.4 KB | محرك الشرائح التصاعدية `computeProgressiveBrackets`، حساب القانون 91 وتعديلاته (2005–2026) `calcLaw91Detailed`، `calcLaw91IndividualTax`، والمادة 3 `calcArticle3Law30Tax`. |
| 6 | `app_calc.js` | ~27.6 KB | حاسبة قانون 6/2025 `calcLaw6Of2025Tax`، وتشغيل الحاسبات الخمس (`runInspectionCalculator`, `runInvoiceCalculator`, `runPayrollCalculator`, `runRealEstateCalculator`, `runPenaltyCalculator`) ودوال التصفير. |
| 7 | `app_memo.js` | ~27.6 KB | مولّد المذكرات القانونية الـ 7 `generateLegalMemo` وعرض المراجع `renderReferenceList`. |
| 8 | `app_events.js` | ~40.2 KB | تهيئة كافة مستمعي الأحداث `initEventListeners` (النماذج، الفلاتر، اختصارات `Ctrl+K`/`Ctrl+Z`/`Ctrl+Y`/`Esc`، الاستيراد، التحديث الدوري كل 25 ثانية، و`beforeinstallprompt`). |
| 9 | `app.js` | ~11.5 KB | دوال النسخ الاحتياطي والمشاركة والاسترجاع (`downloadBackupFile`, `shareBackupFile`, `executeRestore`, `exportClientsCsv`)، فتح النوافذ (`openClientModal`, `openTaskModal`, `openPostponeModal`)، ونقطة الدخول `DOMContentLoaded`. |
| — | `supabase_setup.sql` | ~18.2 KB | إنشاء جدولَي `tax_office_state` و`tax_sync_commits`، تفعيل `REPLICA IDENTITY FULL` و`supabase_realtime`، سياسات RLS، Trigger التقليم، دالة `keep_project_alive()`، وبذر الـ 21 ممولاً. |
| — | `.github/workflows/supabase-keepalive.yml` | ~1.3 KB | GitHub Action مجدول كل 3 أيام (`cron: '0 8 */3 * *'`) لمنع توقف مشروع Supabase المجاني. (مكرر في الجذر كـ `keepalive_workflow.yml`). |

---

## 4. هياكل البيانات (Data Schemas)

### 4.1 الحالة الموحدة `appState`
```json
{
  "version": 3,
  "seedVersion": 3,
  "lastSaved": "2026-11-25T00:00:00.000Z",
  "clients": [],
  "tasks": [],
  "deletedIds": {
    "clients": {},
    "tasks": {}
  },
  "taskFilter": "OPEN",
  "customLists": {
    "categories": [],
    "statuses": [],
    "taskTypes": []
  }
}
```
*ملاحظة:* `SEED_EPOCH_ISO = '2026-11-25T00:00:00.000Z'` يُستخدم كطابع زمني مبدئي للبيانات المزروعة حتى تتفوق عليها أي تعديلات فعلية في المزامنة.

### 4.2 كيان الممول (`clients[]`)
| الحقل | النوع | الوصف |
| :--- | :--- | :--- |
| `id` | `string` | معرّف فريد (مثل `c1` أو `c_<timestamp>_<seq>` من `generateUniqueEntityId('c')`). |
| `name` | `string` | اسم الممول أو الشركة. |
| `office` | `string` | المأمورية المختصة (مثل `بنها اول`، `مأمورية بنها تاني`). |
| `activity` | `string` | النشاط والوضع الحالي. |
| `category` | `string` | القسم (الافتراضي من `BASE_CATEGORIES` أو قيمة مخصصة). |
| `status` | `string` | حالة المتابعة (`عاجل / طعن`، `قيد المتابعة`، `منتهي`، أو مخصصة). |
| `dates` | `Array<ClientDate>` | مصفوفة مواعيد: `{ id, label, date: "YYYY-MM-DD", time: "HH:MM" | "", hasAppeal30: boolean }`. |
| `noticeDate` | `string` | أول تاريخ غير فارغ في `dates` (يُحدَّث تلقائياً في `normalizeClientDates` للتوافق العكسي). |
| `problem` | `string` | تفاصيل المشكلة والأرقام والسنوات. |
| `action` | `string` | الإجراء المطلوب في المكتب. |
| `updatedAt` | `string` | طابع ISO رتيب (`getNextMonotonicIso()`). |

*(ملحوظة توثيقية: لا يوجد حقل `taxNumber` في الكود الفعلي ولا في نموذج `#clientForm`، بعكس ما ذُكر في المواصفة القديمة).*

### 4.3 كيان الجلسة (`tasks[]` / `sessions`)
يُطبَّع عبر `normalizeSessionItem(session)`:
- `id`: `string` (`s_<timestamp>_<seq>`)
- `clientId`: `string` (يربط بملف الممول إن وُجد، وتتحدث `clientName` تلقائياً عند تعديل اسم الممول)
- `clientName`: `string`
- `appealNum`: `string` (رقم الطعن)
- `sessionDate` و`due`: `string` (`YYYY-MM-DD`)
- `sessionTime`: `string` (`HH:MM` أو `""`)
- `details` و`title`: `string`
- `history`: `Array<{ id, fromDate, toDate, note, changedAt }>` (سجل التأجيلات المتتالية غير المحدود)
- `done`: `boolean`
- `updatedAt`: `string` (ISO)

### 4.4 شواهد الحذف (`deletedIds`) والتراجع (`undoStack`/`redoStack`) ونقاط الحفظ (`checkpointsList`)
- **`deletedIds`:** قاموس `{ clients: { [id]: isoTimestamp }, tasks: { [id]: isoTimestamp } }` لمنع عودة العناصر المحذوفة أثناء المزامنة ثنائية الاتجاه.
- **`undoStack` / `redoStack`:** بحد أقصى `MAX_UNDO_STEPS = 30` عنصر، كل عنصر `{ label, timestamp, snapshotStr }` حيث `snapshotStr` هو `JSON.stringify({ clients, tasks, deletedIds, customLists })`. يُحفظ في `UNDO_STORAGE_KEY` و`IndexedDB` (`app_state` بمفتاح `'undo_history'`).
- **`checkpointsList`:** بحد أقصى `MAX_CHECKPOINTS = 50` نقطة، كل نقطة `{ id: "cp_...", timestamp, message, isManual, clientsCount, tasksCount, snapshot }`. عند التجاوز، تحذف `pruneCheckpointsArray` أقدم نقطة تلقائية (`!isManual`) قبل المساس بالنقاط اليدوية.

---

## 5. المزامنة والدمج وإحياء الكيانات (Sync, Merge & Revival)

### 5.1 دالة الدمج `mergeTwoAppStates(localObj, remoteObj)`
1. تستدعي `sanitizeLegacySeedState` لكلا الطرفين لترقية أي نسخة أقدم من `seedVersion < 3` (تزيل `c13, c16, c19` ومهام `t1..t12` الوهمية وتثبت الـ 21 ممولاً مع الحفاظ على أي عملاء إضافيين).
2. تدمج `deletedIds.clients` و`deletedIds.tasks` بأخذ الطابع الزمني الأحدث لكل `id`.
3. **دمج الممولين (`clients`):** يُحذف أي كيان له tombstone أحدث أو مساوٍ (`delTime >= entityTime`). إذا كان الكيان أحدث من الـ tombstone (`entityTime > delTime`) يُزال الـ tombstone. عند وجود الكيان في الطرفين، يفوز صاحب `updatedAt` الأحدث.
4. **دمج الجلسات (`tasks`):** نفس قاعدة الـ tombstones، وعند وجود الجلسة في الطرفين يختار الفائز بالأحدث، ثم يدمج `history` عبر `mergeSessionHistories(lt.history, rt.history)` (اتحاد دون تكرار حسب `fromDate->toDate` مع ترجيح الإدخال ذي الملاحظة `note` أو `changedAt` الأحدث)، وإذا كان آخر `changedAt` في `history` أحدث من `winner.updatedAt` يحدّث `sessionDate` و`due` إلى `lastHist.toDate`.
5. **دمج `customLists`:** اتحاد `Set` لكل من `categories` و`statuses` و`taskTypes`.

### 5.2 إحياء الكيانات عند التراجع والاسترجاع (`reviveRestoredEntities`)
عند استدعاء `performUndo()` أو `performRedo()` أو `restoreCheckpointById(cpId)`، تُمرر `{ reviveDeleted: true }` إلى `applySnapshotStringToAppState`:
- تقارن الحالة المسترجعة بالخرائط السابقة (`prevClientsMap`, `prevTasksMap`, `prevDeletedClients`, `prevDeletedTasks`).
- أي كيان كان محذوفاً أو مفقوداً أو تغيّر توقيعه (`entityContentSignature` بدون `updatedAt`) يحصل على `updatedAt = getNextMonotonicIso()` ويُحذف من `appState.deletedIds`، مما يضمن تفوقه على السحابة وعدم مسحه في المزامنة التالية.

### 5.3 دورة المزامنة السحابية (`syncToSupabase`, `pullFromSupabase`, `applyIncomingRemoteState`, `initSupabaseRealtimeSocket`)
- **الدفع (`syncToSupabase`):**
  1. يتحقق من الاتصال (`navigator.onLine !== false`) ومن قفل التزامن `isSyncInFlight` (إذا كان مشغولاً يحفظ الطلب في `pendingResyncMessage` و`pendingResyncOpts`).
  2. يجلب السجل الحالي `GET /rest/v1/tax_office_state?id=eq.main_office` ويدمجه مع المحلي عبر `mergeTwoAppStates` ما لم يكن `forceReplaceCloud: true`.
  3. إذا أحدث الدمج تغييراً محلياً، يحفظ محلياً ويعيد الرسم ويفحص الإشعارات.
  4. يرسل `POST /rest/v1/tax_office_state?on_conflict=id` برأس `Prefer: resolution=merge-duplicates,return=minimal`.
  5. يسجل حركة في `POST /rest/v1/tax_sync_commits` (بشكل غير حاجز).
  6. عند خطأ `PGRST205` (الجدول غير منشأ بعد)، يضبط الشارة إلى `TABLE_MISSING` ويُظهر `#supabaseSetupAlertBanner`.
- **السحب (`pullFromSupabase`):** إذا كان `pendingSync === 'true'` يدفع المحلي أولاً عبر `syncToSupabase`؛ وإلا يقارن `remoteUpdatedAt` مع `appState.lastSaved` ويستدعي `applyIncomingRemoteState(remote)` إذا كان البعيد أحدث ومن جهاز مختلف.
- **الاستقبال الفوري (`initSupabaseRealtimeSocket`):** اتصال WebSocket بـ `wss://ssptmcbkrmgvalffcesp.supabase.co/realtime/v1/websocket`، يشترك في `realtime:public:tax_office_state` (`postgres_changes` `*`)، ويرسل نبضة `phoenix` كل 30 ثانية، ويعيد الاتصال تلقائياً بعد 30 ثانية عند الإغلاق. يرافقه polling احتياطي كل 25 ثانية في `app_events.js`.

---

## 6. نظام الإشعارات والمواعيد (Notification Engine)

تُقيَّم التنبيهات عبر `evaluateAndFireScheduledNotifications(forceNotifyForEntityId)` (محمية بحارس إعادة الدخول `notifEvalDepth`، وتعمل فقط إذا كان `Notification.permission === 'granted'`):
- **الجلسات (`!s.done && s.sessionDate`):** تطلق إشعاراً إذا كان الفارق `diff <= 3` أيام (اليوم، غداً، خلال 3 أيام، أو متأخرة `diff < 0`) أو عند الإجبار الفوري (`forceNotifyForEntityId === s.id`). في يوم الجلسة (`diff === 0`) تتحقق الدالة من `hasTargetTimeArrived(s.sessionTime)` (إذا تُرك الوقت فارغاً يُعتبر `00:00` أي مستحقاً فوراً).
- **مواعيد الممولين (`c.status !== 'منتهي'`):**
  - إذا كان `d.hasAppeal30 === true`: تحسب `addLocalDaysToIso(d.date, 30)` بالتقويم المحلي (لتفادي إزاحة UTC)، وتنبه عندما يكون `0 <= diffDeadline <= 7`.
  - المواعيد العادية (`!d.hasAppeal30`): تنبه عندما يكون `0 <= diffDate <= 2`.
- **منع التكرار وتنظيف المفاتيح:** تُسجل المفاتيح (`sess_...`, `client30_...`, `clientdate_...` شاملة `timeTag` و`todayIso`) في `NOTIF_LOG_KEY` (بحد أقصى 300 مفتاح). وتُمسح مفاتيح الكيان عبر `clearNotifKeysForEntity(entityId)` عند تعديله أو تأجيله أو تغيّر تاريخه عن بُعد.
- **القيود التقنية (Client-Side Limitations):** لا يوجد خادم Web Push (VAPID) نشط حالياً؛ رغم وجود مستمع `push` في `sw.js`، فإن الإشعارات المحلية تعتمد على بقاء التبويب مفتوحاً أو عودة التركيز للتطبيق (`DOMContentLoaded`, `focus`, `online`, ومؤقت الـ 25 ثانية).

---

## 7. الحاسبات الضريبية الـ 5 (`app_calc_law91.js` و`app_calc.js`)

| # | الحاسبة | الدوال الرئيسية | القوانين والسنوات المغطاة |
| :-: | :--- | :--- | :--- |
| 1 | **مقارنة الفحص التقديري** | `calcLaw91Detailed`, `calcArticle3Law30Tax`, `calcLaw6Of2025Tax`, `runInspectionCalculator` | **أفراد (2005–2026):** ق 91/2005 الأصلي (2005–2012)، ق 11/2013 (2013–2014)، ق 96/2015 (2015–2016)، ق 82/2017 (خصم ضريبي 80%/40%/5%)، ق 97/2018 (خصم 85%/45%/7.5%)، ق 26/2020 (2020–2022، معفاة 15 ألف)، ق 30/175 لسنة 2023 (معفاة 30 ألف)، ق 7/2024 (2024–2026، معفاة 40 ألف وتدرج حتى 27.5%).<br>**شركات:** 20% (<2011)، ق 51/2011 (20%/25%)، 25% (2013–2014)، 22.5% (>=2015).<br>**المقارنة:** المادة 3 ق 30/2023 (حتى 10 مليون) + ق 6/2025 (حتى 20 مليون: 0.4%–1.5%)، مع دعم الفترة الجزئية، `inspNoExemption`، كشف فخ ضريبة الإقرار الأكبر، وخصم نموذج 41. |
| 2 | **الفاتورة والخصم (41)** | `runInvoiceCalculator` | القيمة المضافة (`14%` ق 157/2025، `5%`، `0%`)، والخصم من المنبع (`1%`, `3%`, `5%`, `20%` م 56 غير مقيمين، `0%` ق 6/2025) على الصافي قبل الـ VAT، مع توليد قيد اليومية لدفاتر المشتري والبائع. |
| 3 | **كسب العمل والتأمينات 2026** | `runPayrollCalculator` | حصة العامل 11%، الشركة 18.75%، حدود الاشتراك التأميني `2,700 – 16,700` ج، الإعفاء الشخصي `20,000` ج، شرائح ق 7/2024 (صفرية `40,000` ج)، وصندوق تكريم الشهداء `0.05%`. |
| 4 | **التصرفات العقارية** | `runRealEstateCalculator` | 2.5% قطعية (م 42 ق 91/2005) مقارنةً بالاستثمار العقاري، وتنبيه مهلة الـ 60 يوماً (**قانون 151 لسنة 2026** من 29 يوليو 2026) والاستثناءات القانونية. |
| 5 | **مقابل التأخير وم 87 مكرراً** | `runPenaltyCalculator` | م 110 ق 91/2005 (`(سعر المركزي + 2%) × شهور/12`، إعفاء `<= 200` ج)، سقف 100% (م 45 مكرراً ق 7/2025)، إعفاء 30% في الاتفاق المباشر واللجنة الداخلية، والمبلغ الإضافي م 87 مكرراً (40%/20% وتنخفض للنصف قبل لجنة الطعن). |

---

## 8. مولّد المذكرات القانونية (`app_memo.js`) والمراجع (`data_refs.js`)

- **7 قوالب مذكرات (`generateLegalMemo`):** تسحب بيانات الممول وتختار أنسب تاريخ عبر `pickBestDateEntryForMemo(keywords)`، وتدعم الطباعة الرسمية A4 (`renderAndPrintLegalMemo`):
  1. `APPEAL_19`: صحيفة طعن على نموذج 19 ضرائب دخل (م 54 ق 206/2020)
  2. `APPEAL_15`: صحيفة طعن على نموذج 15 قيمة مضافة (ق 67/2016 وق 206/2020)
  3. `ARTICLE_3`: طلب المحاسبة بالمادة الثالثة (ق 30/2023) وقانون 6/2025
  4. `TAX_POSITION`: طلب شهادة موقف ضريبي تسلسلي وإثبات توقف/حفظ ملف
  5. `SEIZURE_APPEAL`: مذكرة طعن ومنازعة في محضر حجز إداري وفتح باب الطعن
  6. `STOP_NOTICE`: إخطار توقف عن النشاط (كلي/جزئي) (م 59 ق 91/2005 وم 26 ق 206/2020)
  7. `PRESCRIPTION_MEMO`: مذكرة دفع بسقوط الضريبة بالتقادم الخمسي (م 91 ق 91/2005 وم 377 مدني)
- **الموسوعة المرجعية (`window.REFERENCE_ITEMS`):** 25 مادة وقاعدة عملية بصيغتين (`legal` رسمية و`balady` بالعامية المهنية) في 4 تصنيفات: النماذج والورق الضريبي، القوانين والمواد الحاكمة، تريكات الفحص واللجان والعقارات، وتصنيفات الساب وحلول البورتال.

---

## 9. الأمان، Supabase RLS، نبضة الاستمرار، وService Worker

- **قفل الواجهة (`OFFICE_PIN`):** مقارنة نصية على العميل (`OFFICE_PIN = 'Aa12345@'`) تخزن `'UNLOCKED'` في `sessionStorage`/`localStorage` (`AUTH_KEY`) وتضبط `appShell.inert = true` عند القفل. هو قفل خصوصية للواجهة فقط وليس مصادقة خادم أو تشفير تخزين.
- **قاعدة البيانات (`supabase_setup.sql`):**
  - الجدولان `public.tax_office_state` و`public.tax_sync_commits` مفعّل عليهما RLS بسياسات مفتوحة لدورَي `anon, authenticated` (`USING (true) WITH CHECK (true)`) لعمل تطبيق المكتب مباشرة بمفتاح Anon العام.
  - Trigger `trg_prune_tax_sync_commits` يحافظ تلقائياً على آخر 100 سجل فقط في `tax_sync_commits`.
  - دالة `public.keep_project_alive()` تُستدعى عبر `.github/workflows/supabase-keepalive.yml` كل 3 أيام (`0 8 */3 * *`) لتجنب إيقاف المشروع المجاني في Supabase.
- **Service Worker (`sw.js` v14):** يخزّن الـ 14 أصلاً محلياً عند `install` ويحذف أي كاشات قديمة غير `egyptian-tax-office-pwa-v14` عند `activate`، ويطبق استراتيجية Cache-First مع تحديث خلفي للملفات الأساسية مع استثناء تام لطلبات `supabase.co` وغير `GET`.
