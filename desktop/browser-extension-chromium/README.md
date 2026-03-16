# Cursivis Chromium Extension

This unpacked extension lets Cursivis act inside the browser tab you already use and are already logged into.

## What it does

- exposes active-tab DOM context to the local Cursivis stack
- executes browser action plans in the current tab
- supports Chrome-family browsers first:
  - Chrome
  - Edge
  - Brave
  - Opera
  - Vivaldi
  - Arc (best-effort, depending on local native host registration)

## Load it

1. Open your browser extension page.
2. Enable developer mode.
3. Load unpacked extension from this folder.
4. Copy the generated extension ID.
5. Run the installer script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-browser-bridge.ps1 -ExtensionId "<EXTENSION_ID>"
```

After that, restart the browser once so the native host connection comes up cleanly.
