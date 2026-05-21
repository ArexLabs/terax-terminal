# Terax — Technical Architecture

## 1. Project Overview

- **Name**: Terax v0.6.6
- **Bundle ID**: `app.crynta.terax`
- **Package Manager**: pnpm
- **License**: Open source (see LICENSE)

---

## 2. Two-Process Architecture

Terax uses Tauri 2's strict two-process model: the Rust backend owns **all** OS access (filesystem, processes, shells, keychain); the TypeScript frontend never touches the host directly. Everything goes through `invoke()` calls to commands registered in `src-tauri/src/lib.rs`.

### 2a. Rust Backend (`src-tauri/`)

**Entry points:**
- `src-tauri/src/main.rs` — Calls `terax_lib::run()`. `#[cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` suppresses the console window on Windows release builds.
- `src-tauri/src/lib.rs` — `run()` function initializes the Tauri builder with all plugins, managed state, and the command handler.

**Crate names:** `terax` (bin), `terax_lib` (lib, renamed to avoid Windows naming conflict). Crate types: `staticlib`, `cdylib`, `rlib`. Edition 2021.

**Target triple:** Not hardcoded — Tauri's `tauri.conf.json` drives platform-specific configs.

### 2b. TypeScript Frontend (`src/`)

React 19 SPA via Vite 7. Path alias `@/*` → `src/*`.

**Entry (`src/main.tsx`):**
- Imports globals.css, JetBrains Mono font CSS, and xterm.css
- Sets `borderless` chrome attribute on `<html>` when `USE_CUSTOM_WINDOW_CONTROLS` is true
- React 19 `createRoot` with `onRecoverableError` handler (shows error in loading element)
- Window starts hidden (per `tauri.conf.json` `visible: false`), shown after 50ms (`setTimeout` — rAF is throttled when hidden)
- Safety-net `window.show()` at 500ms

---

## 3. Build Toolchain

### 3a. Frontend Build (Vite 7)

Config: `vite.config.ts`

| Setting | Value |
|---|---|
| Plugins | `@vitejs/plugin-react`, `@tailwindcss/vite` |
| TypeScript | esbuild (production: drops `debugger`, strips `console.debug/info/trace`) |
| Target (Windows) | `chrome120` |
| Target (macOS/Linux) | `es2022` |
| Chunk warning limit | 1500 kB |
| Dev port | 1420 (strict) |
| HMR port | 1421 (when `TAURI_DEV_HOST` is set) |
| Watch ignores | `src-tauri/**` |

**Multi-entry builds:**
```typescript
rollupOptions.input: {
  main: "index.html",
  settings: "settings.html",
}
```

**Manual chunk splitting** (each AI provider SDK in its own chunk — lazy imported in `agent.ts`):
- `ai-anthropic`, `ai-google`, `ai-openai-compat`, `ai-openai`, `ai-cerebras`, `ai-groq`, `ai-xai`, `ai-sdk-shared`
- `xterm`, `codemirror`, `streamdown`, `motion`, `react`, `radix`

### 3b. Rust Build (Cargo)

**Profiles:**

| Profile | Key Settings |
|---|---|
| `dev` | incremental compilation |
| `release` | `codegen-units=1`, `lto=fat`, `opt-level=s`, `panic=abort`, `strip=true` |

### 3c. TypeScript Config (`tsconfig.json`)

| Setting | Value |
|---|---|
| target | `ES2020` |
| module | `ESNext` |
| moduleResolution | `bundler` |
| jsx | `react-jsx` |
| strict | `true` |
| paths | `"@/*": ["./src/*"]` |

---

## 4. Rust Backend Details

### 4a. Crate Dependencies

| Crate | Version | Purpose |
|---|---|---|
| `tauri` | 2 | Framework |
| `tauri-plugin-opener` | 2 | Open URLs/files natively |
| `serde` / `serde_json` | 1 | Serialization |
| `log` | 0.4 | Logging facade |
| `portable-pty` | 0.9 | Cross-platform PTY management (ConPTY on Windows, forkpty on Unix) |
| `ignore` | 0.4 | `.gitignore`-aware file walking (used by search/grep/glob) |
| `grep-regex` / `grep-searcher` / `grep-matcher` | 0.1 | Parallel file content grep |
| `globset` | 0.4 | Glob pattern matching for `fs_glob` |
| `shared_child` | 1 | Shareable `Child` handles for background processes |
| `dirs` | 5 | Platform-standard directory paths |
| `reqwest` | 0.12 (rustls-tls, stream) | HTTP client for AI proxy |
| `bytes` | 1 | Byte buffer for streaming |
| `futures-util` | 0.3 | Async stream utilities |
| `windows-sys` | 0.59 | Win32 API (Job Objects, process handling) |
| `libc` | 0.2 | Unix `getpwuid` for login shell detection |
| `keyring` | 3.6 | macOS: `apple-native`, Windows: `windows-native` (Linux: file-based fallback) |

**Tauri Plugins (all v2):**
- `tauri-plugin-autostart` — Launch on startup
- `tauri-plugin-updater` — Minisign-signed auto-updates
- `tauri-plugin-window-state` — Position/size persistence (excludes `StateFlags::VISIBLE` to prevent transparent flash)
- `tauri-plugin-process` — Process lifecycle
- `tauri-plugin-log` — Logging (level: Info)
- `tauri-plugin-os` — OS detection
- `tauri-plugin-store` — Key-value persistent store

### 4b. Module Structure

