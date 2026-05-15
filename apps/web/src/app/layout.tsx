/**
 * Root layout. Replaced in Phase 3 when the UI is built.
 */

export const metadata = {
  title: 'Glazetopia Checkers',
  description: 'Beat the Unbaked. Three marks pass the level.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
