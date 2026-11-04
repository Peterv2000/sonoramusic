import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import { DJAvatar } from '../components/DJ.jsx';
import { ARTISTS } from '../data/catalog.js';
import { useCategories } from '../api/categories.js';

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
  const { categories } = useCategories();
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

      {/* ── Cuenta y dispositivos ── */}
      <section className="set-group">
        <h2>{t('account')}</h2>
        {state.auth.loggedIn ? (
          <>
            <div className="setting-row static">
              <span className="set-label">
                <strong>{state.auth.name || state.profile.name}</strong>
                <small>{state.auth.email || state.profile.email || t('linkedAccount')}</small>
              </span>
              <span className={pro ? 'badge-pro' : 'chip'}>{pro ? `✦ ${state.pro.plan === 'family' ? t('family') : state.pro.plan === 'annual' ? t('annual') : t('monthly')}` : t('freePlan')}</span>
            </div>
            <button className="setting-row link" onClick={() => location.hash = '#/pro'}>
              <span className="set-label">
                <strong>{t('subscription')}</strong>
                <small>{pro ? t('subActive') : t('upgradeToPro')}</small>
              </span>
              <span>→</span>
            </button>
            <button className="setting-row link" onClick={() => {
              dispatch({ type: 'sync-now' });
              toast(t('syncDone'));
            }}>
              <span className="set-label">
                <strong>{t('syncNow')}</strong>
                <small>{state.sync.lastSyncAt ? `${t('lastSync')}: ${new Date(state.sync.lastSyncAt).toLocaleTimeString()}` : t('syncHint')}</small>
              </span>
              <span>↻</span>
            </button>
            <button className="setting-row link danger" onClick={() => {
              if (confirm(t('logoutConfirm'))) { dispatch({ type: 'logout' }); toast(t('loggedOut')); }
            }}>
              <span className="set-label">
                <strong>{t('logout')}</strong>
                <small>{t('logoutAllDevices')}</small>
              </span>
              <span>→</span>
            </button>
          </>
        ) : (
          <>
            <p className="muted pad small">{t('loginHint')}</p>
            <button className="btn primary" onClick={() => {
              const email = prompt(t('email'));
              if (!email) return;
              const name = prompt(t('name'), 'Usuario');
              dispatch({ type: 'login', email, name: name || 'Usuario' });
              dispatch({ type: 'update-devices', devices: [{ id: 'dev-' + Date.now().toString(36), name: 'Este dispositivo (Web/PWA)', type: 'web', lastActive: Date.now(), current: true }] });
              toast(t('loggedIn'));
            }}><Icon name="user" size={16} /> {t('login')}</button>
            <button className="btn" onClick={() => {
              const name = prompt(t('name'), 'Usuario');
              dispatch({ type: 'login', name: name || 'Usuario', email: '' });
              dispatch({ type: 'update-devices', devices: [{ id: 'dev-' + Date.now().toString(36), name: 'Este dispositivo (Web/PWA)', type: 'web', lastActive: Date.now(), current: true }] });
              toast(t('accountCreated'));
            }}>{t('createAccount')}</button>
          </>
        )}
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

      {/* ── DJ Ritmo (locutor virtual interactivo) ── */}
      <section className="set-group dj-settings">
        <h2><Icon name="micVocal" size={16} /> {t('dj')}</h2>
        <div className="dj-card">
          <DJAvatar speaking={p.djSpeaking} size={88} />
          <div className="dj-card-text">
            <strong>{t('dj')}</strong>
            <small>{t('djDesc')}</small>
          </div>
          <button
            className={`btn ${s.dj ? '' : 'primary'}`}
            onClick={() => {
              const next = !s.dj;
              set({ dj: next });
              if (next) { setTimeout(() => p.djGreet(), 120); toast(t('dj')); }
            }}
          ><Icon name={s.dj ? 'check' : 'mic'} size={15} /> {s.dj ? t('djOn') : t('djOn')}</button>
        </div>
        <Toggle on={s.dj} label={t('djOn')} sub={t('djDesc')} onChange={(v) => { set({ dj: v }); if (v) setTimeout(() => p.djGreet(), 120); }} />
        <Toggle on={s.dj && s.djVoice} label={t('djVoiceOn')} sub={t('djVoiceDesc')} onChange={(v) => set({ djVoice: v, dj: v ? true : s.dj })} />
        <label className="setting-row">
          <span className="set-label">
            <strong>{t('djRate')}</strong>
            <small>{Number(s.djRate || 1).toFixed(1)}×</small>
          </span>
          <input
            type="range" min="0.6" max="1.6" step="0.1"
            value={s.djRate || 1}
            onChange={(e) => set({ djRate: Number(e.target.value) })}
            aria-label={t('djRate')}
          />
        </label>
      </section>

      {/* ── Vídeo y experiencia (YouTube Music / Spotify) ── */}
      {/* ── Gustos musicales (Fase A) ── */}
      <section className="set-group">
        <h2><Icon name="sparkles" size={16} /> {t('favoriteGenres')}</h2>
        <p className="muted pad small">{t('favoriteGenresHint')}</p>
        <div className="taste-grid">
          {categories.map((g) => {
            const on = (state.library.favoriteGenres || []).includes(g.id);
            return (
              <button
                key={g.id}
                className={`taste-chip ${on ? 'on' : ''}`}
                style={{ '--g': g.color }}
                onClick={() => dispatch({ type: 'toggle-favorite-genre', genre: g.id })}
              >{g.id}</button>
            );
          })}
        </div>
        <div className="taste-artists">
          {ARTISTS.slice(0, 16).map((a) => {
            const on = (state.library.favoriteArtists || []).includes(a.name);
            return (
              <button
                key={a.name}
                className={`taste-artist ${on ? 'on' : ''}`}
                onClick={() => dispatch({ type: 'toggle-favorite-artist', name: a.name })}
              >
                <img src={a.thumb} alt="" />
                {a.name}
              </button>
            );
          })}
        </div>
      </section>

      <section className="set-group">
        <h2><Icon name="video" size={16} /> {t('videoExperience')}</h2>        <Toggle on={s.autoVideo} label={t('autoVideo')} sub={t('autoVideoHint')} onChange={(v) => set({ autoVideo: v })} />
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

      {/* ── Dispositivos vinculados (Spotify Connect style) ── */}
      <section className="set-group">
        <h2><Icon name="cast" size={16} /> {t('devices')}</h2>
        {state.auth.loggedIn ? (
          <>
            <p className="muted pad small">{t('linkedDevicesHint')}</p>
            {(state.devices || []).map((d) => (
              <div key={d.id} className="setting-row static">
                <span className="set-label">
                  <strong>{d.name}</strong>
                  <small>{d.current ? `${t('thisDevice')} · ${t('active')}` : `${t('lastActive')}: ${d.lastActive ? new Date(d.lastActive).toLocaleString() : '-'}`}</small>
                </span>
                {!d.current ? (
                  <button className="btn" onClick={() => { dispatch({ type: 'remove-device', id: d.id }); toast(t('deviceRemoved')); }}>{t('signOutDevice')}</button>
                ) : (
                  <span className="device-now">✓</span>
                )}
              </div>
            ))}
            {(state.devices || []).length === 0 && (
              <div className="setting-row static">
                <span className="set-label"><strong>{t('thisDevice')}</strong><small>{t('connected')} · PWA</small></span>
                <span className="device-now">✓</span>
              </div>
            )}
            <button className="btn" onClick={() => {
              const devs = [...(state.devices || [])];
              devs.push({ id: 'dev-' + Date.now().toString(36), name: `Dispositivo vinculado ${devs.length + 1}`, type: 'mobile', lastActive: Date.now(), current: false });
              dispatch({ type: 'update-devices', devices: devs });
              toast(t('deviceLinked'));
            }}>{t('linkDevice')}</button>
          </>
        ) : (
          <p className="muted pad small">{t('loginToLinkDevices')}</p>
        )}
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
          Demo no oficial de música en streaming. Las funciones marcadas ✦ PRO son un simulacro
          listo para conectar pagos reales (Play Billing / Stripe).
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
