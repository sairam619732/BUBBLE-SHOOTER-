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

## 3. Create the app in Play Console

1. Go to https://play.google.com/console and choose **Create app**. Set the type to **Game** and pricing to **Free**.
2. Turn on **Play App Signing**. It is on by default; Google keeps the final signing key and you upload with your upload key.
3. Upload the `.aab` from the GitHub Actions artifact to **Testing → Internal testing** first. Install it on your phones and try a multiplayer match.
4. New personal developer accounts must run a **closed test** before Google grants production access. Last known requirement: at least 12 testers for 14 days. Check Play Console for the current numbers and plan for it.

## 4. Store listing (copy-paste)

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
> • Plays fully offline, with no ads and no tracking

**Graphics** (in `store/`):

- App icon: `store/play-icon-512.png`
- Feature graphic: `store/feature-graphic-1024x500.png`
- Phone screenshots: `store/screenshots/*.png` (1080×1920)

**Category:** Game → Puzzle. **Tags:** Bubble shooter, Casual, Puzzle, Multiplayer.

**Privacy policy URL:** https://github.com/sairam619732/BUBBLE-SHOOTER-/blob/main/docs/privacy-policy.md

The URL works once this branch is merged into `main`. You can also host the file anywhere public.

## 5. App content answers

- **Data safety:**
  - "Does your app collect or share any of the required user data types?" → **No**.
  - Multiplayer traffic stays on the local network and is not collected.
- **Ads:** No.
- **Content rating (IARC questionnaire):** Puzzle game, with no violence, user-generated content, chat, gambling or location sharing. Expected rating: Everyone / PEGI 3.
- **Target audience:** 13+ is simplest. If you include under-13s, the Families policy applies; the app collects no data, so that is also fine.
- **News app:** No. **Government app:** No. **Financial features:** No.

## 6. Requirements already handled

- Target API level 36 (Android 16), as Play has required since August 31, 2026. The minimum supported version is Android 7.0 (API 24).
- 64-bit: the app has no native code, so it is automatically compliant.
- Android App Bundle (`.aab`) output with R8 shrinking.
- Adaptive and themed icons, an Android 12+ splash screen, edge-to-edge, and the predictive back gesture.
- Only normal (install-time) permissions, so no runtime permission prompts.
