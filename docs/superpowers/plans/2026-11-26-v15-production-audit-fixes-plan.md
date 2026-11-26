# v15 Production Audit & AI Slop Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use user:subagent-driven-development (recommended) or user:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all verified Critical, Important, and AI-Slop findings from the 3-agent production readiness audit across Core/Sync, Tax Calculators/Memos, and UI/UX, bringing the PWA to production-grade v15.

**Architecture:** Three strictly disjoint file groups (Core & Sync, Tax & Legal, UI/UX & Styling) allow isolated per-task implementation and review without merge conflicts. All pure logic fixes are verified via Node `vm` unit tests and syntax checks (`node --check`), while CSS/HTML/DOM fixes are verified via structural assertions and headless/DOM checks.

**Tech Stack:** Vanilla ES6+ JavaScript (browser globals), HTML5, CSS3, Service Worker (`sw.js`), Supabase PostgREST + Realtime, Node.js (`vm` for testing).

**Spec:** `docs/superpowers/specs/2026-11-26-egyptian-tax-office-pwa-design.md`

## Global Constraints

- Zero external build tools or npm runtime dependencies; all JS files load as classic `<script>` tags in `index.html`.
- Keep all UI strings in formal, clear Egyptian Tax Office Arabic (no chatty Egyptian slang, no internal dev jargon like "Git المحلي", "Checkpoints", "IndexedDB", or "Supabase SQL Editor").
- Preserve single-office Anon + `OFFICE_PIN` architecture (no Supabase Auth login wall), while hardening RLS/SQL seed safety and lock-screen gating.
- Strictly enforce Egyptian tax law: Art 110 delay fee applies only to the excess over 200 EGP (`Math.max(0, principal - 200)`) with 100% cap per Law 7/2025; Law 6/2025 and Art 3 Law 30/2023 only appear for eligible years.
- Bump Service Worker cache version to `tax-office-v15` in `sw.js`.

## Review Focus

- ISO timestamp comparison between PostgREST `+00:00` and JS `.000Z` must never compare strings lexicographically; always use numeric `parseIsoMs()`.
- Undoing an entity addition (`performUndo` / `restoreCheckpointById`) must write tombstones to `appState.deletedIds` so cloud merge does not resurrect deleted items.
- Negative or `Infinity` inputs in Calculators 1–4 must clamp to `>= 0` and never produce negative taxes or `NaN%` bar widths.
- `<td class="num-tabular">` must retain `display: table-cell` so calculator and print tables do not collapse.
- Modals and `#authLockScreen` must trap focus, close on Escape/backdrop click, and restore focus on close; mobile `.toast-box` must clear bottom nav + `env(safe-area-inset-bottom)`.

---

### Task 1: Core Engine, Sync, Notifications, SW & Supabase Fixes

**Files:**
- Modify: `app_core.js`
- Modify: `app_events.js`
- Modify: `app.js`
- Modify: `sw.js`
- Modify: `supabase_setup.sql`
- Modify: `.github/workflows/supabase-keepalive.yml`
- Test: Node `vm` test script (run inline or temp `/tmp/test_task1.js`, do not commit temp test files)

**Interfaces:**
- Produces in `app_core.js`: `parseIsoMs(isoStr): number`, hardened `mergeTwoAppStates(localState, remoteState)` (pure, no mutation), `entityContentSignature(entity)` (key-order independent), `addLocalDaysToIso(isoDate, days)` (strict calendar validation, returns `null` on invalid date like `2026-02-31`), `escapeHtml(str)` (escapes `'`), `performUndo()` / `performRedo()` / `restoreCheckpointById(id)` (with tombstone recording & re-entrancy lock), `pullFromSupabase()` (with `try/finally` and safe `applyIncomingRemoteState`), `syncToSupabase(opts)` (merges `pendingResyncOpts`), `checkUpcomingNotifications()` (`markNotifKeySent` only after `sendLocalDeviceNotification` resolves truthy).
- Produces in `app.js`: `initSupabaseRealtimeSocket()` gated behind `!isAppLocked()` and ignoring `phoenix` heartbeat messages.
- Produces in `app_events.js`: `clientForm` empty `clientName` validation, null guards on `document.getElementById`, `URL.revokeObjectURL` in `exportClientsCsv`, formal Arabic toast/UI strings (removing dev jargon).
- Produces in `sw.js`: `CACHE_NAME = 'tax-office-v15'`, hostname check via `new URL(event.request.url).hostname.endsWith('supabase.co')`, offline `Response` fallback on cache+network miss.

