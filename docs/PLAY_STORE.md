# Publishing on Google Play

This guide takes you from this repository to a live Play Store listing.

## 0. Choose your final app ID (do this first)

The package name is `io.github.sairam619732.bubbleshooter`, set in `android/app/build.gradle.kts` (`applicationId` and `namespace`). **It can never change after the first upload**, so change it now if you want something else. If you change `namespace`, also move the Java files to the matching folder.

The display name is in `android/app/src/main/res/values/strings.xml`.

## 1. Create an upload key (one time)

Play needs every upload signed with your private **upload key**. Run this on any computer with Java, or on Android with the Termux app (`pkg install openjdk-17`):

```bash
keytool -genkeypair -v -keystore upload-key.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Keep `upload-key.jks` and its passwords somewhere safe and private. **Never commit the key to the repository.**

## 2. Let GitHub Actions sign your builds

In GitHub, open **Settings → Secrets and variables → Actions → New repository secret** and add **one** secret:

| Name | Value |
| --- | --- |
| `ANDROID_SIGNING_KEY` | The keystore password, a colon, then the keystore in base64: `PASSWORD:BASE64`. Make the base64 part with `base64 -w0 upload-key.jks` (on macOS: `base64 -i upload-key.jks`). |

If you already have the key files from Claude (`bubble-shooter-signing-secrets.txt` + `upload-key.jks`), the text file contains the whole value on one line, ready to paste.

This one secret assumes the key alias is `upload` and the key password is the same as the keystore password, which is what the `keytool` command above sets up. If your key is different, add the four separate secrets instead: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.

### Make a release (works from your phone)

1. Either:
   - open **Actions → "Release (signed AAB for Google Play)" → Run workflow**, enter the version (e.g. `1.0.0`) and tap **Run workflow**. This button only appears once the workflow is on the `main` branch.
   - or open **Releases → Draft a new release**, type a new tag `v1.0.0`, pick the branch with the code as the target, and publish. Creating the tag starts the workflow, which attaches the signed files to that release.
2. When it finishes (about 3 minutes), open the repository's **Releases** page. Download `BubbleShooterArena-v1.0.0.aab` and upload it to Play Console. The `.apk` next to it is signed too, so you can install it directly on phones.

The release log prints your upload certificate's SHA-256 fingerprint, which you can compare with Play Console → App integrity.

The `versionCode` is the number of minutes since 2025-01-01, so it always goes up, as Play requires. The version name comes from what you type, or from the tag.

Every normal push also builds a signed `bubble-shooter-release-aab` artifact once the secret exists.

To build locally instead, create `android/keystore.properties` (it is git-ignored):

```properties
storeFile=../upload-key.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

## 3. Set up AdMob (ads)

The Android app shows two kinds of Google AdMob ads: a **rewarded video** (watch it for 5 extra shots when a level runs out of shots, once per level) and an occasional **interstitial** between games (at most one every 3 games and 3 minutes, never in the first minute or in levels 1 to 5, never during multiplayer). Until your own IDs are in place, builds show Google's test ads and the Release workflow stops with an error.

1. Sign in at https://admob.google.com with the Google account you use for Play Console and finish the account setup.
2. **Apps → Add app → Android.** When asked whether the app is on a supported app store, choose **No** for now. Name it **Bubble Shooter Arena** and copy its **App ID** (`ca-app-pub-…~…`).
3. In that app, **Ad units → Add ad unit**:
   - **Rewarded**, named "Extra shots" (reward amount 5, item "shots"). Copy its ID (`ca-app-pub-…/…`).
   - **Interstitial**, named "Between games". Copy its ID.
4. **Privacy & messaging → European regulations (GDPR) → Create message**, select the app and publish it. This is the consent form the app shows in the EEA, the UK and Switzerland. Players can reopen it from **Settings → Ad choices**.
5. Put the three IDs in `android/gradle.properties`:
   ```properties
   admobAppId=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
   admobRewardedId=ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
   admobInterstitialId=ca-app-pub-XXXXXXXXXXXXXXXX/WWWWWWWWWW
   ```
   These IDs are not secret (they ship inside the app), so they can be committed. Then run the Release workflow with a new version, for example `1.1.0`.
6. Once the app is live on Google Play, open it in AdMob → **App settings → Add app store details** to link the listing. AdMob reviews the app before it serves full ads, so expect few ads at first.

