# Egyptian Tax Office PWA (v14) Implementation & Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use user:subagent-driven-development (recommended) or user:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maintain, verify, and evolve the Offline-First Arabic RTL PWA ("دفتر المكتب الضريبي المصري", v14) with 100% deterministic local/cloud sync, tax calculation accuracy across 2005–2026, legal memo generation, and zero-build GitHub Pages + Supabase deployment.

**Architecture:** Vanilla ES6+ modular browser scripts loaded sequentially in `index.html` over a shared `window` namespace, backed by dual `localStorage` + `IndexedDB` (`EgyptianTaxOfficeDB` v2) persistence, `sw.js` (`egyptian-tax-office-pwa-v14`) cache-first asset delivery, and Supabase single-document JSONB sync (`tax_office_state`) with entity-level conflict-free merging and Realtime WebSocket updates.

**Tech Stack:** HTML5, CSS3 (Ink-Blue Ledger light/dark tokens + A4 `@media print`), Vanilla JavaScript (`'use strict'`), Service Worker API, IndexedDB, Web Notifications API, Supabase PostgREST + Realtime WebSocket, GitHub Actions, Node.js (`node --check` & `vm` sandbox tests).

**Spec:** `docs/superpowers/specs/2026-11-26-egyptian-tax-office-pwa-design.md`

## Global Constraints

- Service Worker cache key MUST remain `'egyptian-tax-office-pwa-v14'` (incremented on every asset change) and list all 14 local assets in `ASSETS`.
- No build tools, bundlers, or external runtime JS frameworks; all scripts load in `index.html` in exact order: `data.js` -> `data_refs.js` -> `app_core.js` -> `app_views.js` -> `app_calc_law91.js` -> `app_calc.js` -> `app_memo.js` -> `app_events.js` -> `app.js`.
- Seed baseline is `SEED_CLIENTS_VERSION = 3` with 21 clients in `window.DEFAULT_CLIENTS` and `SEED_EPOCH_ISO = '2026-11-25T00:00:00.000Z'`.
- All UI text is Arabic (`lang="ar" dir="rtl"`) with `Tajawal` font and `.num-tabular` (`direction: ltr; font-variant-numeric: tabular-nums`) for numeric/date values.
- Never overwrite `tax_office_state` blindly without `mergeTwoAppStates(localObj, remoteObj)` unless `forceReplaceCloud: true` is explicitly requested (full replace restore or reset to default 21 clients).

## Review Focus

- **UTC vs. Local Date Drift on 30-Day Appeal Deadlines:** `addLocalDaysToIso(dateStr, 30)` must construct local `new Date(y, m - 1, d + days)` so appeal deadlines never shift by -1 day across timezones or DST.
- **Tombstone vs. Undo/Checkout Revival Collision:** `performUndo()`, `performRedo()`, and `restoreCheckpointById(cpId)` must invoke `reviveRestoredEntities` so restored entities receive a fresh `getNextMonotonicIso()` and are purged from `appState.deletedIds`, preventing `mergeTwoAppStates` from re-deleting them on the next cloud sync.
- **Partial-Year Annualization & Exemption-Drop Cliffs in Law 91:** `calcLaw91Detailed(netProfit, { year, months, noExemption })` must annualize partial-year profit (`* 12 / months`), floor to 10 EGP, apply the exact statutory cliff (e.g., `> 600,000` drops the 40,000 exempt bracket in Law 7/2024), and prorate back (`* months / 12`).
- **In-Flight Sync Queuing & Postponement History Union:** Concurrent `syncToSupabase` calls while `isSyncInFlight === true` must queue `pendingResyncMessage` rather than dropping edits, and `mergeTwoAppStates` must union `session.history` by `fromDate->toDate` and advance `sessionDate`/`due` if `lastHist.changedAt > winner.updatedAt`.
- **Service Worker Cache Bypass for Supabase & Non-GET:** `sw.js` `fetch` handler must return immediately (without `respondWith` caching) for non-`GET` requests and any URL containing `'supabase.co'`.

---