- [ ] **Step 1: Write failing Node `vm` verification tests for Task 1**

Create `/tmp/test_task1.js` testing:
1. `parseIsoMs('2026-11-26T10:00:00.500Z') > parseIsoMs('2026-11-26T10:00:00+00:00')` (would fail lexicographically because `'+' < '.'`).
2. `mergeTwoAppStates(a, b)` does not mutate `a` or `b`, and handles `+00:00` vs `.000Z` timestamps accurately.
3. `addLocalDaysToIso('2026-02-31', 0)` returns `null` (rejects invalid calendar date rollover).
4. `escapeHtml("a'b")` returns `"a&#39;b"` (or `&#039;`).
5. `entityContentSignature({a: 1, b: 2}) === entityContentSignature({b: 2, a: 1})`.
6. `performUndo()` after adding a client writes that client's ID to `appState.deletedIds`.

- [ ] **Step 2: Run `/tmp/test_task1.js` to verify it fails on baseline code**

Run: `node /tmp/test_task1.js`
Expected: FAIL on `parseIsoMs`, `addLocalDaysToIso('2026-02-31', 0)`, `escapeHtml`, `entityContentSignature`, and `performUndo` tombstones.

- [ ] **Step 3: Implement all Task 1 fixes in `app_core.js`, `app_events.js`, `app.js`, `sw.js`, `supabase_setup.sql`, `.github/workflows/supabase-keepalive.yml`**

- In `app_core.js`: add `parseIsoMs()`, replace all ISO string `>` / `<` comparisons in merge/sync/header save time with `parseIsoMs()`, make `mergeTwoAppStates()` deep-clone inputs, sort keys in `entityContentSignature()`, validate calendar rollover in `addLocalDaysToIso()`, escape `'` in `escapeHtml()`, record `deletedIds` tombstones in `performUndo()` & `restoreCheckpointById()`, add `applySnapshotStringToAppState` check + re-entrancy guard in `performUndo()`/`performRedo()`, fix `pullFromSupabase()` `try/finally` + lock release before `applyIncomingRemoteState`, merge `pendingResyncOpts` in `syncToSupabase()`, move `markNotifKeySent()` after `await sendLocalDeviceNotification(...)`, close IDB `db.close()` on `tx.onerror`/`tx.onabort`, skip no-op undo/checkpoint push in `applyIncomingRemoteState()`.
- In `app.js`: gate `initSupabaseRealtimeSocket()` when locked (`isAppLocked()`) and ignore `phoenix` heartbeat events in `onmessage`; add `null` guards on DOM lookups.
- In `app_events.js`: validate non-empty `clientName` in `clientForm` submit, add `null` guards on `document.getElementById`, call `URL.revokeObjectURL` after CSV download, replace dev jargon in any toast/status strings.
- In `sw.js`: bump to `tax-office-v15`, check `new URL(event.request.url).hostname.endsWith('supabase.co')`, return offline `Response('', { status: 503 })` when both network and cache miss.
- In `supabase_setup.sql`: change seed `ON CONFLICT (id) DO UPDATE` to `ON CONFLICT (id) DO NOTHING`, add `SET search_path = public, pg_temp` on `SECURITY DEFINER` functions.
- In `.github/workflows/supabase-keepalive.yml`: remove `|| true` from curl command so CI catches failures.

