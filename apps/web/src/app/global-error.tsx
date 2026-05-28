'use client';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h1>500</h1>
          <p>Something went wrong.</p>
          <pre>{error.message}</pre>
        </main>
      </body>
    </html>
  );
}
