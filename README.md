# SubTrack

SubTrack is a local-first subscription tracker built with React Native and Expo. It keeps recurring charges, free trials, renewal dates, category totals, and spending analytics in one centered dashboard.

## Run the app

```powershell
npm.cmd run start
```

Scan the QR code with Expo Go, or run `npm.cmd run android` with an Android emulator or device connected.

## Included

- Local SQLite subscription storage (no cloud account required)
- First-launch four-slide onboarding with circular illustrations
- Registration-first local authentication with persistent secure sessions
- Salted scrypt password verification, encrypted device storage, and sign-in cooldowns
- Personalized welcome-back transition for returning signed-in users
- Add, edit, search, and delete subscriptions
- Weekly, monthly, quarterly, and yearly billing cycles
- Philippine-peso summaries and annual projections
- Renewal calendar, category breakdown, and analytics
- Free-trial tracking
- One-tap 1-, 3-, and 7-day trial presets with native calendar pickers
- Dedicated free-trial creation flow with a seven-day preset and matching first billing date
- Local Android renewal notifications scheduled across upcoming billing cycles
- Animated launch, screen transitions, press feedback, and haptics
- Release minification, unused-resource shrinking, and bundle compression

Dates are entered as `YYYY-MM-DD`. Reminder permission is requested only when a subscription with reminders enabled is saved.

## Authentication scope

Authentication is local to the device. Passwords are never stored directly: SubTrack stores a salted scrypt verifier and session in Expo SecureStore. There is no bundled test account and no online password recovery or cross-device sign-in. On Android, uninstalling the app removes the local account and subscription database.
