const requests = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30;     // 30 requests per minute per IP

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requests.get(ip);

  if (!record || now > record.resetTime) {
    requests.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return true; // allowed
  }

  if (record.count >= MAX_REQUESTS) {
    return false; // blocked
  }

  record.count++;
  return true; // allowed
}

// Cleanup stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requests) {
    if (now > record.resetTime) {
      requests.delete(ip);
    }
  }
}, 5 * 60 * 1000);
