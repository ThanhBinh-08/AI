import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/** Address ranges a server-side request must never reach (loopback, private, link-local, metadata, reserved). */
const BLOCKED = new net.BlockList();
const V4: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const V6: [string, number][] = [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["64:ff9b::", 96], ["100::", 64],
];
for (const [addr, prefix] of V4) BLOCKED.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of V6) BLOCKED.addSubnet(addr, prefix, "ipv6");

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return true;
  if (family === 6) {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
    if (mapped) return BLOCKED.check(mapped[1]!, "ipv4");
    return BLOCKED.check(address, "ipv6");
  }
  return BLOCKED.check(address, "ipv4");
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/**
 * DNS lookup used by the socket itself: every address is checked at connect time, so a hostname that
 * resolves (or re-resolves) to an internal address is refused. This is what stops DNS rebinding.
 */
export function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedAddress(a.address))) {
      const e: NodeJS.ErrnoException = Object.assign(new Error(`Refused to connect to ${hostname}: internal or reserved address`), {
        code: "EBLOCKED",
      });
      return callback(e, "", 4);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

export interface Hop {
  url: string;
  status: number;
  location: string | null;
}

export type HeadRequest = (url: URL, timeoutMs: number) => Promise<{ status: number; location: string | null }>;

export interface FollowOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  /** Replaced in tests. */
  request?: HeadRequest;
}

/** One HEAD request (no body read) through the guarded lookup. */
const headOnce: HeadRequest = (url, timeoutMs) =>
  new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "HEAD",
        lookup: guardedLookup as unknown as net.LookupFunction,
        timeout: timeoutMs,
        headers: { "user-agent": "brand-detect/1.0", accept: "*/*" },
      },
      (res) => {
        res.resume();
        const loc = res.headers.location;
        resolve({ status: res.statusCode ?? 0, location: typeof loc === "string" ? loc : null });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Timed out after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });

function assertSafe(u: URL): void {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`Refused protocol ${u.protocol}`);
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error(`Refused port ${u.port}`);
  if (u.username || u.password) throw new Error("Refused URL with credentials");
  const bare = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(bare) && isBlockedAddress(bare)) throw new Error(`Refused internal address ${u.hostname}`);
  if (bare === "localhost" || bare.endsWith(".localhost")) throw new Error("Refused localhost");
}

/**
 * Follows redirects of a public http(s) URL without running any page code and without reaching internal
 * networks: protocol, port and literal addresses are checked on every hop, every connection resolves
 * through `guardedLookup`, and the chain stops after `maxRedirects` hops or `timeoutMs` per request.
 */
export async function followRedirects(start: string, opts: FollowOptions = {}): Promise<Hop[]> {
  const max = opts.maxRedirects ?? 5;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const doRequest = opts.request ?? headOnce;
  const hops: Hop[] = [];
  let current = new URL(start);
  for (let i = 0; i <= max; i++) {
    assertSafe(current);
    const { status, location } = await doRequest(current, timeoutMs);
    hops.push({ url: current.toString(), status, location });
    if (status < 300 || status >= 400 || !location) return hops;
    current = new URL(location, current);
  }
  throw new Error(`More than ${max} redirects`);
}
