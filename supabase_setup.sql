-- =============================================================================
-- دفتر المكتب الضريبي المصري — إعداد قاعدة بيانات Supabase وحماية الباقة المجانية
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

-- 3. تفعيل سياسات الوصول (RLS) لمفتاح Anon الخاص بتطبيق المكتب
ALTER TABLE public.tax_office_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_sync_commits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tax_office_state' AND policyname = 'allow_anon_all_tax_office_state'
  ) THEN
    CREATE POLICY allow_anon_all_tax_office_state
      ON public.tax_office_state
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tax_sync_commits' AND policyname = 'allow_anon_all_tax_sync_commits'
  ) THEN
    CREATE POLICY allow_anon_all_tax_sync_commits
      ON public.tax_sync_commits
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 4. دالة وTrigger التنظيف التلقائي (Auto-Pruning) للإبقاء على آخر 100 حركة فقط
-- يضمن عدم تراكم البيانات أبداً وبقاء حجم قاعدة البيانات أقل من بضعة ميجابايتات من الـ 500MB المجانية
CREATE OR REPLACE FUNCTION public.prune_tax_sync_commits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  PERFORM 1 FROM public.tax_office_state LIMIT 1;
  RETURN v_now;
END;
$$;

-- محاولة تفعيل وجدولة pg_cron داخلياً (إن كان متاحاً في المشروع) كل 3 أيام
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'egyptian-tax-office-keepalive',
      '0 8 */3 * *',
      $cron$SELECT public.keep_project_alive();$cron$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron is not enabled on this instance; use keepalive_workflow.yml GitHub Action instead.';
END $$;

-- 6. منح الصلاحيات الصريحة لدور anon و authenticated لضمان عمل REST API و RPC دون أخطاء صلاحيات
GRANT ALL ON TABLE public.tax_office_state TO anon, authenticated;
GRANT ALL ON TABLE public.tax_sync_commits TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.tax_sync_commits_id_seq TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.keep_project_alive() TO anon, authenticated;
