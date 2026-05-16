import type { Metadata, Viewport } from 'next';
import '@/styles/checkers.css';

export const metadata: Metadata = {
  title: 'Glazetopia Checkers',
  description: 'Beat the Unbaked. Three marks pass the level.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the board breathe inside Discord's iframe on mobile.
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
