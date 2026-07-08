#!/usr/bin/env bash
# HelpTheHomeless (HTH) masternode installer — run on a fresh Ubuntu 20.04/22.04 VPS as root.
#
#   curl -fsSL https://stake.hth.foundation/install-hth-masternode.sh | sudo bash -s -- <MN_PRIVKEY> <EXTERNAL_IP> [P2P_PORT]
#
# Non-custodial: this sets up ONLY the remote node. Your 1,000,000 HTH collateral
# stays in your control wallet; the masternode private key controls no funds.
#
# Override the binary source (base URL that hosts helpthehomelessd + helpthehomeless-cli):
#   HTH_BASE_URL=https://github.com/HTHcoin/helpthehomelesscoin/releases/download/0.14.1 curl ... | bash -s -- ...
set -euo pipefail

MN_KEY="${1:-}"
EXTERNAL_IP="${2:-$(curl -fsS https://api.ipify.org || echo '')}"
P2P_PORT="${3:-65000}"
HTH_USER="hth"
HTH_HOME="/home/${HTH_USER}"
DATADIR="${HTH_HOME}/.helpthehomeless"
# Official HTHcoin Linux release (0.14.1) — raw x86-64 ELF binaries (not a tarball).
: "${HTH_BASE_URL:=https://github.com/HTHcoin/helpthehomelesscoin/releases/download/0.14.1}"

log() { echo -e "\033[1;32m[hth-mn]\033[0m $*"; }
err() { echo -e "\033[1;31m[hth-mn]\033[0m $*" >&2; }

[ "$(id -u)" -eq 0 ] || { err "Run as root (use sudo)."; exit 1; }
[ -n "$EXTERNAL_IP" ] || { err "Could not determine external IP; pass it as arg 2."; exit 1; }

log "Installing dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl wget tar ufw libatomic1 libboost-all-dev libevent-dev libminiupnpc-dev >/dev/null 2>&1 || \
apt-get install -y -qq curl wget tar ufw libatomic1 >/dev/null

id -u "$HTH_USER" >/dev/null 2>&1 || { log "Creating '$HTH_USER' user..."; useradd -m -s /bin/bash "$HTH_USER"; }
mkdir -p "$DATADIR"

log "Downloading HTH binaries from: $HTH_BASE_URL"
tmp="$(mktemp -d)"
for bin in helpthehomelessd helpthehomeless-cli; do
  if wget -q "$HTH_BASE_URL/$bin" -O "$tmp/$bin"; then
    install -m0755 "$tmp/$bin" /usr/local/bin/
  else
    err "Download of $bin failed. Set HTH_BASE_URL to a host serving the Linux binaries and re-run."
    err "  (or build helpthehomelessd/helpthehomeless-cli and place them in /usr/local/bin)"
    exit 1
  fi
done
command -v helpthehomelessd >/dev/null || { err "helpthehomelessd not found after download."; exit 1; }
# 0.14.1 binaries are dynamically linked against boost/libevent — installed above.

# Generate a masternode key on the box if none supplied.
if [ -z "$MN_KEY" ]; then
  log "No masternode key supplied — generating one after first start."
fi

RPCPASS="$(head -c 32 /dev/urandom | sha256sum | cut -c1-32)"
log "Writing $DATADIR/helpthehomeless.conf"
cat > "$DATADIR/helpthehomeless.conf" <<EOF
rpcuser=hthrpc
rpcpassword=${RPCPASS}
rpcallowip=127.0.0.1
server=1
daemon=1
listen=1
maxconnections=64
masternode=1
externalip=${EXTERNAL_IP}
port=${P2P_PORT}
$( [ -n "$MN_KEY" ] && echo "masternodeprivkey=${MN_KEY}" )
EOF
chown -R "$HTH_USER:$HTH_USER" "$HTH_HOME"

log "Creating systemd service..."
cat > /etc/systemd/system/helpthehomelessd.service <<EOF
[Unit]
Description=HelpTheHomeless masternode daemon
After=network-online.target
Wants=network-online.target

[Service]
User=${HTH_USER}
Group=${HTH_USER}
Type=forking
ExecStart=/usr/local/bin/helpthehomelessd -datadir=${DATADIR} -daemon
ExecStop=/usr/local/bin/helpthehomeless-cli -datadir=${DATADIR} stop
Restart=on-failure
RestartSec=10
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF

log "Opening firewall port ${P2P_PORT}..."
ufw allow "${P2P_PORT}/tcp" >/dev/null 2>&1 || true

systemctl daemon-reload
systemctl enable --now helpthehomelessd >/dev/null 2>&1
log "Daemon starting; waiting for RPC..."
for i in $(seq 1 30); do
  sudo -u "$HTH_USER" helpthehomeless-cli -datadir="$DATADIR" getblockcount >/dev/null 2>&1 && break
  sleep 3
done

if [ -z "$MN_KEY" ]; then
  GEN="$(sudo -u "$HTH_USER" helpthehomeless-cli -datadir="$DATADIR" masternode genkey 2>/dev/null || true)"
  if [ -n "$GEN" ]; then
    sed -i "/^masternodeprivkey=/d" "$DATADIR/helpthehomeless.conf"
    echo "masternodeprivkey=${GEN}" >> "$DATADIR/helpthehomeless.conf"
    systemctl restart helpthehomelessd
    log "Generated masternode key — ADD THIS to your control wallet's masternode.conf line:"
    echo "    $GEN"
  fi
fi

cat <<EOF

==================================================================
 HTH masternode node is installed and syncing.
 External IP : ${EXTERNAL_IP}:${P2P_PORT}
 Data dir    : ${DATADIR}
 Check sync  : helpthehomeless-cli -datadir=${DATADIR} mnsync status
 Check node  : helpthehomeless-cli -datadir=${DATADIR} masternode status
 Logs        : journalctl -u helpthehomelessd -f

 NEXT (on your CONTROL wallet, once this node is fully synced):
   1) add the masternode.conf line from stake.HTH.foundation/setup.html
   2) restart the wallet
   3) run:  masternode start-alias <alias>
==================================================================
EOF
