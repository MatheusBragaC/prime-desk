#!/bin/bash
# Executado pelo dpkg após instalar o pacote.
#
# Ubuntu 24.04 restringe user namespaces sem privilégio
# (kernel.apparmor_restrict_unprivileged_userns=1). O postinst padrão do
# electron-builder testa `unshare --user true` para decidir se precisa do
# sandbox setuid — mas esse teste passa mesmo com a restrição ativa, porque o
# Ubuntu já traz um perfil AppArmor para o binário `unshare`. Resultado: ele
# conclui que namespaces funcionam, deixa o chrome-sandbox sem setuid, e o app
# não abre.
#
# A correção recomendada pelo Ubuntu é declarar um perfil para o próprio
# binário, como fazem Chrome e VS Code. Se o AppArmor não estiver disponível,
# caímos no sandbox setuid, que é o outro caminho suportado.
#
# This script REPLACES electron-builder's default postinst, so it must redo
# what that one did beyond the sandbox — the /usr/bin link. Without it the
# binary lives only under `/opt/Prime Desk/`, off the PATH, while install.sh
# still ends by telling the user to run `prime-desk`.
set -e

APP_BIN="/opt/Prime Desk/prime-desk"
SANDBOX="/opt/Prime Desk/chrome-sandbox"
PROFILE="/etc/apparmor.d/prime-desk"

if [ -d /etc/apparmor.d ] && command -v apparmor_parser >/dev/null 2>&1; then
  cat > "$PROFILE" <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile prime-desk "/opt/Prime Desk/prime-desk" flags=(unconfined) {
  userns,
  include if exists <local/prime-desk>
}
EOF
  apparmor_parser -r "$PROFILE" 2>/dev/null || true
  chmod 0755 "$SANDBOX" 2>/dev/null || true
else
  # Sem AppArmor: o sandbox do Chromium usa o helper setuid.
  chmod 4755 "$SANDBOX" 2>/dev/null || true
fi

# The link electron-builder's template would create. `update-alternatives` is
# the right mechanism on Debian/Ubuntu; the `ln` covers distros without it. A
# previous hand-made link is removed first — update-alternatives refuses to
# take over a path it does not own.
if [ -x "$APP_BIN" ]; then
  if command -v update-alternatives >/dev/null 2>&1; then
    if [ -L /usr/bin/prime-desk ] && [ "$(readlink /usr/bin/prime-desk)" != /etc/alternatives/prime-desk ]; then
      rm -f /usr/bin/prime-desk
    fi
    update-alternatives --install /usr/bin/prime-desk prime-desk "$APP_BIN" 100 \
      || ln -sf "$APP_BIN" /usr/bin/prime-desk
  else
    ln -sf "$APP_BIN" /usr/bin/prime-desk
  fi
fi

exit 0
