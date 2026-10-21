import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';

/* Fila de interruptor (toggle) */
function Toggle({ on, onChange, label, sub, pro }) {
  return (
    <label className={`setting-row ${pro && !on ? '' : ''}`}>
      <span className="set-label">
        <strong>{label}</strong>
        {sub && <small>{sub}</small>}
        {pro && <em className="pro-tag">✦ PRO</em>}
      </span>
      <span
        className={`switch ${on ? 'on' : ''}`}
        role="switch" aria-checked={on} tabIndex={0}
        onClick={() => onChange(!on)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!on); } }}
      />
    </label>
  );
}

/* Selector de opciones (segmented) */
function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? 'sel' : ''} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

export default function Settings() {
  const { state, dispatch } = useApp();
  const p = usePlayer();
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const s = state.settings;
  const pro = state.pro.active;
  const set = (value) => dispatch({ type: 'patch-settings', value });

  /* Funciones PRO: si no está activo, muestra paywall */
  const proGate = (fn) => () => {
    if (!pro) { toast('✦ ' + t('proNeeded')); location.hash = '#/pro'; return; }
    fn();
  };

  return (
    <div className="page narrow">
      <h1><Icon name="settings" size={24} /> {t('settings')}</h1>

      {/* ── Cuenta ── */}
      <section className="set-group">
        <h2>{t('account')}</h2>
        <div className="setting-row static">
          <span className="set-label"><strong>{state.profile.name}</strong><small>{state.profile.email || 'sin correo'}</small></span>
          <button className="btn" onClick={() => {
            const name = prompt(t('name'), state.profile.name);
            if (name != null) dispatch({ type: 'set', key: 'profile', value: { name: name.trim() || 'Invitado' } });
          }}><Icon name="sparkles" size={16} /></button>
        </div>
        <button className="setting-row link" onClick={() => location.hash = '#/pro'}>
          <span className="set-label">
            <strong>{t('subscription')}</strong>
            <small>{pro ? `${t('subActive')} · ${state.pro.plan}` : 'Free'}</small>
          </span>
          <span className={pro ? 'badge-pro' : 'go-pro-link'}>{pro ? '✦' : t('upgrade') + ' →'}</span>
        </button>
      </section>

      {/* ── Apariencia ── */}
      <section className="set-group">
        <h2>{t('appearance')}</h2>
        <div className="setting-row static col">
          <span className="set-label"><strong>{t('theme')}</strong></span>
          <Segmented
            value={s.theme}
            onChange={(v) => set({ theme: v })}
            options={[{ v: 'dark', l: t('themeDark') }, { v: 'light', l: t('themeLight') }, { v: 'system', l: t('themeSystem') }]}
          />
        </div>
        <div className="setting-row static col">
          <span className="set-label"><strong>{t('language')}</strong></span>
          <Segmented
            value={s.lang}
            onChange={(v) => set({ lang: v })}
            options={[{ v: 'es', l: 'Español' }, { v: 'en', l: 'English' }]}
          />
        </div>
      </section>

      {/* ── Reproducción ── */}
      <section className="set-group">
        <h2>{t('playback')}</h2>
        <div className="setting-row static col">
          <span className="set-label">
            <strong>{t('audioQuality')}</strong>
            {!pro && <em className="pro-tag">✦ PRO</em>}
          </span>
          <Segmented
            value={s.quality}
            onChange={(v) => proGate(() => set({ quality: v }))()}
            options={[
              { v: 'auto', l: t('qualityAuto') },
              { v: 'low', l: t('qualityLow') },
              { v: 'high', l: '✦ ' + t('qualityHigh') },
            ]}
          />
        </div>
        {/* ── Calidad avanzada (Apple Music style) ── */}
        <Toggle on={pro && s.lossless} pro label={t('lossless')} sub={t('losslessHint')}
          onChange={proGate(() => set({ lossless: !s.lossless }))} />
        <Toggle on={pro && s.spatial} pro label={t('spatial')} sub={t('spatialHint')}
          onChange={proGate(() => set({ spatial: !s.spatial }))} />
        <Toggle on={pro && s.gapless} pro label={t('gapless')} sub={t('gaplessHint')}
          onChange={proGate(() => set({ gapless: !s.gapless }))} />
        <Toggle on={pro && s.smartShuffle} pro label={t('smartShuffle')} sub={t('smartShuffleHint')}
          onChange={proGate(() => set({ smartShuffle: !s.smartShuffle }))} />
        <div className="setting-row static col">
          <span className="set-label">
            <strong><Icon name="equalizer" size={16} /> {t('equalizer')}</strong>
            {!pro && <em className="pro-tag">✦ PRO</em>}
          </span>
          <Segmented
            value={s.normalizeEQ}
            onChange={(v) => proGate(() => set({ normalizeEQ: v }))()}
            options={[
              { v: 'flat', l: 'Plano' },
              { v: 'bass', l: 'Graves' },
              { v: 'vocal', l: 'Voz' },
              { v: 'treble', l: 'Agudos' },
              { v: 'loud', l: 'Loud' },
            ]}
          />
        </div>
        <Toggle on={s.volumeNorm} pro={false} label={t('volumeNorm')} sub={s.volumeNorm ? 'ON' : 'OFF'}
          onChange={proGate(() => set({ volumeNorm: !s.volumeNorm }))} />
        <div className="setting-row static col">
          <span className="set-label">
            <strong>{t('crossfade')}</strong> · {s.crossfade} {t('seconds')}
            {!pro && <em className="pro-tag">✦ PRO</em>}
          </span>
          <input
            type="range" min="0" max="12" value={s.crossfade}
            onChange={(e) => proGate(() => set({ crossfade: Number(e.target.value) }))()}
            className="range"
          />
        </div>
        <Toggle on={s.autoplay} label={t('autoplay')} sub={t('autoplayHint')} onChange={(v) => set({ autoplay: v })} />
        <Toggle on={s.explicitFilter} label={t('explicitFilter')} onChange={(v) => set({ explicitFilter: v })} />
        <Toggle on={s.dataSaver} label={t('dataSaver')} onChange={(v) => set({ dataSaver: v })} />
        <Toggle on={pro && s.wifiOnlyHigh} pro label={t('wifiOnlyHigh')}
          onChange={proGate(() => set({ wifiOnlyHigh: !s.wifiOnlyHigh }))} />
      </section>

      {/* ── Vídeo y experiencia (YouTube Music / Spotify) ── */}
      <section className="set-group">
        <h2><Icon name="video" size={16} /> {t('videoExperience')}</h2>
        <Toggle on={s.autoVideo} label={t('autoVideo')} sub={t('autoVideoHint')} onChange={(v) => set({ autoVideo: v })} />
        <Toggle on={s.canvas} label={t('canvas')} sub={t('canvasHint')} onChange={(v) => set({ canvas: v })} />
        <Toggle on={s.crossDevice} label={t('crossDevice')} sub={t('crossDeviceHint')} onChange={(v) => set({ crossDevice: v })} />
        <button
          className="setting-row link"
          onClick={() => {
            if (p.track) { p.openFull(true); p.setPanel('lyrics'); }
            else toast(t('playFirst'));
          }}
        >
          <span className="set-label"><strong><Icon name="lyrics" size={15} /> {t('lyrics')}</strong><small>{t('lyricsHint')}</small></span>
          <span>→</span>
        </button>
        <button
          className="setting-row link"
          onClick={() => {
            if (p.track) { p.openFull(true); p.setPanel('queue'); }
            else toast(t('playFirst'));
          }}
        >
          <span className="set-label"><strong><Icon name="queue" size={15} /> {t('queue')}</strong><small>{t('queueHint')}</small></span>
          <span>→</span>
        </button>
      </section>

      {/* ── Dispositivos (Spotify Connect style) ── */}
      <section className="set-group">
        <h2><Icon name="cast" size={16} /> {t('devices')}</h2>
        <div className="setting-row static">
          <span className="set-label">
            <strong>{t('thisDevice')}</strong>
            <small><Icon name="check" size={13} /> {t('connected')} · PWA</small>
          </span>
          <span className="device-now"><Icon name="device" size={20} /></span>
        </div>
        <div className="setting-row static">
          <span className="set-label"><strong><Icon name="device" size={15} /> {t('appName')} Web</strong><small>{t('crossDeviceHint')}</small></span>
          <span className="muted">{pro ? '🔗' : '—'}</span>
        </div>
      </section>

      {/* ── Notificaciones ── */}
      <section className="set-group">
        <h2><Icon name="bell" size={16} /> {t('notifications')}</h2>
        <Toggle on={s.notifyReleases} label={t('notifyReleases')} onChange={(v) => set({ notifyReleases: v })} />
        <Toggle on={s.notifyRecs} label={t('notifyRecs')} onChange={(v) => set({ notifyRecs: v })} />
      </section>

      {/* ── Datos ── */}
      <section className="set-group">
        <h2><Icon name="folder" size={16} /> Datos</h2>
        <button className="setting-row link" onClick={() => { dispatch({ type: 'clear-history' }); toast('✓'); }}>
          <span className="set-label"><strong>{t('clearHistory')}</strong><small>{state.library.history.length} registros</small></span>
          <span>→</span>
        </button>
        <button className="setting-row link" onClick={() => { dispatch({ type: 'clear-searches' }); toast('✓'); }}>
          <span className="set-label"><strong>{t('clearSearches')}</strong></span>
          <span>→</span>
        </button>
        <button className="setting-row link danger" onClick={() => {
          if (confirm('¿' + t('reset') + '?')) { dispatch({ type: 'reset' }); toast('✓'); }
        }}>
          <span className="set-label"><strong>{t('reset')}</strong></span>
          <span>→</span>
        </button>
      </section>

      {/* ── Acerca de ── */}
      <section className="set-group">
        <h2>{t('about')}</h2>
        <div className="setting-row static">
          <span className="set-label">
            <strong>{t('appName')}</strong>
            <small>{t('version')} 1.0.0 · PWA + Capacitor</small>
          </span>
          <span className="brand-logo small"><Logo size={24} /></span>
        </div>
        <p className="muted pad">
          Demo no oficial al estilo YouTube Music. La reproducción usa el reproductor embebido de YouTube.
          Las funciones marcadas ✦ PRO son un simulacro listo para conectar pagos reales (Play Billing / Stripe).
        </p>
        <button className="setting-row" onClick={() => nav('/admin')}>
          <span className="set-label">
            <strong>{t('adminTitle')}</strong>
            <small>{t('adminSub')}</small>
          </span>
          <span>→</span>
        </button>
      </section>
    </div>
  );
}
