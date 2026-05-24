import './globals.css';

export const metadata = {
  title: 'ForexTracker — Live Exchange Rates',
  description: 'Real-time currency exchange rates with freshness indicators and graceful fallbacks.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