Never tap your own live ads. Debug builds always use test ad units for that reason.

## 4. Create the app in Play Console

1. Go to https://play.google.com/console and choose **Create app**. Set the type to **Game** and pricing to **Free**.
2. Turn on **Play App Signing**. It is on by default; Google keeps the final signing key and you upload with your upload key.
3. Upload the `.aab` from the GitHub Actions artifact to **Testing → Internal testing** first. Install it on your phones and try a multiplayer match.
4. New personal developer accounts must run a **closed test** before Google grants production access. Last known requirement: at least 12 testers for 14 days. Check Play Console for the current numbers and plan for it.

## 5. Store listing (copy-paste)

**App name:** Bubble Shooter Arena

**Short description (max 80 chars):**
> Pop bubbles in 200 levels, endless arcade, and Wi-Fi battles with friends!

**Full description:**
> Aim, bounce and pop! Bubble Shooter Arena is a bubble shooter with three ways to play:
>
> 🎯 LEVELS: 200 puzzles across 10 worlds, from Candy Meadow to Cosmic Core. Clear every bubble before you run out of shots and earn up to 3 stars. Later worlds add stones and a dropping steel ceiling!
>
> ⚡ ARCADE: rows keep dropping and the speed keeps rising. How long can you survive?
>
> 👥 MULTIPLAYER: battle up to 3 friends on the same Wi-Fi or phone hotspot. No internet or account needed. One phone hosts and everyone plays. Every drop and combo sends bubbles to your rivals. Last one standing wins! Practice against CPU players anytime.
>
> ✨ Features
> • Aim guide with bank-shot preview
> • Bombs and rainbow bubbles from big combos
> • Satisfying chain pops, haptics and music
> • Color-blind friendly symbols
> • Plays offline, no account needed

**Graphics** (in `store/`):

- App icon: `store/play-icon-512.png`
- Feature graphic: `store/feature-graphic-1024x500.png`
- Phone screenshots: `store/screenshots/*.png` (1080×1920)

**Category:** Game → Puzzle. **Tags:** Bubble shooter, Casual, Puzzle, Multiplayer.

**Privacy policy URL:** https://github.com/sairam619732/BUBBLE-SHOOTER-/blob/main/docs/privacy-policy.md

The repository is public, so this link opens for everyone. You can also host the file anywhere public.

## 6. App content answers

- **Ads:** **Yes, my app contains ads.**
- **Advertising ID:** **Yes**, the app uses it (through the Google Mobile Ads SDK) for **Advertising or marketing**, **Analytics** and **Fraud prevention, security and compliance**.
- **Data safety:** the game itself collects nothing, but the Google Mobile Ads SDK does, so the answers come from Google's guidance for its SDK: search for "Google Mobile Ads SDK Play data disclosure" on developers.google.com and check it when you fill in the form, because Google updates it. At the time of writing it covers:
  - "Does your app collect or share any of the required user data types?" → **Yes**.
  - **Location → Approximate location** (estimated from the IP address).
  - **App activity → App interactions** (ad views and taps).
  - **App info and performance → Crash logs, Diagnostics, Other app performance data.**
  - **Device or other IDs → Device or other IDs** (the advertising ID).
  - Purposes: **Advertising or marketing**, **Analytics**, **Fraud prevention, security and compliance**.
  - Data is encrypted in transit: **Yes**. Multiplayer traffic stays on the local network and is not collected.
- **Content rating (IARC questionnaire):** Puzzle game, with no violence, user-generated content, chat, gambling or location sharing. Expected rating: Everyone / PEGI 3. Ads in the app are limited to a PG rating.
- **Target audience:** **13 and over** (not designed for children). Including under-13s would bring the Families policy and child-directed ad settings.
- **News app:** No. **Government app:** No. **Financial features:** No.

## 7. Requirements already handled

- Target API level 36 (Android 16), as Play has required since August 31, 2026. The minimum supported version is Android 7.0 (API 24).
- 64-bit: the app has no native code, so it is automatically compliant.
- Android App Bundle (`.aab`) output with R8 shrinking.
- Adaptive and themed icons, an Android 12+ splash screen, edge-to-edge, and the predictive back gesture.
- Only normal (install-time) permissions, so no runtime permission prompts.
