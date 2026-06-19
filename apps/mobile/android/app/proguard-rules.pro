# React Native — keep JS bridge and Hermes engine classes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Firebase / Google Services
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Notifee (push notification library)
-keep class io.invertase.notifee.** { *; }

# React Native Keychain
-keep class com.oblador.keychain.** { *; }

# React Native Config (env vars)
-keep class com.lugg.ReactNativeConfig.** { *; }

# React Native WebView
-keep class com.reactnativecommunity.webview.** { *; }

# Keep source file names and line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
