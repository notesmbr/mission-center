import { Html, Head, Main, NextScript } from 'next/document'

const THEME_INIT_SCRIPT = `
(() => {
  try {
    const key = 'mc_theme_preference';
    const root = document.documentElement;
    const value = localStorage.getItem(key);
    const preference = value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    root.classList.toggle('dark', resolved === 'dark');
    root.dataset.theme = resolved;
  } catch (_) {}
})();
`

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </Head>
      <body className="theme-body">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
