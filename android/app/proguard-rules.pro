# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Ignore missing Facebook SDK classes (not using Facebook login)
-dontwarn com.facebook.**

# Capacitor reads each plugin's @CapacitorPlugin/@Permission annotations via
# reflection at runtime (Bridge.getPermissionStates) to build the per-plugin
# permission map. R8 was renaming those annotation classes and their element
# methods in release builds; keep them (and all annotation attributes) as-is.
# Suspected cause of Camera.takePhoto() crashing in release with
# "getPermissionState(...) must not be null" (CameraPlugin.load lambda).
-keepattributes *Annotation*,InnerClasses,Signature,EnclosingMethod
-keep class com.getcapacitor.annotation.** { *; }
-keep @interface com.getcapacitor.annotation.** { *; }

# Readable release stack traces (retrace with the mapping.txt uploaded to
# Play, which Play Console applies to crash reports automatically).
-keepattributes SourceFile,LineNumberTable
