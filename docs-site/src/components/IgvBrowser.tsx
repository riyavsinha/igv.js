import {useEffect, useRef} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';

const UPSTREAM_CDN = 'https://cdn.jsdelivr.net/npm/igv@3.8.0/dist/igv.esm.min.js';
const FORK_CDN = 'https://cdn.jsdelivr.net/npm/@riyavsinha/igv@0.1.0/dist/igv.esm.min.js';

interface IgvBrowserProps {
  options: Record<string, unknown>;
  fork?: boolean;
}

function IgvBrowserInner({options, fork = false}: IgvBrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const browserRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const cdn = fork ? FORK_CDN : UPSTREAM_CDN;
      // Dynamic import via new Function to avoid webpack processing the URL
      const igv = await (new Function('url', 'return import(url)'))(cdn);
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

function SingleBrowser(props: IgvBrowserProps) {
  return (
    <BrowserOnly fallback={<div style={{height: 400, background: '#fafafa', borderRadius: 8}} />}>
      {() => <IgvBrowserInner {...props} />}
    </BrowserOnly>
  );
}

interface IgvComparisonProps {
  options: Record<string, unknown>;
}

export function IgvComparison({options}: IgvComparisonProps) {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
      <div>
        <div style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
          opacity: 0.5,
          marginBottom: '0.5rem',
        }}>
          igv.js (upstream)
        </div>
        <SingleBrowser options={options} fork={false} />
      </div>
      <div>
        <div style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
          opacity: 0.5,
          marginBottom: '0.5rem',
        }}>
          igv.ts (fork)
        </div>
        <SingleBrowser options={options} fork={true} />
      </div>
    </div>
  );
}

export default SingleBrowser;
