import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "IECNET - Admin System",
  description: "IECNET Admin System",
  icons: {
    icon: "/logo.png",
  },
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