- [ ] **Step 4: Run syntax checks and `/tmp/test_task1.js`**

Run: `node --check app_core.js && node --check app_events.js && node --check app.js && node --check sw.js && node /tmp/test_task1.js`
Expected: All syntax checks pass and all Task 1 assertions PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add app_core.js app_events.js app.js sw.js supabase_setup.sql .github/workflows/supabase-keepalive.yml
git commit -m "fix(core): harden sync timestamps, undo tombstones, notifications, sw v15, and sql seeds"
```

---

### Task 2: Tax Calculators, Memos & Legal Data Fixes

**Files:**
- Modify: `app_calc_law91.js`
- Modify: `app_calc.js`
- Modify: `app_memo.js`
- Modify: `data.js`
- Modify: `data_refs.js`
- Test: Node `vm` test script (`/tmp/test_task2.js`, do not commit)

**Interfaces:**
- Produces in `app_calc.js`: `clampNonNegNum(val): number`, DOM `null` guards in Calcs 1–4, historical year gating (`year >= 2025` for Law 6/2025, `year >= 2023` for Art 3 Law 30/2023), explicit return-tax trap line item/tag when `returnTax > best.val`, Payroll 2026 `< 2700` negative take-home warning, Art 110 delay fee on `Math.max(0, principal - 200)` with 100% cap per Law 7/2025, formal Arabic copy (no chatty slang like `هتقارن لك أوتوماتيك` or `مستقطعة مننا`), fix `"أو الوصية"` wording.
- Produces in `app_calc_law91.js`: non-negative clamping, 2017 & 2018–2019 tax credit applied even when `noExemption === true` for `annualBase <= 7200 / 8000`, Law 51/2011 (`2011-2012`) annualized corporate 10M threshold & individual `> 10M` 25% bracket.
- Produces in `app_memo.js`: `null` guard in `renderReferenceList`, `client.name || 'الممول'` fallback, `getLocalTodayIso()` instead of `new Date().toISOString().slice(0, 10)`, formal Arabic UI copy.
- Produces in `data_refs.js` & `data.js`: `id: 'r1'..'r20'` on items 1–20 in `data_refs.js`, typo fixes in `data.js`.

- [ ] **Step 1: Write failing Node `vm` verification tests for Task 2**

Create `/tmp/test_task2.js` testing:
1. Art 110 Penalty Calculator: `principal = 500`, `cbeRate = 20.5`, `months = 12`, `stage = 'APPEAL'` -> taxable base is `500 - 200 = 300`, delay fee = `Math.round(300 * 0.225 * 1) = 68` (not `113`); `principal = 200` -> `0`.
2. Negative input clamping in Calcs 1–4: negative `whtPaid`, negative `invNetAmount`, negative `salGross`, negative `reSalePrice` produce `>= 0` tax/results without `NaN%`.
3. Historical year `2018` in Income Tax Calculator does NOT display Law 6/2025 or Art 3 Law 30/2023 comparison rows.
4. `app_calc_law91.js` 2017/2018–2019 with `noExemption = true` and `annualBase = 7000` applies the statutory tax credit.
5. `data_refs.js` items 1–25 all have unique `id` (`r1..r25`).
6. `app_memo.js` generates all 21 × 7 = 147 memo combinations cleanly without `undefined` or unescaped `<script>`.

- [ ] **Step 2: Run `/tmp/test_task2.js` to verify it fails on baseline code**

Run: `node /tmp/test_task2.js`
Expected: FAIL on Art 110 `500` base (`113` vs `68`), negative inputs, historical year 2018 Law 6/2025 leak, and `data_refs.js` missing IDs `r1..r20`.

- [ ] **Step 3: Implement all Task 2 fixes in `app_calc_law91.js`, `app_calc.js`, `app_memo.js`, `data.js`, `data_refs.js`**

- [ ] **Step 4: Run syntax checks and `/tmp/test_task2.js`**

Run: `node --check app_calc_law91.js && node --check app_calc.js && node --check app_memo.js && node --check data.js && node --check data_refs.js && node /tmp/test_task2.js`
Expected: All syntax checks pass and all Task 2 assertions PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add app_calc_law91.js app_calc.js app_memo.js data.js data_refs.js
git commit -m "fix(calc,memo,data): enforce Art 110 excess-over-200 rule, clamp inputs, gate historical years, and fix refs/copy"
```

