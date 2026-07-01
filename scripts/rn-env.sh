#!/usr/bin/env bash

homebrew_java_home="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
homebrew_java_bin="/opt/homebrew/opt/openjdk@17/bin"
mac_android_home="$HOME/Library/Android/sdk"
linux_android_home="/usr/local/lib/android/sdk"

if [[ -z "${JAVA_HOME:-}" && -d "$homebrew_java_home" ]]; then
  export JAVA_HOME="$homebrew_java_home"
fi

if [[ -z "${JAVACMD:-}" && -x "$homebrew_java_bin/java" ]]; then
  export JAVACMD="$homebrew_java_bin/java"
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "$mac_android_home" ]]; then
    export ANDROID_HOME="$mac_android_home"
  elif [[ -d "$linux_android_home" ]]; then
    export ANDROID_HOME="$linux_android_home"
  fi
fi

if [[ -n "${ANDROID_HOME:-}" ]]; then
  export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
  export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
fi

if [[ -d "$homebrew_java_bin" ]]; then
  export PATH="$homebrew_java_bin:$PATH"
fi

if [[ -d "/opt/homebrew/bin" ]]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi
