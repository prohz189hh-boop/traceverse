import type { ReactNode } from 'react';
export const metadata = {
  title: 'TraceVerse · Next.js example',
  description: 'Local OpenTelemetry example',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          background: '#090f1d',
          color: '#dce9fa',
          fontFamily: 'system-ui',
          padding: '4rem',
          maxWidth: 800,
          margin: 'auto',
        }}
      >
        {children}
      </body>
    </html>
  );
}
