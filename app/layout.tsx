import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "IECNET",
  description: "IECNET Admin System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
