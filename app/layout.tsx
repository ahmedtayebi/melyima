import type { Metadata } from "next";
import { Noto_Kufi_Arabic, DM_Sans } from "next/font/google";
import "./globals.css";

const notoKufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["400", "700", "900"],
  variable: "--font-noto-kufi",
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const BASE_URL = 'https://melyima.com'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: 'MELY•IMA — عباءات نسائية عصرية',
    template: '%s | MELY•IMA',
  },

  description: 'اكتشفي أجمل تشكيلات العباءات النسائية العصرية من MELY•IMA — موضة جزائرية بأناقة يومية وجودة مضمونة. توصيل لجميع ولايات الجزائر.',

  keywords: [
    'عباءات جزائرية',
    'عباءة عصرية',
    'MELY IMA',
    'ملابس نسائية الجزائر',
    'موضة جزائرية',
    'عباءات نسائية',
    'عباءة مطرزة',
    'abaya algerie',
  ],

  authors: [{ name: 'MELY•IMA', url: BASE_URL }],
  creator: 'MELY•IMA',
  publisher: 'MELY•IMA',

  openGraph: {
    type: 'website',
    locale: 'ar_DZ',

    url: BASE_URL,
    siteName: 'MELY•IMA',
    title: 'MELY•IMA — عباءات نسائية عصرية',
    description: 'اكتشفي أجمل تشكيلات العباءات النسائية العصرية من MELY•IMA — توصيل لجميع ولايات الجزائر.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'MELY•IMA — عباءات نسائية عصرية',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'MELY•IMA — عباءات نسائية عصرية',
    description: 'اكتشفي أجمل تشكيلات العباءات النسائية العصرية من MELY•IMA',
    images: ['/opengraph-image'],
  },

  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  alternates: {
    canonical: 'https://melyima.com',
  },

  applicationName: 'MELY•IMA',
  category: 'shopping',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${notoKufi.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ClothingStore',
              name: 'MELY•IMA',
              url: 'https://melyima.com',
              logo: 'https://melyima.com/logo.png',
              telephone: '0665967348',
              address: {
                '@type': 'PostalAddress',
                addressLocality: 'بسكرة',
                addressCountry: 'DZ',
              },
              sameAs: [
                'https://www.instagram.com/mely_ima',
                'https://www.facebook.com/share/1KoHWcP4Dm/',
              ],
            }),
          }}
        />
      </body>
    </html>
  );
}
