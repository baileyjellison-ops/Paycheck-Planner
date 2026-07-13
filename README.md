# PayDay v1.8.7

PayDay is a local-first paycheck and bill planning web app. This build includes a refined responsive interface with bottom mobile navigation, card-based mobile tables, larger touch targets, and improved visual hierarchy.

## Run it

1. Extract the ZIP.
2. Open `index.html` in a modern browser.

For full offline/PWA support, serve the folder with a small local web server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Included features

- Dashboard with financial status
- Paycheck planner with base and extra income
- Bill tracking with paid/due/overdue states
- Priority-based waterfall summary
- Monthly paycheck and bill view
- Debt tracker
- Savings goals
- Reports
- JSON backup/import
- CSV bill export
- Local browser storage
- Offline service worker
- Responsive HMI-inspired interface

## Budget rules

Defaults:
- $100 savings buffer per paycheck
- $150 leftover cash per paycheck
- Biweekly pay schedule
- Rent planning one month in advance

These can be changed in Settings.

## Data privacy

All app data is stored locally in your browser using `localStorage`. No account, cloud service, or external API is used.
