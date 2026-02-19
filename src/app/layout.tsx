import type { Metadata, Viewport } from 'next';
import { PWAProvider } from '@/components/pwa/PWAProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'FritOS Flexi – MDjambo',
  description: 'Portail flexi-job MDjambo – Missions, planning et pointage',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MDjambo',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#F97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 antialiased">
        <PWAProvider>
          {children}
        </PWAProvider>
      </body>
    </html>
  );
}
