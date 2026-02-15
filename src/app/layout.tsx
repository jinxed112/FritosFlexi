import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FritOS Flexi',
  description: 'Module de gestion des flexi-jobs — MDjambo',
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
