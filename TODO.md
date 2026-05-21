# TODO

## Fixed

- **Black tiles after window resize** — Canvas renderer got corrupted when `ResizeObserver` fired mid-maximize animation (container briefly at 0×0 → `fit()` sets terminal to 0 rows → `refresh(0, -1)` no-op → canvas state lost). Guard against 0-dimension fits + defer refresh to rAF.
- **Ctrl+Shift+C not copying to clipboard** — `navigator.clipboard.writeText()` fails silently in Tauri WebView when called from xterm.js's custom key event handler (async clipboard API loses user gesture context). Added null-check + synchronous `execCommand("copy")` fallback via xterm.js hidden textarea.

## Known Issues

- Terminal selection is sometimes cleared on tab switch before it can be copied.
- WebGL context loss recovery re-attaches addon but canvas may remain black until terminal is interacted with.
- Pane divider drag during terminal output floods `ResizeObserver` — debounce works but fit/refresh can lag behind output.

## Short-term

- **Paste support** — Handle `Ctrl+Shift+V` to paste clipboard contents into terminal. Currently only mouse middle-click paste works.
- **Right-click context menu** — Copy, paste, and "Open URL" in terminal.
- **Copy-on-select** — Optional preference to auto-copy text when selection is released.
- **Tab reordering** — Drag to reorder tabs in the tab bar.
- **Resize handle double-click** — Reset split pane sizes to 50/50 on handle double-click.

## Medium-term

- **Search highlights** — Persist search match highlights in terminal after search is dismissed.
- **Session restore across restarts** — Serialize pane tree + PTY snapshots to disk, restore on launch.
- **Workspace profiles** — Named workspace configs (shell, CWD, env vars) selectable per tab.
- **Terminal background image** — Per-profile background image / transparency setting.
- **Font ligature support** — Verify JetBrains Mono ligatures render correctly across all renderers.
- **Explorer integration** — Reveal CWD in file explorer; open files from terminal output paths.

## Long-term

- **WebGPU renderer** — Evaluate replacing WebGL addon with custom WebGPU renderer for better perf and fewer context-loss issues.
- **Remote SSH sessions** — Native SSH support via Rust backend (beyond PTY passthrough).
- **Plugin system** — User-installable plugins (themes, integrations, custom OSC handlers).
- **Sixel / Kitty graphics protocol** — Render inline images in terminal.
- **Multi-select panes** — Send input to multiple panes simultaneously.