```
src-tauri/src/
  main.rs                         — binary entry
  lib.rs                          — Tauri builder, plugins, state, 30+ invoke handlers
  modules/
    mod.rs                        — pub mod declarations (fs, net, pty, secrets, shell, workspace)
    workspace.rs                  — WorkspaceEnv enum (Local/Wsl/Ssh), path resolution, WSL/SSH utils
    fs/
      mod.rs                      — to_canon() path normalizer (\ → / on Windows)
      file.rs                     — fs_read_file, fs_write_file, fs_stat
      tree.rs                     — fs_read_dir, list_subdirs
      mutate.rs                   — fs_create_file, fs_create_dir, fs_rename, fs_delete
      search.rs                   — fs_search, fs_list_files (fuzzy path search via ignore)
      grep.rs                     — fs_grep, fs_glob (content search via grep-* crates)
      wsl.rs                      — WSL filesystem via wsl.exe subprocess
    pty/
      mod.rs                      — PtyState (RwLock<HashMap<u32, Arc<Session>>> + AtomicU32)
      session.rs                  — PTY spawn, 3-thread lifecycle (reader/flusher/waiter)
      shell_init.rs               — Shell auto-detection, command building, embedded init scripts
      da_filter.rs                — Device Attribute escape sequence interceptor (14 unit tests)
      job.rs                      — Windows Job Object (KILL_ON_JOB_CLOSE) for orphan prevention
      scripts/                    — Embedded shell integration scripts (include_str!):
        bashrc.bash, zshenv.zsh, zprofile.zsh, zlogin.zsh, zshrc.zsh,
        init.fish, profile.ps1
    shell/
      mod.rs                      — ShellState, shell_session_*, shell_run_command
      session.rs                  — Persistent agent shell sessions with cwd tracking
      background.rs               — Background process management (shared_child + ring buffer)
      ringbuffer.rs               — Bounded VecDeque<u8> with monotonic offset tracking
    net.rs                        — lm_ping, ai_http_request, ai_http_stream
    secrets.rs                    — Platform-specific keychain (macOS: Apple, Windows: CredMan, Linux: JSON file)
```

### 4c. Managed State (Tauri)

```rust
.manage(pty::PtyState::default())     // RwLock<HashMap<u32, Arc<Session>>>
.manage(shell::ShellState::default()) // RwLock<HashMap<u32, Arc<ShellSession>>>
                                      // + RwLock<HashMap<u32, Arc<BackgroundProc>>>
.manage(secrets::SecretsState::default()) // Linux: Mutex<Option<HashMap<String, String>>>
```

ID generation: three `AtomicU32` counters (PTY, shell session, background proc), all starting at 1.

### 4d. Command Registration

30+ commands registered via `tauri::generate_handler![]`:

| Group | Commands |
|---|---|
| PTY | `pty_open`, `pty_write`, `pty_resize`, `pty_close` |
| Filesystem (tree) | `fs_read_dir`, `list_subdirs` |
| Filesystem (file) | `fs_read_file`, `fs_write_file`, `fs_stat` |
| Filesystem (mutate) | `fs_create_file`, `fs_create_dir`, `fs_rename`, `fs_delete` |
| Filesystem (search) | `fs_search`, `fs_list_files` |
| Filesystem (grep) | `fs_grep`, `fs_glob` |
| Shell | `shell_run_command`, `shell_session_open`, `shell_session_run`, `shell_session_close`, `shell_bg_spawn`, `shell_bg_logs`, `shell_bg_stdin`, `shell_bg_kill`, `shell_bg_list` |
| Workspace | `wsl_list_distros`, `wsl_default_distro`, `wsl_home`, `wsl_unregister_distro`, `ssh_test_connection`, `workspace_authorize`, `workspace_current_dir` |
| Secrets | `secrets_get`, `secrets_set`, `secrets_delete`, `secrets_get_all` |
| Networking | `lm_ping`, `ai_http_request`, `ai_http_stream` |
| Shell Init | `list_available_shells` |
| Window | `open_settings_window` |

### 4e. PTY Architecture

**Session lifecycle (`session.rs`):**
1. `pty_open` → `session::spawn()` creates `portable-pty` pair, spawns shell, launches 3 threads:
   - **Reader thread**: reads PTY master, applies `DaFilter`, writes to `Mutex<Vec<u8>>` pending buffer (cap: 4 MB, on overflow: drops entire buffer, writes SGR-reset notice)
   - **Flusher thread**: every 4ms, drains pending buffer, sends via `Channel<Response>` (Tauri IPC channel)
   - **Waiter thread**: blocks on `child.wait()`, sends final data + exit code via channels
2. `pty_write` → writes to PTY master's `Mutex<Box<dyn Write + Send>>` writer
3. `pty_resize` → sends `PtySize` to PTY
4. `pty_close` → removes from map, kills child via `killer`, drops `Arc<Session>` on a **detached thread** (Windows `ClosePseudoConsole` can block)

**Spawn serialization:** A global `Mutex<()>` serializes all PTY spawns. Without it, concurrent `openpty + spawn_command` on Windows leaves one PTY with stalled output.

