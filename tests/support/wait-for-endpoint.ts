export async function waitForEndpointReachable(url: string): Promise<boolean> {
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3000),
      });

      if (response.status >= 100) {
        return true;
      }
    } catch {
      // Keep polling while service boots.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}
