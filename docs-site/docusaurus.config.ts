import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'igv.js Documentation',
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
      title: 'igv.js',
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
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {label: 'Introduction', to: '/docs/'},
          ],
        },
        {
          title: 'Resources',
          items: [
            {label: 'igv.org', href: 'https://igv.org'},
            {label: 'Official Docs', href: 'https://igv.org/doc/igvjs'},
            {label: 'GitHub (upstream)', href: 'https://github.com/igvteam/igv.js'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} igv.js Documentation. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
