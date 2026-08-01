// Frontend runtime config. Edit these two values for your deployment.
window.HTH_STAKE_CONFIG = {
  // Public URL of the backend (server.js) on the Oracle VM.
  // Put a TLS-terminating proxy (Caddy/nginx) in front so this is https://.
  API_BASE: 'https://stake-api.hth.foundation',

  // Raw URL of the VPS installer script (served from this same repo/Pages site).
  INSTALL_SCRIPT_URL: 'https://stake.hth.foundation/install-hth-masternode.sh',

  // Chain constants (from helpthehomelesscoin chainparams).
  COLLATERAL: 1000000,   // HTH required per masternode
  P2P_PORT: 65000,
  TICKER: 'HTH',
};
