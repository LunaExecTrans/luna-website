# Firebase setup — Luna Executive Chauffeurs website

What you need to do in the Firebase Console to light up the auth
modules shipped in this repo. One-time task. Budget: 10 minutes.

Project ID: `luna-executive-chauffeurs`
Console URL: https://console.firebase.google.com/project/luna-executive-chauffeurs

---

## 1. Enable Realtime Database (if not already)

1. Console → **Build → Realtime Database** → **Create Database**.
2. Location: **us-central1** (keeps it colocated with the existing
   Firestore / Firebase resources — cross-region adds latency).
3. Start in **locked mode** (we will paste real rules next).

Expected DB URL once live:
`https://luna-executive-chauffeurs-default-rtdb.firebaseio.com`

This URL is already hardcoded in [firebase.js](firebase.js). If the
real URL differs (e.g. Firebase provisions you into another region
and appends a suffix), update `databaseURL` in `firebase.js` to
match before deploying.

---

## 2. Paste security rules

> ⚠️ **CRITICAL — dispatch is live.** The `database.rules.json` in
> this repo is a **merge** of the dispatch production rules
> (confirmed 2026-04-22) plus new `/reservations` and
> `/userReservations` blocks. Publishing it REPLACES the current
> rules. If the dispatch rules in the Console have drifted from
> the merge baseline, publishing will regress dispatch.
>
> **Before publishing, do this 30-second check:**
>
> 1. Open Console → **Realtime Database → Rules** tab.
> 2. Copy the current JSON into a temp file
>    (`rules-backup-YYYYMMDD.json`) — this is your rollback.
> 3. Diff it against `database.rules.json` from this repo.
>    Expect: the only differences should be the two new top-level
>    blocks at the bottom (`reservations`, `userReservations`)
>    and the inline comments (keys starting with `//`). Any other
>    diff means dispatch changed since this merge was built — stop
>    and re-merge before publishing.

Once you've confirmed the baseline matches:

1. Copy the full contents of [`database.rules.json`](database.rules.json).
2. Console → **Realtime Database → Rules** tab → paste (replacing
   the existing JSON).
3. Click **Publish**.

**Auth model recap** (dispatch convention, preserved):
- `users/{uid}/roles/owner = true` → platform admin
- `users/{uid}/roles/dispatcher = true` → dispatch operator
- Anyone else = client (no role flag needed; inferred by absence)
- Clients can read/write their own `users/{uid}` subtree (except
  `roles/`, `status/`, `active/` which are owner-only).
- Clients create their own reservations under `/reservations/{id}`
  with `userId === auth.uid`, and can self-cancel (status =
  `"cancelled"`). Dispatch has full mutation rights.
- `phoneIndex` is NOT written by client code; only owner/dispatcher
  (or future Cloud Function) maintains it.

**Rollback**: if something breaks after publish, paste
`rules-backup-YYYYMMDD.json` back into the Rules tab and Publish.

---

## 3. Enable Authentication providers

Console → **Build → Authentication → Get started** (first time)
→ **Sign-in method** tab.

### 3a. Email / Password
1. Click **Email/Password** → **Enable** (first toggle, not the
   passwordless link).
2. Save.

### 3b. Google
1. Click **Google** → **Enable**.
2. **Project public-facing name**: `Luna Executive Chauffeurs`
3. **Project support email**: `reservations@lunaexecutivechauffeurs.com`
   (or your admin gmail — whatever you prefer to show in consent).
4. Save.

### 3c. Authorized domains
Console → **Authentication → Settings → Authorized domains** tab.
Make sure the list includes:
- `localhost` (always there by default — dev)
- `lunaexecutivechauffeurs.com`
- `www.lunaexecutivechauffeurs.com`
- Your Railway preview domain (e.g. `luna-website-production.up.railway.app`)

Missing a domain here = Google sign-in popups fail with
`auth/unauthorized-domain`.

---

## 4. (Optional) Customize the password-reset email

Console → **Authentication → Templates → Password reset**.

Default template works, but the generic Firebase wording doesn't
match Luna voice. Suggested changes when you have 2 minutes:
- Subject: `Reset your Luna Executive Chauffeurs password`
- From name: `Luna Executive Chauffeurs`
- Reply-to: `reservations@lunaexecutivechauffeurs.com`

---

## 5. Quick smoke test

1. Deploy the site (or `npm run start` locally on :3000).
2. Open DevTools Console. You should see no Firebase init errors.
3. Inspect `window.LUNA_FIREBASE` — you should see `{ app, auth,
   db, googleProvider, ... }`.
4. Inspect `window.LunaAuth` and `window.LunaAccount` — both
   should be defined.
5. Once kensy's login/signup pages land, create a test account:
   - New account signup → check RTDB for `/users/{uid}` with
     the expected fields and `phoneIndex/{phone}: uid`.
   - Sign out, sign in again with same credentials.
   - Forgot password → should receive email.
   - Google signin → first time should flag `needsPhone: true`.

---

## 6. Things that are NOT set up (intentionally)

- **SMS auth / phone provider** — not needed for MVP; we use phone
  as a profile field only.
- **Analytics** — `measurementId` is in the config, but no GA4
  property is wired up yet. Harmless.
- **App Check** — next phase. Will add reCAPTCHA v3 on the signup
  endpoint before launch to rate-limit bot signups.
- **Cloud Functions** — nothing server-side required yet. All
  auth + writes are client-side within the security-rules
  envelope.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `auth/unauthorized-domain` on Google signin | Production domain missing from Auth → Settings → Authorized domains | Add the domain, wait ~30s |
| `PERMISSION_DENIED` on RTDB write at signup | Rules not pasted, or pasted but publish failed | Re-check the Rules tab, Publish |
| `Firebase: Error (auth/configuration-not-found)` | Email/Password provider not enabled | Enable in Sign-in method tab |
| `databaseURL` error in console | RTDB region differs from default | Update `firebase.js` `databaseURL` to match Console |
| Google popup opens then closes immediately | Browser blocking third-party cookies | Test in a different browser / profile; add Luna domain to cookie allowlist |

---

Owner of this doc: Tuelho (backend). Ping me if anything in the
Console UI has moved or renamed and I'll update the steps.
