import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/useI18n.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import Icon from './Icon.jsx';
import { reportIssue, runDiagnostics } from '../api/telemetry.js';

/* Asistente flotante: FAQs, diagnóstico automático y reporte en un toque. */
export default function SupportBot() {
  const { t } = useI18n();
  const { track } = usePlayer();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('faq');
  const [diag, setDiag] = useState(null);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const faqs = useMemo(() => ([
    ['supportFaq1Q', 'supportFaq1A'],
    ['supportFaq2Q', 'supportFaq2A'],
    ['supportFaq3Q', 'supportFaq3A'],
    ['supportFaq4Q', 'supportFaq4A'],
    ['supportFaq5Q', 'supportFaq5A'],
  ]), []);

  const diagnose = async () => {
    setChecking(true);
    try { setDiag(await runDiagnostics()); } finally { setChecking(false); }
  };

  useEffect(() => {
    if (!open) return;
    setSent(false);
    diagnose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = (issue) => {
    reportIssue({
      type: 'support',
      severity: issue === 'other' ? 'info' : 'warning',
      message: `reporte de usuario: ${issue}${note ? ` · ${note}` : ''}`,
      track,
      source: 'support-widget',
      latencyMs: diag?.apiMs || 0,
      context: { issue, note, diagnostics: diag },
    }, { force: true });
    setSent(true);
    setNote('');
  };

  const healthy = diag?.online && diag?.api;

  return (
    <>
      <button
        className={`support-fab ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t('supportClose') : t('supportOpen')}
        title={open ? t('supportClose') : t('supportOpen')}
      >
        <Icon name={open ? 'close' : 'help'} size={20} />
        {!open && <span className="support-fab-dot" />}
      </button>

      {open && (
        <section className="support-panel" role="dialog" aria-label={t('supportTitle')}>
          <header className="support-head">
            <div>
              <strong>{t('supportTitle')}</strong>
              <small>{t('supportHello')}</small>
            </div>
            <button className="support-x" onClick={() => setOpen(false)} aria-label={t('supportClose')}>
              <Icon name="close" size={16} />
            </button>
          </header>

          <div className="support-tabs">
            <button className={tab === 'faq' ? 'active' : ''} onClick={() => setTab('faq')}><Icon name="help" size={14} /> {t('supportFaq')}</button>
            <button className={tab === 'diagnostics' ? 'active' : ''} onClick={() => setTab('diagnostics')}><Icon name="pulse" size={14} /> {t('supportDiagnostics')}</button>
            <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}><Icon name="flag" size={14} /> {t('supportReport')}</button>
          </div>

          <div className="support-body">
            {tab === 'faq' && (
              <div className="support-faq">
                {faqs.map(([q, a]) => (
                  <details key={q}>
                    <summary>{t(q)}</summary>
                    <p>{t(a)}</p>
                  </details>
                ))}
              </div>
            )}

            {tab === 'diagnostics' && (
              <div className="support-diag">
                <div className={`support-status ${healthy ? 'ok' : (diag ? 'warn' : '')}`}>
                  <Icon name={healthy ? 'check' : 'warning'} size={16} />
                  <span>{checking ? t('supportChecking') : healthy ? t('supportOk') : t('supportIssue')}</span>
                </div>
                <div className="support-grid">
                  <span>{t('supportOnline')}</span><b>{diag ? (diag.online ? t('supportYes') : t('supportNo')) : '—'}</b>
                  <span>{t('supportApi')}</span><b>{diag ? (diag.api ? `${t('supportYes')} · ${diag.apiMs} ms` : t('supportNo')) : '—'}</b>
                  <span>{t('supportLatency')}</span><b>{diag ? `${diag.apiMs} ms` : '—'}</b>
                  <span>{t('supportPlatform')}</span><b>{diag?.platform || '—'}</b>
                  <span>{t('supportConnection')}</span><b>{diag?.connection || '—'}</b>
                </div>
                {diag?.apiError && <p className="support-err">{diag.apiError}</p>}
                <button className="btn small" onClick={diagnose} disabled={checking}>
                  <Icon name="refresh" size={14} /> {t('supportCheck')}
                </button>
              </div>
            )}

            {tab === 'report' && (
              <div className="support-report">
                {sent ? (
                  <div className="support-thanks">
                    <Icon name="check" size={22} />
                    <p>{t('supportThanks')}</p>
                    <button className="btn small" onClick={() => setSent(false)}>{t('supportAnother')}</button>
                  </div>
                ) : (
                  <>
                    <p className="muted">{t('supportReportHint')}</p>
                    {track && (
                      <div className="support-track">
                        <img src={track.thumb} alt="" loading="lazy" />
                        <div><strong>{track.title}</strong><small>{track.artist}</small></div>
                      </div>
                    )}
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t('supportNote')}
                      maxLength={300}
                      rows={2}
                    />
                    <div className="support-actions">
                      <button className="btn small" onClick={() => send('wrong-song')}>{t('supportBadSong')}</button>
                      <button className="btn small" onClick={() => send('no-play')}>{t('supportNoPlay')}</button>
                      <button className="btn small" onClick={() => send('audio-cut')}>{t('supportAudioCut')}</button>
                      <button className="btn small" onClick={() => send('other')}>{t('supportOther')}</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
