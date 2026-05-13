# Tests

This project uses [**Vitest**](https://vitest.dev) + [**React Testing
Library**](https://testing-library.com/docs/react-testing-library/intro/) +
[**jsdom**](https://github.com/jsdom/jsdom) for unit / component / UI tests.

## Run

```bash
npm test              # one-shot run
npm run test:watch    # interactive watch mode
npm run test:coverage # v8 coverage report
```

The runner is configured in `vitest.config.mjs` and pins a fake clock to
**2026-05-12** (day 12 of 31) in `tests/setup.js` so date-based math is
deterministic.

## Layout

```
tests/
├── setup.js                 # jest-dom matchers, fake clock, matchMedia stub
├── __mocks__/
│   └── next-navigation.js   # shared useRouter / usePathname mock
├── lib/                     # pure-function unit tests
│   ├── auth.test.js
│   ├── buying-pacing.test.js
│   ├── telegram.test.js
│   └── utils.test.js
└── components/              # UI component tests (render + interact)
    ├── auth/
    │   ├── LogoBadge.test.jsx
    │   └── LoginForm.test.jsx
    ├── dashboard/
    │   ├── AlertCard.test.jsx
    │   ├── AttentionAlerts.test.jsx
    │   ├── KpiCard.test.jsx
    │   ├── NetProfitHero.test.jsx
    │   ├── QuickActionsRow.test.jsx
    │   └── StorePill.test.jsx
    └── daily-sales/
        ├── StatusIndicator.test.jsx
        └── ViewModeToggle.test.jsx
```

Test files can use any of `.test.js`, `.test.jsx`, or `.test.mjs`.

## Patterns

- **Pure helpers** (`lib/*`) — import and assert on return values. Cover
  positive, negative, and edge cases (empty input, null/undefined, boundary
  values, fallbacks).
- **Components** — render with RTL, interact via `userEvent`, assert on
  visible text / roles / aria attributes. Avoid asserting on internal class
  names; prefer accessible queries (`getByRole`, `getByLabelText`,
  `getByText`).
- **Supabase / network** — mock the supabase client module (see
  `tests/lib/auth.test.js` for the pattern with `vi.mock(...)`).
- **Next.js navigation** — mock `next/navigation` inline at the top of each
  component test (see `LoginForm.test.jsx`).

## Extending

To add a test for a new feature:

1. Drop a `*.test.js` / `*.test.jsx` next to the matching code shape under
   `tests/` (mirror the source path).
2. For each behaviour cover at least:
   - the **happy path** (normal input → expected output),
   - one **negative** case (bad input → friendly error / no-op),
   - one **edge** case (empty / null / boundary / max).
3. Run `npm run test:watch` while you write; commit when green.

## Current coverage (`npm run test:coverage`)

After this round the v8 coverage report sits at ~**21% statements / 73%
branches / 61% functions** — measured against `lib/**`, `components/**`,
and `app/api/**`. The denominator is dominated by the very large page
components in `app/(app)/*/page.js` (Daily Sales is 2,000 lines on its
own); the helpers and isolated UI components are mostly at 90–100%.

### What's covered (≥ 80% lines)
- `lib/buying-pacing`, `lib/auth-check`, `lib/auth`, `lib/activity`
- `lib/shift-hours` (86%), `lib/utils` (67%)
- `components/ui/index.js` (Card, V2StatCard, Badge, V2Alert, SectionHeader)
- `components/layout/{SidebarHeader, SidebarItem, SidebarSection, MobileTopBar, MobileDrawer}` (SidebarFooter still 0%)
- `components/dashboard/{AttentionAlerts, DashboardHeader, KpiGrid, NetProfitHero, QuickActionsRow, StorePerformanceCard}`
- `components/dashboard/shared/{KpiCard, AlertCard, StorePill}`
- `components/daily-sales/{DailySalesHeader, DailySalesKpis, EntryCard, EntriesCardList, ViewModeToggle}`
- `components/daily-sales/shared/StatusIndicator`
- `components/auth/{LoginForm, LogoBadge}`
- `app/api/cron/wednesday-buying-report`

### Still uncovered — clear punch-list for the next round
- **Big lib files** with non-trivial parsing / IO: `lib/invoice-parser`,
  `lib/extract-shifts`, `lib/nrs-client`, `lib/restock-suggestions`,
  `lib/storage`, `lib/supabase-browser`, `lib/supabase-server`.
  Most of `lib/telegram` (the older `buildStoreDailySummary` /
  `buildSyncSummaryMessage` / `buildInventoryPlanningMessage` builders).
- **Components with timers / dropdowns / supabase**:
  `components/BuyingPacingCard` (self-fetches; needs `useAuth` mock),
  `components/dashboard/shared/DateRangeSegmented` (debounce timing),
  `components/dashboard/{DashboardFilters, WeeklyChartCard}`,
  `components/daily-sales/{DailySalesFilters, FiltersPopover}`,
  `components/layout/SidebarFooter` (uses ThemeToggle),
  `components/{Sidebar, AppShell, AuthProvider, ThemeToggle, NrsStatusBar,
  NRSSyncModal, ImageGallery}`.
- **Big shared `components/UI.js`**: `DataTable`, `MultiSelect`, `Modal`,
  `TrendChart`, `SmartDatePicker`, `StorePills`, `DateBar`,
  `useDateRange` etc. — testing this file alone would significantly move
  the overall %.
- **API routes** other than `wednesday-buying-report`: the rest of
  `app/api/cron/*` (`weekly-report`, `weekly-inventory-report`,
  `nrs-sync`, plus the `/test` variants), `app/api/auth/{register,
  update, delete}`, `app/api/profile`, `app/api/nrs/*`,
  `app/api/restock/*`, `app/api/telegram/*`, `app/api/warehouse-prices/*`.
- **Page components**: `app/(app)/*/page.js` are large multi-state files;
  best covered with focused integration tests (mocked Supabase) per page
  — Dashboard, Daily Sales, Purchases, Game Machines, Settings, Cash,
  Expenses, Invoices, Team, Trends, Reports, Inventory, Restock,
  Profit Take Out, Shares, Activity, Exports, Warehouse Prices, Email,
  Employee Tracking, NRS Backfill / Sync History, Compare.

### Recommendation
The fastest way to push coverage past 50% is to (a) add tests for
`components/UI.js` (huge surface area, lots of pure-ish helpers like
`useDateRange` and `getDateRange`-related logic, easy bumps), (b) test
the remaining cron + auth API routes (small files, big impact on the
denominator), and (c) write one focused page test per major page using
a mocked Supabase client.

## End-to-end (Playwright) — not yet set up

The current suite renders components in jsdom (fast, no browser). If you
want full-browser E2E for things like "sign in flow against a real Supabase
project", install Playwright:

```bash
npm i -D @playwright/test
npx playwright install
```

and add specs under `tests/e2e/`. The setup intentionally hasn't been
bundled here because it brings a few hundred MB of browser binaries.