---

### Task 3: UI/UX, Accessibility, Print & AI Slop Cleanup

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app_views.js`
- Test: Node verification script (`/tmp/test_task3.js`, do not commit)

**Interfaces:**
- Produces in `styles.css`: `td.num-tabular, th.num-tabular { display: table-cell; }`, `.toast-box` mobile `bottom: calc(76px + env(safe-area-inset-bottom, 0px))`, responsive `.summary-cards-grid` on `<= 480px`, WCAG AA contrast tokens (`--ink-muted` Light, `--surface-card` Dark), mobile touch targets `>= 44px`, clean `@media print` rules, deduplicated `.memo-footer-actions` & consolidated `@media (max-width: 768px)`, dead CSS removed (`.task-meta-row`, `.task-meta-line`), dev comments (`/* Task 2 */`, `/* v12 */`) removed, search list items do not re-trigger `fadeSlideUp` on keystrokes.
- Produces in `index.html`: remove inline `style="grid-template-columns:..."` on `#view-reference .controls-grid`, add `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls` on `.calc-mode-btn`, add `dir="ltr"` on `<input type="date">`, `<input type="time">`, `#restoreJsonTextarea`, add `aria-label` on `#sessionSearchInput`, `#memoOutputArea`, `#manualCheckpointMsg`, `.custom-adder-input`, `.date-row-*`, remove stale `btnPresetAudio1/2/3` if unused, formal Arabic copy (no slang/dev jargon).
- Produces in `app_views.js`: modal focus trap + Escape/backdrop close + focus return for all 4 modals and `#authLockScreen`, remove `.num-tabular` from Arabic text in print table (`app_views.js:490`), flatten 3-level card nesting in `backupModalBackdrop`, omit noisy `بدون رقم طعن` badge when empty, formal Arabic copy (no slang like `هيوصلك إشعار` or dev jargon like `نظام Git المحلي`, `Checkpoints`, `IndexedDB`).

- [ ] **Step 1: Write failing Node structural & a11y verification script `/tmp/test_task3.js`**

Verify assertions against `index.html`, `styles.css`, and `app_views.js`:
1. `styles.css` contains `td.num-tabular` with `display: table-cell`, `env(safe-area-inset-bottom`, no `/* Task 2 */` or `/* v12 */`, no `.task-meta-row`.
2. `index.html` has no inline `grid-template-columns` on `#view-reference .controls-grid`, has `role="tab"` and `aria-selected` on `.calc-mode-btn`, has `dir="ltr"` on date/time inputs and `#restoreJsonTextarea`, has `aria-label` on `#sessionSearchInput` and `#memoOutputArea`.
3. `app_views.js` has no `بدون رقم طعن`, no `نظام Git المحلي`, no `هيوصلك إشعار`, and implements modal focus trap / Escape close.

- [ ] **Step 2: Run `/tmp/test_task3.js` to verify it fails on baseline code**

Run: `node /tmp/test_task3.js`
Expected: FAIL on all checks.

- [ ] **Step 3: Implement all Task 3 fixes in `index.html`, `styles.css`, `app_views.js`**

- [ ] **Step 4: Run syntax checks and `/tmp/test_task3.js`**

Run: `node --check app_views.js && node /tmp/test_task3.js`
Expected: All syntax checks pass and all Task 3 assertions PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add index.html styles.css app_views.js
git commit -m "fix(ui,a11y): fix table alignment, mobile responsiveness, modal focus traps, and clean AI slop copy"
```
