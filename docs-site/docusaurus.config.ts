import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'igv.ts',
  tagline: 'Interactive genome visualization for the web',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://riyavsinha.github.io',
  baseUrl: '/igv.js/',

  organizationName: 'riyavsinha',
  projectName: 'igv.js',

  onBrokenLinks: 'warn',
  trailingSlash: false,

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/riyavsinha/igv.js/tree/ts/docs-site/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'igv.ts',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/riyavsinha/igv.js',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Introduction', to: '/docs/'},
          ],
        },
        {
          title: 'Community',
          items: [
            {label: 'igv.org', href: 'https://igv.org'},
            {label: 'Official API Docs', href: 'https://igv.org/doc/igvjs'},
          ],
        },
        {
          title: 'Source',
          items: [
            {label: 'GitHub', href: 'https://github.com/riyavsinha/igv.js'},
            {label: 'Upstream', href: 'https://github.com/igvteam/igv.js'},
          ],
        },
      ],
      copyright: `igv.ts Documentation`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
