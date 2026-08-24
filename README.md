<div align="center">

# Prime Desk

**Desktop GUI for [`prime-agent`](https://github.com/PrimeIntellect-ai/prime-agent)**

Claude-Desktop-grade polish, with the official Prime visual identity.

[Português](README.pt-BR.md)

</div>

---

## What it is

A desktop client for `prime-agent`. The GUI **does not reimplement the agent**:
it talks to the official binary over RPC and only renders. Context, compaction,
skills, subagents and the IPython kernel all stay inside `prime-agent`.

```
Renderer (React) ─ IPC ─ Electron main ─ stdin/stdout JSONL ─ prime-agent --mode rpc
```

## Features

| | |
|---|---|
| **Streaming** | text, reasoning and tool calls in real time, revealed at a steady pace |
| **Tool cards** | executed code, stdout/stderr, duration, status, kernel-restart warning |
| **Reasoning** | collapsible thinking blocks |
| **Markdown** | full GFM, tables, syntax highlighting in the official palette, copy button on code blocks |
| **Models** | switch on the fly, with per-Mtok cost and a reasoning indicator |
| **Thinking** | seven levels, `off` to `max` |
| **Sessions** | searchable sidebar, read straight from `~/.prime/agent/sessions` |
| **Auto title** | each chat gets a short generated name after the first turn |
| **Folders** | manual folders plus automatic grouping by project |
| **Chat actions** | `⋯` menu: open, pin, rename, duplicate, move, archive, delete |
| **Agent tree** | live RLM parent→child hierarchy, with status, depth and the code that spawned each subagent (`Ctrl+B`) |
| **Live watch** | follow a subagent's transcript as it runs |
| **File explorer** | working-directory tree with filter (`Ctrl+Shift+F`) |
| **Editor** | open files with syntax highlighting, edit and save (`Ctrl+S`) |
| **Usage panel** | a new chat shows sessions, messages, tokens, cost and an activity map |
| **Context bar** | chips for execution target, directory, git branch and files |
| **Remote execution** | run over SSH using the official prime-agent extension |
| **HUD** | tokens, context-window usage, accumulated cost, active goal |
| **Control** | abort (`Esc`), steer while streaming, manual compaction |
| **Command palette** | `Ctrl+K`, and `/` inline autocomplete in the composer |
| **Images** | attachments for multimodal models |
| **Languages** | English, Portuguese and Spanish |
| **Resizable panels** | drag the dividers; double-click restores |

## Requirements

- Node.js 20+ (validated on v22.22.2)
- `prime-agent` installed, on your `PATH` and **authenticated**
- Linux (validated on Ubuntu 24.04). macOS and Windows should work, untested.

### First-run authentication

Prime Desk has **no account of its own** and never asks you to sign up. It uses
whatever credentials `prime-agent` already holds. On a fresh machine the app
walks you through it: it detects a missing binary, offers to run the official
installer, and then points you at authentication.

Neither path requires a Prime Intellect account:

| Path | What it covers |
|---|---|
| **Subscription** (`/login`) | Claude Pro/Max, ChatGPT Plus/Pro (Codex), GitHub Copilot |
| **API key** | environment variable (e.g. `ANTHROPIC_API_KEY`) or `/login`, stored in `~/.prime/agent/auth.json` |

> **Cost warning for subscriptions.** The prime-agent documentation is explicit:
> Claude Pro/Max used through a third-party harness is billed **per token as
> "extra usage"**, and does not draw from your plan limits. The subscription
> authenticates you; the consumption is billed separately. Prime Desk's usage
> panel shows that accumulated cost.

The signed-in provider appears at the bottom-left of the sidebar, where you can
switch accounts or sign out.

## Install

### Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/MatheusBragaC/prime-desk/main/scripts/install.sh | sh
```

The script picks the right artifact for your system and handles the
platform-specific setup. Read it before running it — it is a few dozen lines of
plain `sh`.

> **Not available yet.** The script installs from GitHub Releases, and no
> release is published yet. Until then, build from source (below).

### Is `curl` enough?

Downloading is, installing well is not — and it differs per platform:

| Platform | Channel | Trade-off |
|---|---|---|
| **Linux (recommended)** | `.deb` | Needs `sudo`. Gets menu entry, icon, `prime-desk` command and a working Chromium sandbox |
| Linux (no sudo) | AppImage | Single file, but **fails to start on Ubuntu 24.04+** unless launched with `--no-sandbox` (see below) |
| **macOS** | `.zip` → `/Applications` | Build is unsigned: Gatekeeper blocks it until the quarantine flag is removed |
| Homebrew | not published yet | Would need a tap; still unsigned, so it brings no real advantage today |

So `curl` is enough to *fetch*, but a plain `curl && chmod +x && run` is not
enough on Linux — which is exactly what the install script exists to absorb.

#### Why the AppImage fails on Ubuntu 24.04+

Ubuntu 24.04 sets `kernel.apparmor_restrict_unprivileged_userns=1`. Chromium then
needs either an AppArmor profile granting `userns` to the binary, or a
`chrome-sandbox` helper owned by root with mode 4755. An AppImage mounts
read-only under `/tmp`, so it can have neither, and the app aborts with:

```
FATAL:setuid_sandbox_host.cc(163) The SUID sandbox helper binary was found,
but is not configured correctly.
```

The `.deb` fixes this at install time by shipping an AppArmor profile for
`/opt/Prime Desk/prime-desk`, the same approach Chrome and VS Code use.

> Note: electron-builder's stock `postinst` decides this by running
> `unshare --user true`, which **succeeds** on Ubuntu 24.04 because the distro
> ships an AppArmor profile for `unshare` itself. The test passes, the sandbox is
> left unconfigured, and the app does not start. That is why this project
> replaces it with its own `afterInstall` script.

### Manual download

Grab a file from [Releases](https://github.com/MatheusBragaC/prime-desk/releases):

```bash
# Linux
sudo dpkg -i prime-desk_<version>_amd64.deb

# macOS (unsigned build)
unzip "Prime Desk-<version>-mac.zip" -d /Applications
xattr -dr com.apple.quarantine "/Applications/Prime Desk.app"
```

### From source

```bash
npm install
```

### Chromium sandbox on Linux

Ubuntu 24.04 restricts unprivileged user namespaces
(`kernel.apparmor_restrict_unprivileged_userns=1`), so Chromium needs its setuid
helper owned by `root`. Do this **once**:

```bash
npm run fix-sandbox    # sudo chown root:root + chmod 4755 on chrome-sandbox
```

If you have no `sudo`, there is a **development-only** escape hatch:

```bash
npm run dev:nosandbox
```

It disables the Chromium sandbox. It is opt-in and never applied silently. Do
not use it for day-to-day work.

## Usage

```bash
npm run dev      # development with HMR
npm run build    # compile to out/
npm start        # run the build
npm run typecheck
```

## Shortcuts

| Key | Action |
|---|---|
| `Enter` | send |
| `Shift+Enter` | new line |
| `/` | command autocomplete |
| `Ctrl+K` | command palette |
| `Ctrl+B` | agent tree |
| `Ctrl+Shift+F` | file explorer |
| `Ctrl+S` | save file in the editor |
| `Ctrl` `+` / `-` | zoom in and out |
| `Ctrl+0` | reset zoom |
| `Esc` | abort the current turn |

## Where the agent runs

The first chip above the composer opens the execution menu:

- **Local** — default, on your machine.
- **SSH** — a dialog asks for name, host, port, private key and remote
  directory, with **Test connection** before saving. Connections are stored and
  listed in the menu.

Under the hood SSH uses prime-agent's own `examples/extensions/ssh.ts`, which
moves `bash` and `edit` to the remote machine. Because that extension only takes
`user@host`, port and key are injected through a private `ssh` shim placed ahead
of the `PATH` **of the agent process only** — nothing is written to your
`~/.ssh/config`.

Key-based authentication is required: the test uses `BatchMode`, so it fails
instead of prompting (an interactive prompt would hang the agent).

There is no cloud mode: prime-agent has no such capability, and a button that
does nothing is worse than no button.

## Usage panel

A new chat shows aggregate consumption across all local sessions: sessions,
messages, tokens, cost, active days, current streak, most used model, peak hour
and a 19-week activity map.

Numbers come from scanning the `.jsonl` files in `~/.prime/agent/sessions`, with
an `mtime` cache — only changed files are re-read. Usage attributed to subagents
(`child_usage_attributed`) is included; leaving it out would understate the total.

## Chats and folders

The sidebar groups on two levels:

- **Automatic groups** — derived from each session's working directory, which in
  practice means the project. Zero configuration.
- **Manual folders** — created from the folder button, renameable, with `+` to
  start a chat directly inside one. The `⋯` menu on a chat moves it between
  folders.

Manual assignment wins over automatic grouping. All of this lives in
`<userData>/folders.json` and stores **only** session ids and folder names — no
conversation content is duplicated.

Pin, archive and rename are **GUI state**: they do not alter the agent's session.
Delete is real and removes the `.jsonl` from disk, with confirmation.

## Agent tree

`Ctrl+B` opens the agents panel: the full hierarchy of RLM descendants, with
status (active / waiting / replied), depth, message count, model and `spawnCode`
— the exact Python that created each subagent.

Data comes from `prime-agent list --json`, the only surface that exposes
`parentActiveSessionId`. The poller runs every 3 s and **pauses** when the window
is not visible.

### Watching a subagent live

The eye icon on any node opens that session's **live transcript**: reasoning,
text and tool execution in real time, with the same rendering as the main chat.

It uses the RPC `observe` / `unobserve`. The agent buffers events until the
history is delivered, so there is no gap between what already happened and what
arrives next.

The panel is **read-only** by design. Injecting a prompt there would require
`send_message` and would turn "watching" into "interfering" — that deserves an
explicit action, not a side effect of opening a panel.

## File explorer and editor

The bar above the composer shows where the agent is running: **Local**, the
**working directory** (click to change), the git **branch**, and the files button.

The file panel (`Ctrl+Shift+F`) lists the working-directory tree. Clicking a file
opens the built-in editor — syntax highlighting for ~30 languages, editing and
saving with `Ctrl+S`. The `@` next to each file quotes its path into the prompt
instead of opening it.

**Deliberate limits:**

- Everything resolves against the workspace root. `..`, absolute paths and
  symlinks pointing outside are refused — this is a project explorer, not a disk
  browser.
- Files above 1 MB are shown truncated with editing disabled, so a truncated file
  is never written over the original.
- Binaries are not rendered; they open in the system's default application.
- The editor has no cross-session undo history. Version your files before editing
  anything important.

## Packaging

| Target | Command | Where it builds |
|---|---|---|
| `.deb` + AppImage | `npm run dist:linux` | any Linux host |
| macOS `.zip` (x64 + arm64) | `npm run dist:mac` | **any host**, Linux included |
| macOS `.dmg` | `npm run dist:mac:dmg` | **macOS only** |

`.dmg` cannot be produced off macOS: `dmg-license` is a darwin-only dependency
and packaging uses `hdiutil`. For a signed and notarized dmg use
`.github/workflows/release.yml`, which runs on a `macos-14` runner.

> macOS builds without an Apple certificate are **unsigned**. Gatekeeper will
> block the first launch and the user must allow it under Settings → Privacy &
> Security. Fill in the signing secrets in CI for real distribution.

### Desktop icon

On Linux the taskbar does **not** use the window icon: it matches `WM_CLASS`
against an installed `.desktop` file. Without it the shell shows a generic gear
even though the window icon is correct.

| Situation | What to do |
|---|---|
| Installed the `.deb` | Nothing. The package installs `.desktop` and icons under `/usr/share` |
| Development or AppImage | `npm run desktop:install` (writes to `~/.local/share`, no sudo) |
| Undo | `npm run desktop:remove` |
| macOS | The packaged `.app` already carries the `.icns`; development shows the Electron icon |

Icons: `npm run icon` rasterizes `resources/brand/prime-butterfly.svg` at every
size using Electron itself — no Inkscape or ImageMagick required.

## Architecture

```
src/
├─ shared/protocol.ts      RPC protocol types (single source)
├─ main/
│  ├─ index.ts             window, IPC, lifecycle
│  ├─ rpc-client.ts        spawn + JSONL framing + request correlation
│  ├─ session-catalog.ts   reads sessions from disk
│  ├─ agent-tree.ts        RLM tree via `prime-agent list --json`
│  ├─ usage.ts             aggregate usage with mtime cache
│  ├─ files.ts             explorer/read/write scoped to the workspace root
│  ├─ titles.ts            auto title via an ephemeral RPC client
│  ├─ onboarding.ts        environment check, installer, terminal, logout
│  ├─ ssh.ts               connections, test, PATH shim
│  └─ folders.ts           folder persistence
├─ preload/index.ts        contextBridge (minimal surface)
└─ renderer/src/
   ├─ i18n/                en · pt-BR · es dictionaries
   ├─ store/transcript.ts  pure reducer (own and observed sessions)
   ├─ store/agent.ts       UI state, RPC commands, observations
   ├─ styles/theme.css     official palette as CSS custom properties
   └─ components/          Sidebar, StatusBar, Composer, Message, ToolCard, …
```

### Decisions that matter

**1. RPC, not ACP.** ACP is an open standard but exposes only five methods and
cannot switch models, adjust thinking or compact. All coupling lives in
`rpc-client.ts`; moving to ACP means touching one file.

**2. Snapshot, not delta.** The `message_update` event carries the **full**
message content alongside the delta. The renderer uses the snapshot and ignores
deltas — idempotent rendering, no reassembly bugs.

**3. Custom LF parser.** The protocol uses `\n` as its only delimiter. Node's
`readline` is **not** compliant: it also splits on `U+2028`/`U+2029`, which are
valid inside JSON strings.

**4. Smoothing, not optimization.** Measured 60fps with zero long tasks during
streaming. The stutter came from the model's bursts, not from rendering — so the
fix was a steady reveal, not a render optimization.

Full technical mapping: [`docs/MAPEAMENTO.md`](docs/MAPEAMENTO.md).
Plan and phases: [`docs/PLANO.md`](docs/PLANO.md).

## Security

- `contextIsolation: true`, `nodeIntegration: false`
- The GUI **never reads** `~/.prime/agent/auth.json` credential values. It reads
  provider **names** only, to show who is signed in. The single write is the
  explicit sign-out, which removes that provider's entry — the same effect as the
  agent's `/logout`.
- File access is confined to the working directory.
- Internal navigation is blocked; links open in the system browser.
- Restrictive CSP on the renderer document.
- No telemetry of its own.

> **Before internal distribution:** conversation history is stored on disk and may
> contain customer data. Define retention and encryption at rest, and review with
> your security team against GDPR/LGPD and ISO 27001.

## License

MIT
