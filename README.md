# SubTrack

SubTrack is a local-first subscription tracker built with React Native and Expo. It keeps recurring charges, free trials, renewal dates, category totals, and spending analytics in one centered dashboard.

## Run the app

```powershell
npm.cmd run start
```

Scan the QR code with Expo Go, or run `npm.cmd run android` with an Android emulator or device connected.

## Included

- Local SQLite persistence (no account required)
- Add, edit, search, and delete subscriptions
- Weekly, monthly, quarterly, and yearly billing cycles
- Philippine-peso summaries and annual projections
- Renewal calendar, category breakdown, and analytics
- Free-trial tracking
- Local Android renewal notifications scheduled across upcoming billing cycles
- Animated launch, screen transitions, press feedback, and haptics

Dates are entered as `YYYY-MM-DD`. Reminder permission is requested only when a subscription with reminders enabled is saved.
