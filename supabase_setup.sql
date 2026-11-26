-- =============================================================================
-- دفتر المكتب الضريبي المصري (v12) — إعداد قاعدة بيانات Supabase والمزامنة الفورية
-- =============================================================================

-- 1. الجدول الرئيسي للحالة الموحدة (Offline-First Single Document Sync)
CREATE TABLE IF NOT EXISTS public.tax_office_state (
  id TEXT PRIMARY KEY DEFAULT 'main_office',
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_commit_msg TEXT DEFAULT '',
  device_id TEXT DEFAULT ''
);

-- تفعيل REPLICA IDENTITY FULL لبث التغييرات الفورية عبر Supabase Realtime WebSocket
ALTER TABLE public.tax_office_state REPLICA IDENTITY FULL;

-- إضافة الجدول إلى قناة البث المباشر supabase_realtime بأمان
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tax_office_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tax_office_state;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. جدول سجل التعديلات السحابي الخفيف (Cloud Audit / Sync Commits)
CREATE TABLE IF NOT EXISTS public.tax_sync_commits (
  id BIGSERIAL PRIMARY KEY,
  commit_id TEXT NOT NULL,
  message TEXT NOT NULL,
  device_id TEXT DEFAULT '',
  clients_count INTEGER DEFAULT 0,
  tasks_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_sync_commits_created_at
  ON public.tax_sync_commits (created_at DESC, id DESC);

-- 3. تفعيل سياسات الوصول (RLS) للحساب الموثق فقط (Authenticated Only)
ALTER TABLE public.tax_office_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_sync_commits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_anon_all_tax_office_state ON public.tax_office_state;
DROP POLICY IF EXISTS allow_anon_all_tax_sync_commits ON public.tax_sync_commits;
DROP POLICY IF EXISTS allow_authenticated_all_tax_office_state ON public.tax_office_state;
DROP POLICY IF EXISTS allow_authenticated_all_tax_sync_commits ON public.tax_sync_commits;

CREATE POLICY allow_authenticated_all_tax_office_state
  ON public.tax_office_state
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY allow_authenticated_all_tax_sync_commits
  ON public.tax_sync_commits
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. دالة وTrigger التنظيف التلقائي (Auto-Pruning) للإبقاء على آخر 100 حركة فقط
CREATE OR REPLACE FUNCTION public.prune_tax_sync_commits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.tax_sync_commits
  WHERE id NOT IN (
    SELECT id
    FROM public.tax_sync_commits
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_tax_sync_commits ON public.tax_sync_commits;

CREATE TRIGGER trg_prune_tax_sync_commits
AFTER INSERT ON public.tax_sync_commits
FOR EACH STATEMENT
EXECUTE FUNCTION public.prune_tax_sync_commits();

-- 5. دالة نبضة عدم التوقف (Keep-Alive Heartbeat) لمنع خمول المشروع المجاني
CREATE OR REPLACE FUNCTION public.keep_project_alive()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  PERFORM 1 FROM public.tax_office_state LIMIT 1;
  RETURN v_now;
END;
$$;

-- 6. قصر صلاحيات الجداول على الحساب الموثق فقط (authenticated) مع إبقاء نبضة keep-alive
REVOKE ALL ON TABLE public.tax_office_state FROM anon;
REVOKE ALL ON TABLE public.tax_sync_commits FROM anon;
REVOKE ALL ON SEQUENCE public.tax_sync_commits_id_seq FROM anon;

GRANT ALL ON TABLE public.tax_office_state TO authenticated;
GRANT ALL ON TABLE public.tax_sync_commits TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.tax_sync_commits_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION public.keep_project_alive() TO anon, authenticated;

-- 7. بذر بيانات الـ 21 ممولاً المعتمدة من ملف النسخة الاحتياطية (2026-11-25)
INSERT INTO public.tax_office_state (id, state_json, updated_at, last_commit_msg, device_id)
VALUES (
  'main_office',
  '{"version":3,"seedVersion":3,"lastSaved":"2026-11-25T11:30:00.000Z","clients":[{"id":"c_1795603714840","name":"مايكل محب مرقص بطرس","office":"بنها اول","activity":"طبيب مسالك بوليه","category":"فحص ولجان وطعون","status":"قيد المتابعة","dates":[],"noticeDate":"","problem":"المناقشه عايزين نعمل بس عدد الكشوف والالاستشاره اقل مايمكن ونخلي الكشف كله اسبوعيا","action":"فحص الملف واستلام نماذج 19 والطعن عليها"},{"id":"c_1795261746684","name":"حسن يوسف محمد السيد","office":"بنها اول","activity":"قطع غيار موتوسيكلات سابقا 2022 - استثمار عقاري حاليا","category":"فحص ولجان وطعون","status":"قيد المتابعة","dates":[],"noticeDate":"","problem":"هيتعمله السجل التجاري ويتشال","action":"هيتعمله السجل التجاري ويتشال"},{"id":"c_1795261597283","name":"احمد مصطفي حسنين","office":"بنها اول","activity":"استوديو تصوير","category":"فحص ولجان وطعون","status":"قيد المتابعة","dates":[],"noticeDate":"","problem":"حكم محكمة انه مش خاضع قيمة مضافة","action":"مبقاش ينزل ليه التزامات وعايزين نشيل خانة قيمة مضافة في الساب"},{"id":"c_1795261448204","name":"الهام فتحي","office":"بنها اول","activity":"استيراد وتصدير","category":"فحص ولجان وطعون","status":"قيد المتابعة","dates":[],"noticeDate":"","problem":"والمامور عايز يفحص لحد اخر شهر","action":"تقرير فحص - قيمة مضافة"},{"id":"c1","name":"محمد صلاح","office":"مأمورية أول / مأمورية تاني","activity":"ملابس جاهزة سابقاً (مغلق) بنها ثاني  -> استثمار عقاري حالياً بنها اول","category":"فحص ولجان وطعون","status":"عاجل / طعن","dates":[],"noticeDate":"","problem":"كان بيتحاسب على ملابس جاهزة في سنوات (2013-2015) بقانون 91 وقفل النشاط. لما اتفتح له استثمار عقاري، اتحسب أولاً على مادة 3 بـ 17432 جنيه، لكن المصلحة طبقت فتوى البحوث «الإضافي يتبع الأصل» واعتبرته فحصاً إضافياً فعايزة تحاسبه بقانون 91 بضريبة 76369 جنيه.","action":"التمسك بأن الاستثمار العقاري ملف جديد برقم ومأمورية مختلفة لتثبيت ضريبة الـ 17 ألف جنيه أو تصعيده للوصول الي المطلوب"},{"id":"c2","name":"عزيزة محمد عبدالعليم","office":"فحص مع المأمور أحمد امين- بنها اول","activity":"نشاط سجاد يدوي - ملف دخل وفحص سنوات 2016 إلى 2022","category":"فحص ولجان وطعون","status":"عاجل / طعن","dates":[{"id":"d_1","label":"استلام نموذج 19/15","date":"2024-12-25","hasAppeal30":true}],"noticeDate":"2024-12-25","problem":"صدر لها نموذج 19 تم تقديم الطعن عن سنوات 2016-2022 مع المأمور أحمد امين.","action":"المطلوب مشروع لجنه داخليه عن سنوات 2016/2022"},{"id":"c3","name":"سعيد السيد سعيد حجاج","office":"محكمة / تقرير خبير وتعديل ربط","activity":"ملف محكمة عن سنوات 2015 إلى 2020","category":"فحص ولجان وطعون","status":"قيد المتابعة","dates":[],"noticeDate":"","problem":"صدر له تقرير خبير في المحكمة طبق قانون 91 فطلعت الضريبة فوق 90,000 جنيه. بعد إحضار تقرير الخبير لمعرفة أسس التقدير وحسابها على المادة 3 نزلت الضريبة إلى 32,000 جنيه فقط.","action":"تسويه الملف و احتساب مقابل التاخير"},{"id":"c4","name":"أحمد يوسف محمد السيد (أخو حسن يوسف)","office":"منظومة الساب / شعبة الحجز","activity":"نشاط متوقف (المقر مملوك لأخيه حسن يوسف)","category":"فحص ولجان وطعون","status":"عاجل / طعن","noticeDate":"","problem":"1) وصل له نموذج 19 على منظومة SAP وعدى ميعاد الـ 30 يوم فربط لعدم الطعن. 2) قفل نشاط أحمد قد يجعل المأمورية تفتح ملف «ثروة عقارية» على أخيه حسن صاحب المكان.","action":"الذهاب لمأمور الحجز لعمل محضر حجز والتوقيع عليه، ثم الطعن على محضر الحجز لفتح باب الطعن من جديد، وتقديم توقف مؤقت للثروة العقارية لحسن.","dates":[]},{"id":"c5","name":"سعد عبد المعبود معوض","office":"لجنة طعن / لجنة إنهاء المنازعات","activity":"ملف منازعات ضريبية + لجنة داخلية 2022","category":"فحص ولجان وطعون","status":"عاجل / طعن","dates":[],"noticeDate":"","problem":"كان عليه ضريبة في لجنة الطعن (مثلاً 3,000 جنيه)، فدخل لجنة إنهاء/فض المنازعات التي خفضت المبلغ كثيراً (إلى 300 جنيه)، لكن المأمورية ربطت عليه خطأً بقرار لجنة الطعن الأعلى!","action":"الجلوس مع المأمورية لتعديل الأوراد والربط بقرار لجنة فض المنازعات المخفض، ومتابعة ربط عدم طعن عن سنة 2022."},{"id":"c6","name":"سامح كندس","office":"اللجنة الداخلية المختصة (عند فواز)","activity":"ملف فحص منتهي حتى سنة 2022","category":"فحص ولجان وطعون","status":"قيد المتابعة","dates":[],"noticeDate":"","problem":"اللجنه خلصت وتم ارسال الملف تسويه لفقط لاغير وتعديل الربط\n.","action":"تسويه الملف وتعديل الربط"},{"id":"c7","name":"مسعد الحفناوي","office":"اللجنة الداخلية المختصة","activity":"ملف فحص باللجنة المختصة (نفس قصة سامح)","category":"فحص ولجان وطعون","status":"قيد المتابعة","dates":[],"noticeDate":"","problem":"نفس وضع ملف سامح باللجنة المختصة ولسه شغال قيد استكمال الإجراءات.","action":"متابعة خروج قرار اللجنة المختصة وترحيله للمأمورية للربط."},{"id":"c8","name":"كليم حزقيال","office":"مأمورية بنها أول / بنها تاني","activity":"استثمار عقاري (بنها أول) وتصرف عقاري (بنها تاني)","category":"عقارات (استثمار/تصرفات/ثروة)","status":"عاجل / طعن","noticeDate":"","problem":"فاتح استثمار عقاري في بنها أول، لكن بنها تاني حاسبته كتصرف عقاري على نفس العقار، ومذكرة الفحص كتبت «قطعة أرض» وهي «شقة» (أو العكس) بنفس المبلغ والمشتري والحدود، والمأمورية متخوفة من تعديله.","action":"مطابقة العقود بمذكرة الفحص (الاسم، الثمن، الحوض، الحدود) لإثبات سابقة المحاسبة ومنع الازدواج الضريبي.","dates":[]},{"id":"c9","name":"خالد عبد الصادق","office":"ضرائب عامة / تصرفات عقارية","activity":"بيع شقق متكرر (ظهر له 4 تصرفات عقارية)","category":"عقارات (استثمار/تصرفات/ثروة)","status":"قيد المتابعة","noticeDate":"","problem":"المشترون رفعوا دعاوى صحة توقيع بالمحكمة، وبسبب الربط الإلكتروني بين المحاكم والضرائب ظهرت 4 تصرفات على صفحته، وكثرتها ستحوله لاستثمار عقاري.","action":"الاستعلام الدوري على صفحته بالمنظومة لمعرفة التصرفات التي ظهرت فقط والتقرير عنها دون فتح عقود لم تأخذ صحة توقيع.","dates":[]},{"id":"c10","name":"إسلام صابر إبراهيم شعبان","office":"مأمورية بنها تاني","activity":"نشاط بيع قطع/عقارات (توقف في 2021)","category":"عقارات (استثمار/تصرفات/ثروة)","status":"عاجل / طعن","noticeDate":"","problem":"توقف وقفل النشاط في 2021، ثم ظهرت على صفحته تعاملات في سنة 2022 فبعتت المأمورية نماذج فحص عن 2022.","action":"تم الطعن على النماذج؛ المطلوب فحص طبيعة تعاملات 2022 وتسويتها في لجنة داخلية.","dates":[]},{"id":"c11","name":"عبد الفتاح يحيى","office":"ضرائب عامة","activity":"استثمار عقاري مسجل","category":"عقارات (استثمار/تصرفات/ثروة)","status":"قيد المتابعة","noticeDate":"","problem":"له ملف استثمار عقاري بيتحاسب عليه كتاجر، ونزلت له محاسبة منفصلة كتصرفات عقارية (2.5%).","action":"إلغاء المحاسبة كتصرفات عقارية لأن العقارات داخلة في ملف الاستثمار العقاري.","dates":[]},{"id":"c12","name":"خالد عبد الهادي","office":"ضرائب عامة","activity":"تصرفات عقارية فقط (بدون ملف استثمار)","category":"عقارات (استثمار/تصرفات/ثروة)","status":"قيد المتابعة","noticeDate":"","problem":"عليه تصرفات عقارية مسجلة وليس له ملف استثمار عقاري.","action":"المحاسبة عنها كتصرفات عقارية عادية (2.5%) وإنهاء الملف.","dates":[]},{"id":"c14","name":"د. مجدي فتحي عبد الحميد السعداني","office":"مهن حرة","activity":"طبيب (عيادة خاصة + موظف بمستشفى)","category":"توقف وورثة وأطباء","status":"عاجل / طعن","noticeDate":"","problem":"خلصت لجنته عن سنوات 2018-2021، لكن في إقراره كتب مبالغ مخصومة تحت حساب الضريبة (كسب عمل) بـ 11,250 جنيه، بينما مفردات المرتب طالع فيها خصم نحو 2,000 جنيه فقط.","action":"إحضار شهادة/إفادة رسمية من جهة عمله تثبت استقطاع الـ 11,250 جنيه تحت حساب الضريبة لاعتماد خصمها.","dates":[]},{"id":"c15","name":"د. فوزي","office":"مهن حرة","activity":"طبيب بشري","category":"توقف وورثة وأطباء","status":"منتهي","noticeDate":"","problem":"خلصت اللجنة بتاعته وتمت تسوية الملف بالكامل.","action":"استخراج واستلام ورقة التسوية النهائية فقط.","dates":[]},{"id":"c17","name":"سعد شعراوي","office":"ضرائب عامة + قيمة مضافة (SAP)","activity":"مقاولات متوقف من 2014 -> فُتح له ثروة عقارية 2023 بالخطأ","category":"توقف وورثة وأطباء","status":"عاجل / طعن","noticeDate":"","problem":"قفل المقاولات واتحاسب لحد 2014. في 2023 محامٍ قريبه ربط له على الساب وفتح نشاط «ثروة عقارية» عشان أجر مكان، فظنت القيمة المضافة أن المقاولات لسه شغالة وتطالب بمحاسبته!","action":"تم قفل الثروة العقارية على الساب بعد بيع الأرض؛ مطلوب تقديم طلب «موقف ضريبي» من الساب يثبت تسلسل القفل من 2014 لتسليمه للقيمة المضافة وحفظها.","dates":[]},{"id":"c18","name":"ورثة محمد الهيلي","office":"منظومة الساب / المأمورية","activity":"ملف ورثة (7 ورثة، تنازل 2 وبقي المستمرون)","category":"توقف وورثة وأطباء","status":"قيد المتابعة","noticeDate":"","problem":"متحاسب لحد 2021، لكن سيستم المأمورية بعت نماذج لكل الورثة بالخطأ شاملاً الورثة المتنازلين الذين لا يجب محاسبتهم.","action":"متابعة حل مشكلة السيستم بالمأمورية لاستبعاد المتنازلين، وتسجيل الطعن في أجندة المكتب (أول جلسة 27/1).","dates":[]},{"id":"c20","name":"علاء الدين","office":"ضرائب عامة","activity":"نشاط قفل ثم فتح مرة أخرى","category":"توقف وورثة وأطباء","status":"قيد المتابعة","noticeDate":"","problem":"قفل النشاط ورجع فتحه تاني ويحتاج إثبات موقفه الضريبي.","action":"استخراج شهادة موقف ضريبي / تسوية للملف.","dates":[]}],"tasks":[],"taskFilter":"OPEN","customLists":{"categories":[],"statuses":[],"taskTypes":[]}}'::jsonb,
  '2026-11-25T11:30:00.000Z'::timestamptz,
  'تثبيت بيانات الـ 21 ممولاً المعتمدة من نسخة 2026-11-25',
  'seed_v12'
)
ON CONFLICT (id) DO NOTHING;

-- 8. تحديث كاش PostgREST فوراً
NOTIFY pgrst, 'reload schema';
