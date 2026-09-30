/** fetch با مهلت — جلوی هنگ بی‌نهایت روی شبکه را می‌گیرد */
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Promise با سقف زمانی */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = "operation",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`TIMEOUT:${label}:${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
