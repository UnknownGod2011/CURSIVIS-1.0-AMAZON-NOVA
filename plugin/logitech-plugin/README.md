# Logitech Plugin (C#)

## Purpose

Capture Logitech hardware intent and forward it to the local companion app.

## Scope

- Trigger types: `tap`, `long_press`, `long_press_start`, `long_press_end`, `dial_press`, `dial_tick`
- IPC sender client for trigger payloads
- Optional haptic feedback mapping

## Input

- Logitech device event from Logi Actions SDK

## Output

- `TriggerEvent` JSON payload to companion IPC endpoint

## Status

`src/Cursivis.Logitech.Bridge` is implemented as a functional trigger bridge that sends Logitech-style trigger events over local WebSocket to the companion app.

It now also subscribes to companion haptic events over:

- `ws://127.0.0.1:48712/cursivis-haptics/`

and prints/beeps haptic mappings for demo feedback.

This enables full trigger-path testing now, before binding to the official Logi Actions SDK plugin package.

`src/CursivisPlugin` is generated with `LogiPluginTool` and contains a real Logi Actions SDK C# plugin project with Cursivis actions:

- `Cursivis Trigger` -> sends `tap`
- `Cursivis Long Press` -> sends `long_press`
- `Cursivis Long Press Start` -> sends `long_press_start`
- `Cursivis Long Press End` -> sends `long_press_end`
- `Cursivis Dial` adjustment -> sends `dial_tick` and `dial_press`

These actions forward events to `ws://127.0.0.1:48711/cursivis-trigger/`.

## Bridge Run

```powershell
cd plugin/logitech-plugin/src/Cursivis.Logitech.Bridge
dotnet run
```

Controls:

- `T` = tap trigger
- `L` = long press (single event)
- `S` = long press start (press-and-hold begin)
- `E` = long press end (press-and-hold release)
- `P` = dial press
- `A` = dial tick -1
- `D` = dial tick +1
- `Q` = quit

## Logi SDK Plugin Notes

Logi SDK plugin project path:

- `plugin/logitech-plugin/src/CursivisPlugin/src`

Build this project on a machine with Logi Plugin Service installed (for `PluginApi.dll` reference).
