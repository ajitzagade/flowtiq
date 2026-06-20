import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { FaviconUpdater } from '@/components/FaviconUpdater';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: {
    default: 'Flowtiq | Workflow Management',
    template: '%s | Workflow Management',
  },
  description: 'Enterprise workflow and project management platform for modern teams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <FaviconUpdater />
          <ServiceWorkerRegistrar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
