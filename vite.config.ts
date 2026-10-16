import dns from 'node:dns';
import https from 'node:https';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_TARGET || 'https://assetapi.secureworldme.com';

// Falls back to public / authoritative DNS when the system resolver cannot find the API host
// (e.g. a stale negative cache right after a new DNS record is published).
const PUBLIC_DNS = ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1'];
const resolveVia = (servers: string[], host: string) => {
  const r = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
  r.setServers(servers);
  return r.resolve4(host);
};
async function resolveFallback(host: string) {
  try {
    return await Promise.any(PUBLIC_DNS.map((s) => resolveVia([s], host)));
  } catch {
    const zone = host.split('.').slice(-2).join('.');
    const nameservers = await Promise.any(
      PUBLIC_DNS.map((s) => {
        const r = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
        r.setServers([s]);
        return r.resolveNs(zone);
      })
    );
    const nsIps = (await Promise.all(nameservers.map((n) => dns.promises.lookup(n, { family: 4 }).catch(() => null)))).filter(Boolean).map((a) => a!.address);
    return resolveVia(nsIps, host);
  }
}
const lookup = ((host: string, opts: any, cb: any) =>
  dns.lookup(host, opts, (err: NodeJS.ErrnoException | null, ...rest: any[]) => {
    if (!err) return cb(null, ...rest);
    resolveFallback(host).then(
      (addrs) => (opts?.all ? cb(null, addrs.map((address) => ({ address, family: 4 }))) : cb(null, addrs[0], 4)),
      () => cb(err)
    );
  })) as any;
const agent = API.startsWith('https') ? new https.Agent({ lookup }) : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    host: true,
    proxy: {
      '/api': { target: API, changeOrigin: true, agent },
      '/uploads': { target: API, changeOrigin: true, agent },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          scanner: ['html5-qrcode', 'qrcode', 'jsbarcode'],
        },
      },
    },
  },
});
