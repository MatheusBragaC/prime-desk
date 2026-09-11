set -e
PROFILE="/etc/apparmor.d/prime-desk"
if [ -f "$PROFILE" ]; then
  apparmor_parser -R "$PROFILE" 2>/dev/null || true
  rm -f "$PROFILE"
fi

# Counterpart to the /usr/bin link made in after-install.
#
# Both mechanisms have to be undone, not one or the other: after-install falls
# back to a plain `ln` whenever update-alternatives is missing OR fails, so
# asking only update-alternatives here leaves the link behind — pointing at a
# path the uninstall just deleted. Tested: the alternatives branch alone left a
# dangling /usr/bin/prime-desk.
LINK=/usr/bin/prime-desk
APP_BIN="/opt/Prime Desk/prime-desk"

if command -v update-alternatives >/dev/null 2>&1; then
  update-alternatives --remove prime-desk "$APP_BIN" 2>/dev/null || true
fi

# Whatever survived: drop it only if it is ours or already dangling, so a link
# some other package owns is left alone.
if [ -L "$LINK" ] && { [ "$(readlink "$LINK")" = "$APP_BIN" ] || [ ! -e "$LINK" ]; }; then
  rm -f "$LINK"
fi

exit 0
