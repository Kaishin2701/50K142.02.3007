export function addLocalLoopbackOrigins(origins: string[], port: number): void {
  for (const host of ['127.0.0.1', 'localhost']) {
    const origin = `http://${host}:${port}`;
    if (!origins.includes(origin)) origins.push(origin);
  }
}
