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
