import { BlockList, isIP } from 'node:net';

/**
 * Cloudflare's published edge ranges, copied on 2026-11-21 from
 * https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6.
 * A range missing here only puts that edge's visitors in one bucket; it never lets a header through.
 */
export const CLOUDFLARE_RANGES: readonly string[] = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

// Built once: the list never changes while the process runs.
const edges = new BlockList();
for (const range of CLOUDFLARE_RANGES) {
  const [network, prefix] = range.split('/');
  edges.addSubnet(network!, Number(prefix), isIP(network!) === 6 ? 'ipv6' : 'ipv4');
}

/** Whether `ip` belongs to one of Cloudflare's edge ranges. */
export function isCloudflareAddress(ip: string): boolean {
  // A dual-stack proxy may report an IPv4 peer as ::ffff:a.b.c.d.
  const address = ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  const family = isIP(address);
  if (family === 0) return false;
  return edges.check(address, family === 6 ? 'ipv6' : 'ipv4');
}
