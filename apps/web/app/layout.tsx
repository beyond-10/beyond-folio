export const metadata = {
  title: 'BeyondFolio',
  description: 'Coming soon',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
