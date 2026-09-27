export function devLog(tag: string, message: string, data?: any) {
  // 1. Browser DevTools console
  if (data !== undefined) {
    console.log(`[EchoX:${tag}] ${message}`, data);
  } else {
    console.log(`[EchoX:${tag}] ${message}`);
  }

  // 2. Stream to Terminal via local Dev Logger Server
  try {
    fetch('http://127.0.0.1:3999/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag,
        message,
        data: data !== undefined ? data : undefined,
        timestamp: new Date().toLocaleTimeString()
      })
    }).catch(() => {
      // Dev server not active - silent fallback
    });
  } catch {
    // Ignore fetch errors
  }
}
