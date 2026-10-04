/** Hono `env` that exposes a direct peer address the way Bun's server does. */
export function peerEnv(address: string) {
  return { requestIP: () => ({ address, family: 'IPv4', port: 0 }) };
}