### Task 1: Seed Data & Reference Library Integrity (`data.js`, `data_refs.js`)

**Files:**
- Inspect/Modify: `data.js`
- Inspect/Modify: `data_refs.js`
- Test: `node --check` + `vm` verification script

**Interfaces:**
- Produces: `window.SEED_CLIENTS_VERSION` (`number`), `window.DEFAULT_CLIENTS` (`Array<Client>`), `window.DEFAULT_SESSIONS` (`Array`), `window.DEFAULT_TASKS` (`Array`), `window.REFERENCE_ITEMS` (`Array<RefItem>`).

- [ ] **Step 1: Write the failing `vm` validation check**

```bash
node -e '
const fs = require("fs"), vm = require("vm");
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("data.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("data_refs.js", "utf8"), ctx);
if (ctx.window.SEED_CLIENTS_VERSION !== 3) throw new Error("Expected seed v3");
if (ctx.window.DEFAULT_CLIENTS.length !== 21) throw new Error("Expected 21 clients, got " + ctx.window.DEFAULT_CLIENTS.length);
if (ctx.window.REFERENCE_ITEMS.length !== 25) throw new Error("Expected 25 refs, got " + ctx.window.REFERENCE_ITEMS.length);
console.log("Task 1 PASS");
'
```

- [ ] **Step 2: Verify syntax of `data.js` and `data_refs.js`**

Run: `node --check data.js && node --check data_refs.js`
Expected: Exit code `0` with no syntax errors.

- [ ] **Step 3: Verify unique client IDs and required reference categories**

Ensure every entry in `DEFAULT_CLIENTS` has unique `id`, `name`, `category`, `status`, `dates` (array), and `REFERENCE_ITEMS` covers all 4 categories (`النماذج والورق الضريبي`, `القوانين والمواد الحاكمة`, `تريكات الفحص واللجان والعقارات`, `تصنيفات الساب وحلول البورتال`).

---

### Task 2: Core State, Merge Engine, Undo/Checkpoints & Notifications (`app_core.js`)

**Files:**
- Inspect/Modify: `app_core.js`
- Test: `vm` unit tests for `mergeTwoAppStates`, `reviveRestoredEntities`, `addLocalDaysToIso`, `hasTargetTimeArrived`

**Interfaces:**
- Consumes: `DEFAULT_CLIENTS`, `DEFAULT_SESSIONS` from Task 1.
- Produces: `appState`, `getNextMonotonicIso()`, `generateUniqueEntityId(prefix)`, `mergeTwoAppStates(localObj, remoteObj)`, `mergeSessionHistories(histA, histB)`, `reviveRestoredEntities(...)`, `applySnapshotStringToAppState(snapshotStr, options)`, `performUndo()`, `performRedo()`, `createLocalCheckpoint(msg, isManual)`, `restoreCheckpointById(cpId)`, `addLocalDaysToIso(dateStr, days)`, `hasTargetTimeArrived(hhmm)`, `clearNotifKeysForEntity(entityId)`, `evaluateAndFireScheduledNotifications(forceId)`, `syncToSupabase(msg, opts)`, `pullFromSupabase(isManual)`, `applyIncomingRemoteState(record)`, `initSupabaseRealtimeSocket()`.

