#!/bin/sh
# Prime Desk installer.
#
#   curl -fsSL https://raw.githubusercontent.com/MatheusBragaC/prime-desk/main/scripts/install.sh | sh
#
# Picks the right artifact from the latest GitHub release and does the
# platform-specific work: on Linux a .deb when possible (proper icon, menu entry
# and Chromium sandbox setup), otherwise an AppImage; on macOS the .app plus the
# quarantine removal an unsigned build requires.
set -eu

REPO="MatheusBragaC/prime-desk"
API="https://api.github.com/repos/$REPO/releases/latest"

say()  { printf '%s\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1; }

need curl || die "curl is required."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "Looking up the latest release…"
META="$TMP/release.json"
curl -fsSL "$API" -o "$META" || die "could not reach GitHub. Is there a published release yet?"

# Minimal JSON scraping keeps this script dependency-free.
asset_url() {
  grep -o '"browser_download_url": *"[^"]*'"$1"'"' "$META" | head -1 | sed 's/.*"\(https[^"]*\)"/\1/'
}

VERSION="$(grep -o '"tag_name": *"[^"]*"' "$META" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
[ -n "${VERSION:-}" ] || die "no release found for $REPO."
say "Latest release: $VERSION"

OS="$(uname -s)"
ARCH="$(uname -m)"

# ------------------------------------------------------------------ macOS
if [ "$OS" = "Darwin" ]; then
  case "$ARCH" in
    arm64) PATTERN="arm64-mac.zip" ;;
    *)     PATTERN="mac.zip" ;;
  esac
  URL="$(asset_url "$PATTERN")"
  [ -n "$URL" ] || die "no macOS asset matching $PATTERN in $VERSION."

  say "Downloading $(basename "$URL")…"
  curl -fL# "$URL" -o "$TMP/app.zip"
  say "Unpacking to /Applications…"
  rm -rf "/Applications/Prime Desk.app"
  unzip -q "$TMP/app.zip" -d /Applications

  # The build is unsigned, so Gatekeeper would refuse it without this.
  xattr -dr com.apple.quarantine "/Applications/Prime Desk.app" 2>/dev/null || true

  say ""
  say "Installed: /Applications/Prime Desk.app"
  warn "This build is not signed by Apple. The quarantine flag was removed so it"
  warn "can open. Only do this for software you trust."
  exit 0
fi

[ "$OS" = "Linux" ] || die "unsupported system: $OS"
[ "$ARCH" = "x86_64" ] || die "unsupported architecture: $ARCH (only x86_64 is published)."

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  need sudo && SUDO="sudo"
fi

# ------------------------------------------------------------- Linux (.deb)
if need dpkg && [ -n "$SUDO" ] || { need dpkg && [ "$(id -u)" -eq 0 ]; }; then
  URL="$(asset_url '\.deb')"
  if [ -n "$URL" ]; then
    say "Downloading $(basename "$URL")…"
    curl -fL# "$URL" -o "$TMP/prime-desk.deb"
    say "Installing (may ask for your password)…"
    $SUDO dpkg -i "$TMP/prime-desk.deb" || $SUDO apt-get -y -f install
    say ""
    say "Installed. Launch it from your applications menu or run: prime-desk"
    exit 0
  fi
fi

# --------------------------------------------------------- Linux (AppImage)
warn "Falling back to the AppImage (no dpkg or no sudo available)."
URL="$(asset_url '\.AppImage')"
[ -n "$URL" ] || die "no Linux asset found in $VERSION."

BIN_DIR="$HOME/.local/bin"
APP="$BIN_DIR/prime-desk.AppImage"
mkdir -p "$BIN_DIR"

say "Downloading $(basename "$URL")…"
curl -fL# "$URL" -o "$APP"
chmod +x "$APP"

# Chromium refuses to start unprivileged when user namespaces are restricted and
# no AppArmor profile grants them — the case on Ubuntu 24.04+. The .deb solves
# this properly; from an AppImage the only user-level option is --no-sandbox.
EXEC="$APP"
if [ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ] &&
   [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns)" = "1" ]; then
  warn "Your kernel restricts unprivileged user namespaces."
  warn "The AppImage will be launched with --no-sandbox, which weakens isolation."
  warn "Prefer the .deb package if you can use sudo."
  EXEC="$APP --no-sandbox"
fi

DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/prime-desk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Prime Desk
Comment=Desktop interface for prime-agent
Exec=$EXEC
Icon=prime-desk
Terminal=false
Categories=Development;
StartupWMClass=prime-desk
EOF

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DESKTOP_DIR" || true

say ""
say "Installed: $APP"
say "A menu entry was created. The icon appears after your next login."
