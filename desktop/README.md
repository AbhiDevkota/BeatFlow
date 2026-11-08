# BeatFlow Desktop (Tauri Windows Application)

Native Windows desktop application for BeatFlow, built using [Tauri v2](https://v2.tauri.app/) and powered by the [`/web`](../web) UI.

## Overview

- **Frontend**: Shares the `/web` UI built with React 19, TypeScript, Tailwind CSS, TanStack Query, and Zustand.
- **Backend / Shell**: Native Windows host implemented with Tauri v2 (Rust + WebView2).
- **Desktop Bridge**: An embedded bridge adapter intercepts `bitchord-bridge` requests and connects the UI with desktop capabilities (YouTube streaming, lyrics, audio DSP, and local configurations) without requiring a browser extension.

## Requirements

- **Node.js**: 22+
- **pnpm**: 12+ (via `corepack`)
- **Rust**: 1.90+ with `cargo` and MSVC toolchain
- **Windows**: WebView2 runtime (pre-installed on Windows 10/11)

## Development

To start the desktop application in development mode:

```bash
# From the repository root or desktop directory:
corepack pnpm --config.pm-on-fail=ignore --dir desktop dev
```

Or using the Tauri CLI directly:

```bash
cd desktop/src-tauri
cargo tauri dev
```

This will automatically start the Vite dev server for `web/app` at `http://localhost:5173` and launch the Tauri native window.

## Production Build

To build the optimized Windows executable (`.exe`) and MSI installer:

```bash
# Build web frontend and native desktop package
corepack pnpm --config.pm-on-fail=ignore --dir desktop build
```

Or via cargo:

```bash
cd desktop/src-tauri
cargo tauri build
```

The compiled binaries will be output to `desktop/src-tauri/target/release/`.