- [ ] **Step 1: Run `vm` test for `mergeTwoAppStates`, tombstone revival, and local date math (Review Focus #1 & #2)**

```bash
node -e '
const fs = require("fs"), vm = require("vm");
const ctx = {
  window: { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } },
  document: { getElementById: () => null, querySelector: () => null, documentElement: { setAttribute: () => {} } },
  navigator: { onLine: false },
  DEFAULT_CLIENTS: [], DEFAULT_SESSIONS: []
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("app_core.js", "utf8"), ctx);

// Review Focus #1: Local date arithmetic without UTC drift
if (ctx.addLocalDaysToIso("2026-03-01", 30) !== "2026-03-31") throw new Error("addLocalDaysToIso failed");

// Review Focus #2: Tombstone prevents resurrection unless entity updatedAt > delTime
const local = { version: 3, seedVersion: 3, lastSaved: "2026-11-26T10:00:00.000Z", clients: [{ id: "c1", name: "A", updatedAt: "2026-11-25T00:00:00.000Z" }], tasks: [], deletedIds: { clients: { c1: "2026-11-26T09:00:00.000Z" }, tasks: {} }, customLists: {} };
const remote = { version: 3, seedVersion: 3, lastSaved: "2026-11-25T00:00:00.000Z", clients: [{ id: "c1", name: "A", updatedAt: "2026-11-25T00:00:00.000Z" }], tasks: [], deletedIds: { clients: {}, tasks: {} }, customLists: {} };
const merged = ctx.mergeTwoAppStates(local, remote);
if (merged.clients.length !== 0) throw new Error("Tombstone failed to suppress older client");

// Review Focus #4: Postponement history union advances sessionDate
const sLocal = { version: 3, seedVersion: 3, lastSaved: "2026-11-26T10:00:00.000Z", clients: [], tasks: [{ id: "s1", clientName: "X", sessionDate: "2026-12-01", history: [], updatedAt: "2026-11-26T10:00:00.000Z" }], deletedIds: { clients: {}, tasks: {} }, customLists: {} };
const sRemote = { version: 3, seedVersion: 3, lastSaved: "2026-11-26T11:00:00.000Z", clients: [], tasks: [{ id: "s1", clientName: "X", sessionDate: "2026-12-15", history: [{ id: "h1", fromDate: "2026-12-01", toDate: "2026-12-15", note: "مذكرة", changedAt: "2026-11-26T11:00:00.000Z" }], updatedAt: "2026-11-26T10:30:00.000Z" }], deletedIds: { clients: {}, tasks: {} }, customLists: {} };
const sMerged = ctx.mergeTwoAppStates(sLocal, sRemote);
if (sMerged.tasks[0].sessionDate !== "2026-12-15" || sMerged.tasks[0].history.length !== 1) throw new Error("Session history merge failed");
console.log("Task 2 PASS");
'
```

- [ ] **Step 2: Verify syntax of `app_core.js`**

Run: `node --check app_core.js`
Expected: Exit code `0`.

---

### Task 3: Tax Calculators Engine (`app_calc_law91.js`, `app_calc.js`)

**Files:**
- Inspect/Modify: `app_calc_law91.js`
- Inspect/Modify: `app_calc.js`
- Test: `vm` unit tests for all 5 calculators & Law 91 year brackets (2005–2026)

**Interfaces:**
- Produces: `computeProgressiveBrackets(base, brackets, noExemption)`, `calcLaw91Detailed(netProfit, options)`, `calcLaw91IndividualTax(netProfit)`, `calcArticle3Law30Tax(turnover)`, `calcLaw6Of2025Tax(turnover)`, `runInspectionCalculator()`, `runInvoiceCalculator()`, `runPayrollCalculator()`, `runRealEstateCalculator()`, `runPenaltyCalculator()`.

- [ ] **Step 1: Run `vm` test for Law 91 cliffs, partial-year proration, Article 3, and Law 6/2025 (Review Focus #3)**

```bash
node -e '
const fs = require("fs"), vm = require("vm");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("app_calc_law91.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("app_calc.js", "utf8"), ctx);

// Law 7/2024: 40,000 EGP is 0% exempt
if (ctx.calcLaw91Detailed(40000, { year: 2026, months: 12 }).tax !== 0) throw new Error("40k should be 0 tax");
// Review Focus #3: Partial year 6 months @ 350,000 -> annualized 700,000 (>600k drops 40k exempt)
const partial = ctx.calcLaw91Detailed(350000, { year: 2026, months: 6 });
if (partial.annualBase !== 700000 || partial.exemptAmount !== 0) throw new Error("Partial-year cliff failed");
// Article 3 Law 30/2023 & Law 6/2025 ceiling checks
if (ctx.calcArticle3Law30Tax(10000001).tax !== null) throw new Error("Art3 > 10M should be null");
if (ctx.calcLaw6Of2025Tax(20000000).tax !== 300000) throw new Error("Law6 @ 20M should be 300k");
if (ctx.calcLaw6Of2025Tax(20000001).tax !== null) throw new Error("Law6 > 20M should be null");
console.log("Task 3 PASS");
'
```

- [ ] **Step 2: Verify syntax of `app_calc_law91.js` and `app_calc.js`**

Run: `node --check app_calc_law91.js && node --check app_calc.js`
Expected: Exit code `0`.

---

### Task 4: Views, Legal Memo Generator, Events & App Entry (`app_views.js`, `app_memo.js`, `app_events.js`, `app.js`)

**Files:**
- Inspect/Modify: `app_views.js`, `app_memo.js`, `app_events.js`, `app.js`, `index.html`, `styles.css`

**Interfaces:**
- Consumes: `appState`, `REFERENCE_ITEMS`, `calcLaw91Detailed`, `runInspectionCalculator`, etc.
- Produces: `syncCustomDropdowns()`, `renderClients()`, `renderTasks()`, `renderAndPrintOfficeReport()`, `generateLegalMemo()`, `renderAndPrintLegalMemo()`, `renderReferenceList()`, `initEventListeners()`, `downloadBackupFile()`, `shareBackupFile()`, `executeRestore()`, `exportClientsCsv()`, `openClientModal(clientId)`, `openTaskModal(taskId)`, `openPostponeModal(sessionId)`, `switchMainTab(targetId)`.

- [ ] **Step 1: Verify all 7 memo template keys exist in `app_memo.js` and `index.html`**

Run:
```bash
node -e '
const fs = require("fs");
const memo = fs.readFileSync("app_memo.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
["APPEAL_19","APPEAL_15","ARTICLE_3","TAX_POSITION","SEIZURE_APPEAL","STOP_NOTICE","PRESCRIPTION_MEMO"].forEach(k => {
  if (!memo.includes(k) || !html.includes(k)) throw new Error("Missing memo key: " + k);
});
console.log("Task 4 memo keys PASS");
'
```

- [ ] **Step 2: Verify syntax of UI/event/entry scripts**

Run: `node --check app_views.js && node --check app_memo.js && node --check app_events.js && node --check app.js`
Expected: Exit code `0`.

---

### Task 5: Service Worker v14, Supabase Schema & Keep-Alive Workflow (`sw.js`, `manifest.json`, `supabase_setup.sql`, `.github/workflows/supabase-keepalive.yml`)

**Files:**
- Inspect/Modify: `sw.js`, `manifest.json`, `supabase_setup.sql`, `.github/workflows/supabase-keepalive.yml`

**Interfaces:**
- Produces: Service Worker `egyptian-tax-office-pwa-v14`, Supabase tables `public.tax_office_state` and `public.tax_sync_commits`, RPC `public.keep_project_alive()`, cron workflow `'0 8 */3 * *'`.

- [ ] **Step 1: Verify `sw.js` cache name, 14 `ASSETS`, and `supabase.co` bypass (Review Focus #5)**

```bash
node -e '
const fs = require("fs");
const sw = fs.readFileSync("sw.js", "utf8");
if (!sw.includes("egyptian-tax-office-pwa-v14")) throw new Error("Wrong CACHE_NAME");
if (!sw.includes("supabase.co")) throw new Error("Missing supabase.co bypass");
const files = ["index.html","manifest.json","icon.svg","styles.css","data.js","data_refs.js","app_core.js","app_views.js","app_calc_law91.js","app_calc.js","app_memo.js","app_events.js","app.js"];
files.forEach(f => { if (!sw.includes("./" + f)) throw new Error("Missing asset in sw.js: " + f); });
console.log("Task 5 PASS");
'
```

- [ ] **Step 2: Verify `sw.js` syntax and `manifest.json` validity**

Run: `node --check sw.js && node -e 'JSON.parse(require("fs").readFileSync("manifest.json","utf8")); console.log("manifest OK")'`
Expected: Exit code `0`.
