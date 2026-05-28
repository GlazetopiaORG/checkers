import type { Metadata, Viewport } from 'next';
import '@/styles/checkers.css';
import '@/styles/board-themes.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Glazetopia Checkers',
  description: 'Launch a Glazetopia Checkers duel from Discord.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1a1410',
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
