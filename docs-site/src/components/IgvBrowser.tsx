import {useEffect, useRef} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';

const IGV_CDN = 'https://cdn.jsdelivr.net/npm/igv@3.8.0/dist/igv.esm.min.js';

interface IgvBrowserProps {
  options: Record<string, unknown>;
}

function IgvBrowserInner({options}: IgvBrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const browserRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Dynamic import via new Function to avoid webpack processing the URL
      const igv = await (new Function('url', 'return import(url)'))(IGV_CDN);
      if (cancelled || !containerRef.current) return;
      browserRef.current = await igv.default.createBrowser(
        containerRef.current,
        options,
      );
    }

    init();

    return () => {
      cancelled = true;
      if (browserRef.current && containerRef.current) {
        try {
          const w = window as unknown as Record<string, unknown>;
          const igv = w.igv as {removeBrowser?: (b: unknown) => void} | undefined;
          igv?.removeBrowser?.(browserRef.current);
        } catch {
          // best effort cleanup
        }
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        background: '#ffffff',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    />
  );
}

export default function IgvBrowser(props: IgvBrowserProps) {
  return (
    <BrowserOnly fallback={<div style={{height: 400, background: '#fafafa', borderRadius: 8}} />}>
      {() => <IgvBrowserInner {...props} />}
    </BrowserOnly>
  );
}
