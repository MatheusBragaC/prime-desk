#!/bin/bash
# Remove o perfil AppArmor criado na instalação.
set -e
PROFILE="/etc/apparmor.d/prime-desk"
if [ -f "$PROFILE" ]; then
  apparmor_parser -R "$PROFILE" 2>/dev/null || true
  rm -f "$PROFILE"
fi
exit 0
