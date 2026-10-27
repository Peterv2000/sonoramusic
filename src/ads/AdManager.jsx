import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

const AdCtx = createContext(null);

const LS_ADS = 'ritmo_ads_config';
const LS_COUNT = 'ritmo_songs_count';

export function AdProvider({ children }) {
  const { isPro, isAdmin, user } = useAuth();
  const [config, setConfig] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_ADS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      enabled: true,
      everyNCanciones: 10,
      skipAfterSec: 7,
      providerUrl: '',
      maxSkipSec: 10,
    };
  });

  const [showAd, setShowAd] = useState(false);
  const [count, setCount] = useState(() => {
    try { return Number(localStorage.getItem(LS_COUNT) || '0'); } catch { return 0; }
  });
  const [secondsLeft, setSecondsLeft] = useState(7);
  const canSkipRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(LS_ADS, JSON.stringify(config)); } catch {}
  }, [config]);

  useEffect(() => {
    try { localStorage.setItem(LS_COUNT, String(count)); } catch {}
  }, [count]);

  const incrementPlay = () => {
    if (isPro || isAdmin) return;
    if (!config.enabled) return;
    setCount(c => {
      const nc = c + 1;
      if (nc > 0 && nc % config.everyNCanciones === 0) {
        setShowAd(true);
        setSecondsLeft(config.skipAfterSec || 7);
        canSkipRef.current = false;
      }
      return nc;
    });
  };

  useEffect(() => {
    if (!showAd) return;
    canSkipRef.current = false;
    const iv = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          canSkipRef.current = true;
          clearInterval(iv);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [showAd]);

  const skip = () => {
    if (!canSkipRef.current) return;
    setShowAd(false);
  };

  const value = useMemo(() => ({ config, setConfig, incrementPlay, showAd, skip, secondsLeft, canSkip: canSkipRef.current }), [config, showAd, secondsLeft]);
  return (
    <AdCtx.Provider value={value}>
      {children}
      {showAd && !isPro && !isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90%', maxWidth: 720, aspectRatio: '16/9', background: '#111', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
            {config.providerUrl ? (
              <iframe src={config.providerUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Anuncio" allow="autoplay; fullscreen" />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#fff' }}>
                <h2>Anuncio</h2>
                <p style={{ opacity: 0.7 }}>Configura un proveedor de anuncios desde el panel de administración</p>
              </div>
            )}
            <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
              {canSkipRef.current ? (
                <button onClick={skip} style={{ padding: '10px 18px', borderRadius: 8, background: '#fff', color: '#000', border: 'none', fontWeight: 600 }}>Omitir anuncio</button>
              ) : (
                <button disabled style={{ padding: '10px 18px', borderRadius: 8, background: 'rgba(255,255,255,0.4)', color: '#000', border: 'none' }}>Omitir en {secondsLeft}s</button>
              )}
            </div>
          </div>
          <p style={{ color: '#fff', opacity: 0.6, marginTop: 12, fontSize: 13 }}>Reproducción continua tras omitir o finalizar anuncio</p>
        </div>
      )}
    </AdCtx.Provider>
  );
}

export const useAds = () => useContext(AdCtx);
