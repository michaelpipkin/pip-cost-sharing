# Android Studio Setup Guide

This document details the steps required to build and run the PipSplit Android app in Android Studio.

## Prerequisites

- Android Studio installed (latest stable version recommended)
- Java 21 installed and configured
- pnpm installed globally
- Project cloned and dependencies installed (`pnpm install`)

---

## Step 1: Build the Angular Project

Before syncing with Capacitor, build the Angular project:

```bash
ng build
```

---

## Step 2: Sync Capacitor

Sync the web assets and native plugins to the Android project:

```bash
npx cap sync android
```

### Troubleshooting: tar Package Error

If you encounter this error during `cap sync`:
```
TypeError: Cannot read properties of undefined (reading 'extract')
```

This is caused by a tar package version mismatch. The Capacitor CLI requires tar@6 (which has a `default` export), but tar@7 has a different API.

**Fix:** Ensure `package.json` has tar@6 in devDependencies and NO tar override in pnpm.overrides:

```json
"devDependencies": {
  "tar": "^6.2.1"
}
```

Remove any `"tar": ">=7.x.x"` from the `pnpm.overrides` section if present.

Then run:
```bash
pnpm install
npx cap sync android
```

---

## Step 3: Open in Android Studio

Open the Android project in Android Studio:

```bash
npx cap open android
```

Or manually open Android Studio and select: `File > Open > [project]/android`

---

## Step 4: Gradle Sync and Updates

When Android Studio opens, it will perform a Gradle sync. You may encounter AAR metadata errors requiring SDK/plugin updates.

### Required Configuration (as of January 2025)

**android/build.gradle** - Update Gradle plugin:
```gradle
dependencies {
    classpath 'com.android.tools.build:gradle:8.9.1'
    classpath 'com.google.gms:google-services:4.4.4'
}
```

**android/variables.gradle** - Update SDK versions:
```gradle
ext {
    minSdkVersion = 23
    compileSdkVersion = 36
    targetSdkVersion = 35
    // ... other variables remain unchanged
}
```

After making these changes, click "Sync Now" in Android Studio or select `File > Sync Project with Gradle Files`.

---

## Step 5: Run the App

1. Select a device/emulator from the device dropdown
2. Click the Run button (green play icon) or press `Shift+F10`
3. Wait for the build and installation to complete

### If Emulator is Already Running

If you see an error like "Medium Phone API 36.1 is already running as process", you can:
- Use the existing emulator (it should work)
- Or close the emulator and restart it from Android Studio

---

## Step 6: Testing Deep Links (Optional)

To test deep links without going through email, use ADB:

```bash
adb shell am start -W -a android.intent.action.VIEW -d "https://pipsplit.com/auth/account-action?mode=verifyEmail&oobCode=TEST123" com.pipsplit.app
```

Run this in:
- Android Studio Terminal (View > Tool Windows > Terminal)
- Or any command prompt with ADB in PATH

---

## Step 7: Creating a Signed App Bundle

To publish to Google Play:

1. In Android Studio: `Build > Generate Signed Bundle / APK`
2. Select "Android App Bundle"
3. Configure signing:
   - **Keystore path:** Path to your `.jks` or `.keystore` file
   - **Keystore password:** Your keystore password
   - **Key alias:** The alias name for your signing key
   - **Key password:** Password for the specific key (often same as keystore password)

### Finding Your Key Alias

If you don't remember your key alias, run:

```bash
keytool -list -keystore "path\to\your\keystore.jks"
```

Enter your keystore password when prompted. The output will show your alias name(s).

4. Select "release" build variant
5. Click "Create" to generate the `.aab` file

---

## Summary of Files Modified for Android Compatibility

| File | Change |
|------|--------|
| `android/build.gradle` | Gradle plugin version 8.9.1 |
| `android/variables.gradle` | compileSdkVersion = 36 |
| `package.json` | tar@6 in devDependencies, removed tar override |

---

## Common Issues Reference

| Issue | Cause | Solution |
|-------|-------|----------|
| `cap sync` tar error | pnpm override forcing tar@7 | Remove tar override, use tar@6 in devDependencies |
| AAR metadata errors | Outdated compileSdk/Gradle | Update to compileSdkVersion 36 and Gradle 8.9.1 |
| Missing cordova.variables.gradle | Stale Capacitor files | Delete `android/capacitor-cordova-android-plugins` folder and re-run `cap sync` |
| Deep links not working | Missing @capacitor/app | Install package and add DeepLinkService (already done in codebase) |
