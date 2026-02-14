import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FritOS Flexi',
  description: 'Module de gestion des flexi-jobs — MDjambo',
  manifest: '/manifest.json',
  themeColor: '#F97316',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 antialiased">{children}</body>
    </html>
  );
}