**Windows Job Object (`job.rs`):**
- Each ConPTY child is assigned a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`
- When the Job HANDLE drops (clean shutdown, panic, SIGKILL), the kernel kills every descendant
- Without this, `TerminateProcess` only kills the immediate child, leaving orphans

**DaFilter (`da_filter.rs`):**
- Intercepts Device Attribute (DA) escape sequences (`ESC[c`, `ESC[>c`, `ESC[=c`)
- Replies with `DA1_REPLY` (`\x1b[?1;2c`) or `DA2_REPLY` (`\x1b[>0;276;0c`)
- Prevents infinite loops with response detection
- 14 unit tests covering split-chunk, double-ESC, non-DA CSI passthrough, etc.

**Drop ordering (Session struct):** `_job` (kills tree) → `killer` (best-effort kill) → `writer` (closes input) → `master` (ClosePseudoConsole)

### 4f. Shell Initialization (`shell_init.rs`)

**Shell detection** (`list_available_shells`):
- Windows: detects `pwsh.exe`, `powershell.exe`, `cmd.exe`, Git Bash, WSL distros
- Unix: detects `zsh`, `bash`, `fish`

**Shell command building** (`build_command`):
- SSH: injects inline init script with OSC 7 tracking, then `exec ${SHELL:-bash} -i`
- Unix: detects login shell via `libc::getpwuid`. Writes integration scripts to `~/.cache/terax/shell-integration/{zsh,bash,fish}/`:
  - Zsh: sets `ZDOTDIR` to custom directory with `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin`
  - Bash: uses `--rcfile` with custom bashrc
  - Fish: uses `--init-command` with source of custom init script
  - All emit OSC 7 (cwd via `file://host/path`) and OSC 133 (prompt boundaries)
- Windows: writes PowerShell profile to `~/.cache/terax/shell-integration/powershell/profile.ps1`, spawns with `-NoLogo -NoExit -ExecutionPolicy Bypass -File <path>`. Shell priority: `pwsh.exe` → `powershell.exe` → `cmd.exe`
- WSL: spawns `wsl.exe -d <distro> --cd <cwd> --exec bash --rcfile <rc> -i`, writes integration file inside WSL via stdin pipe

**Environment:** `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERAX_TERMINAL=1`, UTF-8 locale enforcement.

**Atomic script writes:** `write_if_changed()` — temp file + rename, prevents partial reads during parallel shell startups.

### 4g. Filesystem Module

**Path normalization:** `to_canon()` in `fs/mod.rs` replaces `\` with `/` on Windows.

**Workspace-aware resolution:** `resolve_path(path, workspace)` → Windows WSL converts to UNC `\\wsl.localhost\<distro>\<path>` (fallback to `\\wsl$`). Linux paths normalize `C:\foo` → `/mnt/c/foo`.

**File reads (`fs_read_file`):**
- Blocks SSH with descriptive error
- WSL delegated to `wsl_read_file` via `wsl.exe cat`
- 10 MB max (`MAX_READ_BYTES`)
- Binary sniffing: checks first 8 KB for null bytes
- Returns tagged union: `Text | Binary | TooLarge`

**Atomic file writes (`fs_write_file`):**
- Sibling temp file `.filename.terax.tmp`, `write_all` + `sync_all` + `rename`
- Best-effort cleanup on rename failure

**Directory listing (`fs_read_dir`):**
- Symlinks detected via fallback to `symlink_metadata`
- Sort: directories first, then symlinks, then files; case-insensitive within groups
- Dotfile filtering unless `show_hidden`

**Search (`search.rs`):**
- Uses `ignore::WalkBuilder` with `.gitignore` awareness
- `PRUNE_DIRS`: 10 hardcoded skips (node_modules, .git, target, dist, build, .next, .turbo, .cache, .venv, __pycache__)
- `MAX_SCANNED`: 50,000 entry cap
- `fs_search`: case-insensitive substring match, ranked by filename match first then relative path length
- `fs_list_files`: depth-limited (8 default), file-only, sorted case-insensitively

**Grep (`grep.rs`):**
- Uses `grep-regex` + `grep-searcher` + `ignore` (parallel walk)
- File size cap: 5 MB
- Result cap: 200 default, 2000 hard max
- Glob filtering via `globset`

**WSL filesystem (`wsl.rs`):**
- All operations via `wsl.exe -d <distro> --exec`
- Shell scripts for dir listing (pipe-delimited format), stat, file ops
- Shell-quoting via single-quote escape

### 4h. Shell Module

**One-shot commands (`shell_run_command`):**
- Spawns on blocking thread via `build_oneshot_command`, uses `mpsc::channel`
- Timeout: 30s default, 300s max, poll every 50ms
- Output cap: 256 KB per pipe
- SSH: `ssh user@host command`; WSL: `wsl.exe -d <distro> --cd <cwd> --exec sh -lc <command>`; Unix: `$SHELL -lc <command>`; Windows: `pwsh -NoProfile -Command` or `cmd /C`

**Persistent shell sessions (`shell_session_*`):**
- `ShellSession` tracks cwd via `Mutex<String>`, emits `__TERAX_CWD__` sentinel on stdout
- Post-command cwd parsed from stdout, validated as directory, persisted
- `pristine` flag for first-run cwd hint reseeding

**Background processes (`shell_bg_*`):**
- `shared_child::SharedChild` for shared ownership
- 4 MB ring buffer (`BoundedRingBuffer`) captures stdout + stderr
- Three drain threads: stdout, stderr, waiter
- Supports stdin writing, killing, listing

**Ring buffer (`ringbuffer.rs`):**
- `VecDeque<u8>` with capacity cap
- Monotonic `next_offset` counter
- `read_from(since)` returns bytes from requested offset, next offset, dropped count

### 4i. Networking Module (`net.rs`)

**`lm_ping`:** Pings `http://localhost:1234/v1/models` with 5s timeout, `redirect: none`, blocked host list.

**`ai_http_request`:** Full HTTP proxy. 10s connect timeout, no total timeout (generative endpoints can run minutes). Returns status + headers + body.

**`ai_http_stream`:** Streaming via Tauri `Channel<AiStreamEvent>`. Events: `Headers`, `Chunk`, `End`, `Error`. Frontend abort drops the Rust side's receiver (abort via channel drop detection).

### 4j. Secrets Module (`secrets.rs`)

| Platform | Backend |
|---|---|
| macOS | `keyring` crate with `apple-native` feature → Apple Keychain |
| Windows | `keyring` crate with `windows-native` feature → Credential Manager |
| Linux | File-based at `$APPDATA_LOCAL/secrets.json`, mode 0600, atomic writes |

Commands: `secrets_get(service, account)`, `secrets_set(service, account, password)`, `secrets_delete(service, account)`, `secrets_get_all(service, accounts)` (batch read for cold boot).

### 4k. Workspace Module (`workspace.rs`)

**WorkspaceEnv (tagged enum):**
```rust
enum WorkspaceEnv {
    Local,
    Wsl { distro: String },
    Ssh { host: String, user: Option<String>, port: Option<u16>, key_path: Option<String>, password: Option<String> },
}
```

**WSL ops (Windows-only):** `wsl_list_distros` (parses `wsl --list --verbose`), `wsl_default_distro`, `wsl_home`, `wsl_unregister_distro`.

**SSH ops:** `ssh_test_connection` (runs `ssh echo connected`, ConnectTimeout=5), `workspace_current_dir` (runs `ssh pwd`), `sshpass` auto-detection for password auth.

---

## 5. Tauri Configuration

### 5a. Window Config (`tauri.conf.json`)

| Setting | Value |
|---|---|
| Title | `Terax` |
| Size | 800×600 |
| Min size | 420×280 |
| macOS | `titleBarStyle: Overlay`, `hiddenTitle: true` |
| Visible | `false` (prevent transparent shadow flash, shown after first paint) |

### 5b. Security CSP

```
default-src 'self'
script-src 'self' 'wasm-unsafe-eval'
style-src 'self' 'unsafe-inline'
img-src 'self' data: asset: https://asset.localhost blob:
media-src 'self' asset: https://asset.localhost
font-src 'self' data:
connect-src 'self' ipc: http://ipc.localhost https: http://localhost:* http://127.0.0.1:*
frame-src 'self' http: https:
worker-src 'self' blob:
```

### 5c. Platform Configs

**Linux (`tauri.linux.conf.json`):** `decorations: false`, `transparent: true`. Re-asserted after realize for GNOME/Mutter CSD.

**Windows (`tauri.windows.conf.json`):** Same as Linux plus `shadow: false`.

### 5d. Capabilities

**default.json:** Core window operations (drag/close/minimize/maximize/show/focus), event listen/unlisten, opener/log/os/store/autostart plugins.

**desktop.json:** window-state, updater, process plugins.

### 5e. Settings Window

Separate webview window, 720×520, non-resizable, `always_on_top: true`. Tied to main window as parent. Cross-window Tauri events for sync:
- `terax://prefs-changed` — preference changes
- `terax://ai-keys-changed` — API key CRUD
- `terax://ai-agents-changed` — agent CRUD
- `terax://ai-snippets-changed` — snippet CRUD
- `terax:settings-tab` — navigate to specific settings tab

---

## 6. Frontend Architecture

### 6a. Directory Layout

```
src/
  main.tsx                          — React 19 createRoot, font load, chrome setup
  app/
    App.tsx                         — Root component, module coordinator
  components/
    ui/                             — shadcn/ui primitives (40+ components)
    ai-elements/                    — AI chat rendering (messages, code blocks, shimmers, etc.)
  lib/
    platform.ts                     — IS_MAC/IS_LINUX/IS_WINDOWS, modifier key constants
    fonts.ts                        — Nerd Font detection (15 candidates), mono font family list (19 options)
    utils.ts                        — cn() = clsx + tailwind-merge
    useZoom.ts                      — Zoom level hook (0.5–2.0, step 0.1)
  modules/
    ai/                             — AI agent subsystem
      agents/                       — Subagent registry + runner
      components/                   — React components (chats, input bar, mini window, agents, slices, etc.)
      hooks/                        — useWhisperRecording, useWorkspaceFiles
      lib/                          — agent pipeline, ACP client, compact, composer, keyring, proxyFetch,
                                       redact, security, sessions, slash commands, snippets, todos, transport
      store/                        — chatStore, agentsStore, planStore, snippetsStore, todoStore (5 zustand stores)
      tools/                        — 17 tools (fs, edit, shell, search, terminal, todo, subagent, context)
    editor/                         — CodeMirror 6 editor
      lib/                          — extensions, language resolver, themes, document mgmt, vim, autocomplete
    explorer/                       — File tree explorer
      lib/                          — useFileTree, icon resolver, file/folder icon maps, constants, context actions
    header/                         — Top bar (tabs + search inline + window controls)
    preview/                        — Web preview tab (iframe-based)
    settings/                       — Preferences store, cross-window sync bridge
    shortcuts/                      — 23 keyboard shortcuts, user-customizable
    statusbar/                      — Bottom bar (cwd, file path, workspace, AI status)
    tabs/                           — Tab state management (useTabs, useWorkspaceCwd, TabBar, panes)
    terminal/                       — xterm.js terminal
      lib/                          — renderer pool, session lifecycle, OSC handlers, dormant ring, panes
    theme/                          — ThemeProvider (React context + localStorage fast-path)
    updater/                        — Auto-updater dialog
    workspace/                      — WorkspaceEnv store (zustand)
  settings/                         — Settings window app
    components/                     — Provider cards, section header, setting rows
    sections/                       — General, Models, Agents, Shortcuts, About
  styles/                           — CSS, tokens, themes
```

### 6b. State Management

**Zustand stores (8):**

| Store | File | Key State |
|---|---|---|
| `useChatStore` | `ai/store/chatStore.ts` | AI chat sessions, API keys, model selection, agent meta, panel/mini visibility, selection attachment, approval responder, focus signal |
| `useAgentsStore` | `ai/store/agentsStore.ts` | Custom AI agents CRUD, active agent ID, cross-window sync |
| `usePlanStore` | `ai/store/planStore.ts` | Plan mode edit queue, `applyAll()` sequential execution |
| `useTodosStore` | `ai/store/todoStore.ts` | Per-session todo lists, persisted via tauri-plugin-store |
| `useSnippetsStore` | `ai/store/snippetsStore.ts` | Reusable prompt snippets, cross-window sync |
| `usePreferencesStore` | `settings/preferences.ts` | All 27 user preferences, hydrates from store, subscribes to cross-window changes |
| `useWorkspaceEnvStore` | `workspace/env.ts` | Current workspace, WSL distro list, detected shells |

**React hooks (stateful):**

| Hook | File | Purpose |
|---|---|---|
| `useTabs()` | `tabs/lib/useTabs.ts` | Tab CRUD, pane splitting, active ID via `useState` |
| `useWorkspaceCwd()` | `tabs/lib/useWorkspaceCwd.ts` | Derives explorer root + inherited cwd from active tab |
| `useTerminalSession()` | `terminal/lib/useTerminalSession.ts` | PTY session lifecycle per leaf |
| `useFileTree()` | `explorer/lib/useFileTree.ts` | Lazy-loaded file tree with rename/create/delete |
| `useDocument()` | `editor/lib/useDocument.ts` | Document load/dirty/save via invoke |
| `useZoom()` | `lib/useZoom.ts` | Zoom level control |

**Module-level Maps (not zustand/react-state):**
- `sessions: Map<number, Session>` (`useTerminalSession.ts`) — all PTY sessions by leaf ID
- `slots: Slot[]` (`rendererPool.ts`) — xterm.js renderer pool (max 5)
- `chats: Map<string, Chat<UIMessage>>` (`chatStore.ts`) — Vercel AI SDK Chat instances (LRU, cap 8)
- `pendingPersist` debounce map (`chatStore.ts`) — 300ms debounced message persistence

### 6c. IPC Patterns

**Command invoke (request-response):**
```typescript
invoke<ReturnType>("command_name", { arg1, arg2 })
```
Serde JSON serialization. Error propagation: Rust `Result<T, String>` → rejected promise with error string.

**Tauri Channel (streaming):**
```typescript
const channel = new Channel<EventType>();
channel.onmessage = (event) => { ... };
invoke("command_name", { onData: channel, ... });
```
Used for PTY data streaming and AI HTTP streaming.

**Tauri Events (cross-window pub/sub):**
```typescript
import { emit, listen } from "@tauri-apps/api/event";
await emit("terax://event-name", payload);
const unlisten = await listen("terax://event-name", callback);
```

**Window Events (same-window dispatch):**
```typescript
window.dispatchEvent(new CustomEvent("terax:ai-attach-file", { detail: path }));
```

**Tauri Plugin Store (persistence):**
```typescript
const store = new LazyStore("filename.json", { defaults: {}, autoSave: 200 });
await store.get(key);
await store.set(key, value);
```

### 6d. Tab System

```typescript
type Tab = TerminalTab | EditorTab | PreviewTab | AiDiffTab;
```

| Kind | Key Fields |
|---|---|
| `"terminal"` | `paneTree: PaneNode`, `activeLeafId`, `sessionType?`, `sessionName?`, `workspace?`, `private?` |
| `"editor"` | `path`, `dirty`, `preview` |
| `"preview"` | `url` |
| `"ai-diff"` | `path`, `originalContent`, `proposedContent`, `approvalId`, `status`, `isNewFile` |

**Tab isolation:** Tabs are never unmounted — hidden via `invisible pointer-events-none` so PTYs/dev servers stay live.

**Pane tree (`panes.ts`):**
```typescript
type PaneNode = Leaf | Split;
type Leaf   = { kind: "leaf", id: number, cwd?: string };
type Split  = { kind: "split", id: number, dir: "row" | "col", children: PaneNode[] };
```

Max 4 panes per tab (`MAX_PANES_PER_TAB = 4`). Operations: `splitLeaf`, `removeLeaf`, `nextLeafId`, `siblingLeafOf`, `hasLeaf`, `setLeafCwd`, `findLeafCwd`.

**Preview tab behavior:** single-click opens preview (shared slot, replaceable); double-click or edit promotes to persistent; dirty edits auto-promote.

### 6e. Terminal System

**Renderer pool (`rendererPool.ts`):**
- Max 5 xterm.js instances (`POOL_MAX_SIZE`)
- Pool adapter config: `resolveLeaf`, `evictLeaf`, `isLeafFocused`
- Slot lifecycle: acquire → bind to DOM → release (captures snapshot + scrollback)
- Slots created in a hidden recycler div (`position:fixed; left:-99999px`)
- Addons: `FitAddon`, `SearchAddon`, `SerializeAddon`, `WebLinksAddon`, `WebglAddon`
- WebGL enabled by default, toggleable via preferences
- Font family from nerd-font detection chain
- Theme from CSS variables via `buildTerminalTheme()` (runtime token resolution)
- Resize debounce: fit 8ms, PTY resize 256ms
- Snapshot scrollback cap: 5000 lines

**PTY bridge (`pty-bridge.ts`):**
- Creates `Channel` for data + exit events
- Invokes `pty_open` with channel objects
- Returns `PtySession: { id, write, resize, close }`
- Release guard ensures cleanup on unmount

**Session lifecycle (`useTerminalSession.ts`):**
- `ensureSession(leafId)` — create or retrieve from module-level Map
- `attachSession(leafId, container, callbacks)` — open PTY lazily, bind to renderer slot
- `detachSession(leafId)` — unbind from slot, clear callbacks
- `disposeSession(leafId)` — close PTY, remove from map
- `respawnSession(leafId, cwd)` — re-open PTY after exit

**OSC handlers (`osc-handlers.ts`):**
- OSC 7 (`registerCwdHandler`): parses `file://host/path`, normalizes Windows `/C:/` → `C:/`
- OSC 133 (`registerPromptTracker`): marks prompt boundaries for AI context extraction

**DormantRing (`dormantRing.ts`):**
- Output buffer for offline terminals (not in renderer pool)
- 256 KB byte cap, 256 chunk cap
- Circular buffer with overflow detection + notice insertion
- `drain(write)` replays buffered data when slot becomes available

### 6f. Editor System

**CodeMirror 6 stack (`extensions.ts`):**
- `Compartment`s: language, readOnly, wrap, vim
- Custom theme with CSS variable integration (transparent background, foreground caret)
- BasicSetup: line numbers, fold gutter, history, indentOnInput, bracket matching, close brackets, autocompletion, active line highlight, selection highlights
- Plus: `search({ top: true })`, `lintGutter()`, 2-space indent
- Language support: CSS, Go, HTML, JavaScript, JSON, Markdown, PHP, Python, Rust + `legacy-modes`
- 9 themes: atomone, aura, copilot, github-dark, github-light, nord, tokyo-night, xcode-dark, xcode-light
- Vim mode via `@replit/codemirror-vim`
- Autocomplete via custom provider with language-aware completion sources

**Document management (`useDocument.ts`):**
- Loads via `fs_read_file` invoke
- Dirty tracking via string comparison with saved buffer
- `save()` via `fs_write_file`, `reload()` guarded by dirty check
- Workspace-aware (passes `currentWorkspaceEnv()`)

### 6g. AI Subsystem

**Provider integrations (10):**

| Provider | SDK | Base URL |
|---|---|---|
| OpenAI | `@ai-sdk/openai` | default |
| Anthropic | `@ai-sdk/anthropic` | default (also ACP via subprocess for Claude Code) |
| Google | `@ai-sdk/google` | default |
| xAI | `@ai-sdk/xai` | default |
| Cerebras | `@ai-sdk/cerebras` | default |
| Groq | `@ai-sdk/groq` | default |
| DeepSeek | `@ai-sdk/openai-compatible` | `https://api.deepseek.com` |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` |
| OpenAI-Compatible | `@ai-sdk/openai-compatible` | user-configured |
| LM Studio | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` |

**Model registry (`config.ts`):**
- 50+ models with metadata: `id`, `provider`, `label`, `hint`, `description`, `capabilities` (intelligence/speed/cost 1-5), `tags` (vision, reasoning, tools, coding)
- Context limits: 32K (Qwen 3 32B) to 2M (Grok 4.x)
- Pricing per 1M tokens for major models
- `estimateCost()` and `selectSystemPrompt()` (full or lite based on model capability)

**Agent pipeline (`agent.ts`):**
1. `buildLanguageModel(provider, keys, modelId, options)` — creates provider-specific `LanguageModel` (with ACP support via `AcpClient`)
2. `buildStableSystem()` — combines system prompt + agent persona + custom instructions + project memory (TERAX.md)
3. `compactModelMessagesDetailed()` — history compaction via message merging to fit context window
4. `applyCacheBreakpoints()` — Anthropic-specific ephemeral cache control markers
5. `streamText()` — Vercel AI SDK v6 with tools, step cap (24), abort signal
6. `onStepFinish` — extracts tool labels, reports usage deltas
7. `onFinish` — reports `hitStepCap` and `finishReason`
8. Model cache: `Map<string, LanguageModel>` keyed by `provider + key + modelId + urls`

**ACP (Agent Communication Protocol) client (`acp.ts`):**
- Spawns `npx -y @zed-industries/claude-code-acp` as background process
- JSON-RPC 2.0 over stdin/stdout
- Polls output every 50ms via `shell_bg_logs`
- Implements `LanguageModel.doStream()` for Vercel AI SDK v6
- Supports `agent/text` notifications

**AI transport (`transport.ts`):**
- `createContextAwareTransport()` — custom transport for Vercel AI SDK v6
- Injects live context (cwd, workspace root, active file, terminal context, agent persona)
- Attaches terminal scrollback (redacted) as `<terminal-context>` block
- Attaches user selections as `<selection>` tags
- Handles plan mode (queues mutations instead of executing)
- Maps tool approvals to AI SDK's `approval` system

**Tool system (17 tools):**

| Tool | Category | Approval | Security Check |
|---|---|---|---|
| `read_file` | FS | No | `checkReadable` |
| `list_directory` | FS | No | readable |
| `write_file` | FS (mutate) | Yes | `checkWritable` |
| `edit` | Edit (mutate) | Yes | writable + read-before-edit |
| `multi_edit` | Edit (mutate) | Yes | writable + read-before-edit |
| `create_directory` | FS (mutate) | Yes | writable |
| `grep` | Search | No | readable |
| `glob` | Search | No | readable |
| `bash_run` | Shell | Yes | `checkShellCommand` |
| `bash_background` | Shell | Yes | checkShellCommand |
| `bash_logs` | Shell | No | — |
| `bash_list` | Shell | No | — |
| `bash_kill` | Shell | Yes | — |
| `suggest_command` | Terminal | No | — |
| `get_terminal_output` | Terminal | No | — |
| `open_preview` | Terminal | No | — |
| `todo_write` | Plan | No | — |
| `run_subagent` | Delegation | No | — |

**Security guards (`security.ts`):**
- `checkReadable()`: blocks `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `known_hosts`, `authorized_keys`, `htpasswd`, `.netrc`, `credentials`, `.pgpass`, `.npmrc`, `.pypirc`, paths containing `/.ssh/`, `/.gnupg/`, `/.aws/`, `/.azure/`, `/.kube/`, `/.docker/`, `/.config/gh/`, `/.config/git/`, `/.git/`
- `checkWritable()`: blocks `/etc/`, `/var/db/`, `/System/`, `/Library/Keychains/`, `/private/etc/`
- `checkShellCommand()`: blocks `rm -rf /`, `--no-preserve-root`, `dd` to block devices, `mkfs`/`fdisk`/`diskutil erase`, `parted`

**Sensitive data redaction (`redact.ts`):**
Patterns: OpenAI keys (`sk-...`), Anthropic keys (`sk-ant-...`), AWS access keys, GitHub tokens, Google API keys, Slack tokens, Stripe keys, JWTs, Bearer tokens, env var assignments (`API_KEY=...`, `SECRET=...`, `PASSWORD=...`)

**Session persistence (`sessions.ts`):**
- Store file: `terax-ai-sessions.json`
- `LazyStore` from `@tauri-apps/plugin-store` with 200ms autoSave
- Cold boot: single `entries()` call (1 IPC roundtrip)
- Session ID format: `s-<base36 timestamp>-<random 6 chars>`
- Title auto-derived from first user message (strips context/selection/file tags)

**Chat Store (`chatStore.ts`):**
- LRU cache of `Chat<UIMessage>` instances (cap 8)
- `pendingPersist` debounce map (300ms) to avoid per-token store writes
- Sessions organized conversationally (title, createdAt, updatedAt)
- Auto-reuses empty "New chat" session on restart

**Keyring interface (`keyring.ts`):**
- `getKey(provider)`, `setKey(provider, key)`, `clearKey(provider)`, `getAllKeys()`
- Batch reads via `secrets_get_all` (single IPC roundtrip)
- Fallback to sequential `secrets_get` on batch failure
- `keyringAccount` per provider from config

**Proxy fetch (`proxyFetch.ts`):**
- Replaces `fetch` for LM Studio and OpenAI-compatible providers
- Routes through Tauri's `ai_http_stream` to bypass webview CORS/mixed-content/PNA restrictions
- Converts web `fetch` API to Tauri Channel-based streaming
- Handles `AbortController`

### 6h. Keyboard Shortcuts

**Registry (`shortcuts.ts`):**
- 23 shortcuts across 6 groups
- Cross-platform modifiers (macOS: `metaKey`, others: `ctrlKey`)
- User-customizable via settings (persisted to preferences store)
- Matching via `matchBinding(e, binding, id?)` for KeyboardEvent evaluation

| Shortcut ID | Default macOS | Default Win/Linux | Action |
|---|---|---|---|
| `tab.new` | `⌘T` | `Ctrl+T` | New terminal tab |
| `tab.newPrivate` | `⌘R` | `Ctrl+R` | New private terminal |
| `tab.newEditor` | `⌘E` | `Ctrl+E` | New editor tab |
| `tab.newPreview` | `⌘P` | `Ctrl+P` | New preview tab |
| `tab.close` | `⌘W` | `Ctrl+W` | Close tab/pane |
| `tab.next` / `tab.prev` | `⌘⇧]/⌘⇧[` | `Ctrl+Shift+]/[` | Cycle tabs |
| `tab.selectByIndex` | `⌘1-9` | `Ctrl+1-9` | Jump to tab |
| `pane.splitRight` / `pane.splitDown` | `⌘\` / `⌘⇧\` | `Ctrl+\` / `Ctrl+Shift+\` | Split pane |
| `pane.focusNext` / `pane.focusPrev` | `⌘]` / `⌘[` | `Ctrl+]` / `Ctrl+[` | Focus panes |
| `search.focus` | `⌘F` | `Ctrl+F` | Focus inline search |
| `ai.toggle` | `⌘I` | `Ctrl+I` | Toggle AI panel |
| `ai.askSelection` | `⌘⇧L` | `Ctrl+Shift+L` | Ask AI about selection |
| `shortcuts.open` | `⌘K ⌘S` | `Ctrl+K Ctrl+S` | Keyboard shortcuts |
| `settings.open` | `⌘,` | `Ctrl+,` | Open settings |
| `sidebar.toggle` | `⌘B` | `Ctrl+B` | Toggle sidebar |
| `explorer.focus` | `⌘⇧E` | `Ctrl+Shift+E` | Focus file explorer |
| `view.zoomIn/Out/Reset` | `⌘+/⌘-/⌘0` | `Ctrl+/Ctrl-/Ctrl+0` | Zoom |

### 6i. Composer (`composer.tsx`)

React context `AiComposerProvider` providing:
- `textareaRef`, `value`, `setValue`
- File attachments (image/text/selection kinds)
- File attachment by path (from explorer context action)
- Snippet picking
- Slash commands parsing
- Voice input via `useWhisperRecording`
- Submit/stop
- `canSend` derived state

**ACCEPTED_FILES:** `image/*` and common code/text extensions.

### 6j. Theme System

**ThemeProvider** (React context):
- Sync fast-path via localStorage shadow (`terax-ui-theme-shadow`)
- Hydrates from persistent preferences store on mount
- Subscribes to cross-window pref changes (Tauri event `terax://prefs-changed`)
- System dark mode via `matchMedia("(prefers-color-scheme: dark)")`
- Applies `dark`/`light` class to `document.documentElement`
- Types: `"system" | "light" | "dark"`
- Context: `useTheme()` returns `{ theme, resolvedTheme, setTheme }`

### 6k. Settings Persistence

**Store file:** `terax-settings.json` via `tauri-plugin-store`

**27 preference keys:** theme, default AI model, editor theme, custom instructions, autostart, window state restore, autocomplete settings (provider, model, enabled, debounce, max lines), LM Studio URL/model, OpenAI-compatible URL/model, ACP command, favorite/recent models, vim mode, hidden files, terminal (font, scrollback, WebGL toggle), WSL distro, zoom, shortcuts map, settings-always-on-top.

**Cross-window sync:** `writePref(key, value)` writes to store + emits `terax://prefs-changed` Tauri event. Main window subscribes via `onPreferencesChange(cb)` which listens to both local store changes and cross-window events.

---

## 7. Error Handling Patterns

| Layer | Pattern |
|---|---|
| Rust commands | Return `Result<T, String>` — errors propagate as rejected promises |
| Frontend invoke | `.catch(e => ...)` on all invocations |
| PTY read errors | Non-fatal, break read loop |
| PTY write errors | EPIPE expected on child exit, logged at debug |
| Secrets reads | `NoEntry` → `None`, other errors propagate |
| React recovery | `onRecoverableError` shows error in loading element |
| Search/grep | Walk errors silently skipped |
| AI tool errors | Tool execution errors returned as tool results, not thrown |
| WSL on non-Windows | Returns descriptive error string |
| Store operations | Caught and logged, never crash |

---

## 8. Testing

Only tests found: **`da_filter.rs`** — 14 unit tests covering:
- Bare DA1, DA1 with zero param, DA2 secondary, DA3 consumed silently
- Plain text passthrough, embedded DA preservation, non-DA CSI passthrough
- Split-chunk sequences, escape-then-non-CSI, double ESC
- DA1/DA2 response passthrough, question-mark prefix recognition, runaway CSI flush

---

## 9. Third-Party Integrations

| Library | Purpose |
|---|---|
| **shadcn/ui** | 40+ UI component primitives (Radix-based, "radix-luma" style, "mist" base color) |
| **@hugeicons/core-free-icons** | Icon library (via @hugeicons/react) |
| **@iconify-json/catppuccin** | AI provider icons in settings |
| **motion** (framer-motion) | JS-driven animations (collapsible panels, shimmer, entrance) |
| **react-resizable-panels** | Sidebar + workspace panel layout |
| **sonner** | Toast notifications (top-center, close button, rich colors) |
| **@xterm/xterm** | Terminal emulator (WebGL renderer, fit/search/serialize/weblinks addons) |
| **@codemirror/view + @codemirror/state** | Code editor (9 themes, 9 languages, vim mode, autocomplete) |
| **ai** (Vercel AI SDK v6) | Unified AI provider interface, streamText, tool calling |
| **@radix-ui/react-*** | Accessible primitives (dialog, dropdown, popover, tooltip, tabs, etc.) |
| **Tailwind CSS v4** | Utility-first CSS (no config file, Vite plugin) |
| **zod** | Schema validation (used by AI SDK internally) |
| **zustand** | Lightweight state management (8 stores) |
| **clsx + tailwind-merge** | `cn()` utility |
| **class-variance-authority** | Component variant system (used by all shadcn components) |
| **@tauri-apps/api** | Tauri IPC (invoke, event, window, channel, path) |
| **@tauri-apps/plugin-*** | Tauri capabilities (store, os, log, process, opener, updater, autostart, window-state) |

---

## 10. Known Gotchas

1. **React 19 Strict Mode**: Double-mount in dev spawns terminals twice — `SPAWN_LOCK` serializes this.
2. **Windows PowerShell orphans**: `killer.kill()` only kills immediate child — Job Object handles the rest via `KILL_ON_JOB_CLOSE`.
3. **ConPTY output stall**: `ClosePseudoConsole` can block — session drop delegated to separate thread.
4. **tab.cwd paths**: Arrive as forward-slash from OSC 7 — Rust fs commands on Windows must normalize.
5. **AiComposerProvider**: Mounted unconditionally (wraps entire app) to prevent remount tree collapse when keys load.
6. **WSL file access**: Uses UNC path `\\wsl.localhost\...` with fallback to `\\wsl$\...`.
7. **Concurrent PTY spawns on Windows**: Require `SPAWN_LOCK` — removing it breaks 1st-tab stability under fast tab creation.
8. **xterm scrollbar duplication**: xterm renders both native and custom scrollbar divs — both must be hidden separately.
9. **Window visible flash**: `visible: false` in tauri.conf.json + `window.show()` after first paint prevents transparent shadow flash on Windows/Linux.
10. **Settings window parenting**: Tied to main window as parent so it minimizes/closes together with the main window.
