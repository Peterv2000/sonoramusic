import { useState } from 'react';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';

const PLANS = [
  { id: 'monthly', price: '4,99 €', per: 'perMonth', tag: null, months: 1 },
  { id: 'annual', price: '49,99 €', per: 'perYear', tag: 'save2Months', months: 12, popular: true },
  { id: 'family', price: '7,99 €', per: 'perMonth', tag: 'upTo6', months: 1 },
];

const FEATURES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];

export default function Pro() {
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const [sel, setSel] = useState('annual');
  const [paying, setPaying] = useState(false);
  const pro = state.pro.active;

  const subscribe = () => {
    if (pro) return;
    setPaying(true);
    // Simulación de pasarela de pago (aquí se integra Stripe / Play Billing)
    setTimeout(() => {
      const plan = PLANS.find((x) => x.id === sel);
      const expires = Date.now() + (plan.months * 30 * 24 * 3600 * 1000);
      dispatch({ type: 'activate-pro', plan: sel, expires });
      setPaying(false);
      toast('✦ ' + t('subActive'));
    }, 1200);
  };

  const cancel = () => {
    dispatch({ type: 'cancel-pro' });
    toast('✓ ' + t('cancelSub'));
  };

  return (
    <div className="page narrow">
      <div className="pro-hero">
        <div className="pro-glow" />
        <h1><Icon name="star" size={24} /> {t('goProTitle')}</h1>
        <p>{t('goProSub')}</p>
      </div>

      {pro ? (
        <section className="set-group">
          <div className="pro-status">
            <span className="badge-pro big">✦ {t('proBadge')}</span>
            <div>
              <strong>{t('subActive')}</strong>
              <small className="muted">
                {state.pro.plan} · {t('subSince')} {new Date(state.pro.since).toLocaleDateString()}
                {state.pro.expires && ` · renovación ${new Date(state.pro.expires).toLocaleDateString()}`}
              </small>
            </div>
          </div>
          <ul className="feature-list on">
            {FEATURES.map((f) => <li key={f}>✓ {t(f)}</li>)}
          </ul>
          <div className="modal-actions">
            <button className="btn" onClick={() => { dispatch({ type: 'restore-pro' }); toast('✓'); }}>{t('restore')}</button>
            <button className="btn danger" onClick={cancel}>{t('cancelSub')}</button>
          </div>
        </section>
      ) : (
        <>
          <ul className="feature-list">
            {FEATURES.map((f) => <li key={f}>✦ {t(f)}</li>)}
          </ul>

          <div className="plan-grid">
            {PLANS.map((pl) => (
              <button
                key={pl.id}
                className={`plan-card ${sel === pl.id ? 'sel' : ''} ${pl.popular ? 'popular' : ''}`}
                onClick={() => setSel(pl.id)}
              >
                {pl.popular && <span className="plan-tag">{t('mostPopular')}</span>}
                <strong>{t(pl.id)}</strong>
                <span className="plan-price">{pl.price}<small>{t(pl.per)}</small></span>
                {pl.tag && <em>{t(pl.tag)}</em>}
              </button>
            ))}
          </div>

          <button className="btn primary big-btn" disabled={paying} onClick={subscribe}>
            {paying ? '⏳…' : `✦ ${t('subscribeNow')} · ${PLANS.find((x) => x.id === sel).price}`}
          </button>
          <p className="muted center">{t('simulated')} — sin cargo real</p>
        </>
      )}

      <section className="set-group">
        <h2>{t('about')}</h2>
        <p className="muted pad">
          Este paywall es un simulacro completo: activa, cancela y restaura la suscripción localmente.
          Para cobrar de verdad, conecta Google Play Billing (APK) y Stripe (web) en <code>src/pages/Pro.jsx</code>.
        </p>
      </section>
    </div>
  );
}
