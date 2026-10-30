import { useState } from 'react';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';

const PLANS = [
  { id: 'monthly', price: '$4.900', per: 'perMonth', tag: null, months: 1 },
  { id: 'annual', price: '$39.900', per: 'perYear', tag: 'save3Months', months: 12, popular: true },
  { id: 'family', price: '$7.900', per: 'perMonth', tag: 'upTo6', months: 1 },
];

const FREE_FEATURES = ['free1', 'free2', 'free3', 'free4'];
const PRO_FEATURES = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const FAMILY_FEATURES = ['fam1', 'fam2', 'fam3', 'fam4'];

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
                {state.pro.expires && ` · ${t('renewsOn')} ${new Date(state.pro.expires).toLocaleDateString()}`}
              </small>
            </div>
          </div>
          <div className="pro-plan-detail">
            <strong>{t(state.pro.plan === 'family' ? 'family' : (state.pro.plan === 'annual' ? 'annual' : 'monthly'))}</strong>
            <small className="muted">{state.pro.plan === 'family' ? t('upTo6') : state.pro.plan === 'annual' ? t('save2Months') : t('perMonth')}</small>
          </div>
          <h4 style={{ marginTop: 14 }}>{t('included')}</h4>
          <ul className="feature-list on">
            {[...PRO_FEATURES, ...(state.pro.plan === 'family' ? FAMILY_FEATURES : [])].map((f) => <li key={f}>✓ {t(f)}</li>)}
          </ul>
          {state.pro.plan === 'family' && (
            <>
              <h4>{t('familyMembers')}</h4>
              <div className="family-members">
                {(state.pro.familyMembers || []).length === 0 ? <p className="muted">{t('noMembersYet')}</p> : (state.pro.familyMembers || []).map((m, i) => <div key={i} className="chip">{m}</div>)}
                <button className="btn" onClick={() => toast(t('inviteComing'))}>{t('inviteMember')}</button>
              </div>
            </>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={() => { dispatch({ type: 'restore-pro' }); toast('✓'); }}>{t('restore')}</button>
            <button className="btn danger" onClick={cancel}>{t('cancelSub')}</button>
          </div>
        </section>
      ) : (
        <>
          <section className="set-group">
            <h2>{t('freePlan')}</h2>
            <ul className="feature-list">
              {FREE_FEATURES.map((f) => <li key={f}>✓ {t(f)}</li>)}
            </ul>
          </section>

          <section className="set-group">
            <h2>{t('proPlans')}</h2>
            <ul className="feature-list">
              {PRO_FEATURES.map((f) => <li key={f}>✦ {t(f)}</li>)}
            </ul>
            <ul className="feature-list family">
              {FAMILY_FEATURES.map((f) => <li key={f}>✦ {t(f)}</li>)}
            </ul>
          </section>

          <div className="plan-grid pro-grid">
            {PLANS.map((pl) => (
              <button
                key={pl.id}
                className={`plan-card pro-card-modern ${sel === pl.id ? 'sel' : ''} ${pl.popular ? 'popular' : ''}`}
                onClick={() => setSel(pl.id)}
              >
                {pl.popular && <span className="plan-tag">{t('mostPopular') || 'Más popular'}</span>}
                <div className="plan-head">
                  <strong>{t(pl.id)}</strong>
                  {pl.id === 'annual' && <span className="plan-badge">-65%</span>}
                </div>
                <div className="plan-price-wrap">
                  <span className="plan-price">{pl.price}</span>
                  <span className="plan-per">{t(pl.id === 'annual' ? 'perYear' : 'perMonth')}</span>
                </div>
                {pl.id === 'annual' && <div className="plan-sub">~$3.325{t('perMonth')}</div>}
                <ul className="plan-list">
                  <li>{t('planNoAds')}</li>
                  <li>{t('planBackground')}</li>
                  <li>{t('planHQ')}</li>
                  {pl.id === 'family' && <li>{t('upTo6')}</li>}
                  {pl.id === 'annual' && <li>{t('planSaving')}</li>}
                </ul>
              </button>
            ))}
          </div>

          <button className="btn primary big-btn" disabled={paying} onClick={subscribe}>
            {paying ? '⏳…' : `✦ ${t('subscribeNow')} · ${PLANS.find((x) => x.id === sel).price}`}
          </button>
          <p className="muted center">{t('priceCopNote')}</p>
        </>
      )}

      <section className="set-group">
        <h2>{t('about')}</h2>
        <p className="muted pad">
          {t('proDemoNote')} <code>src/pages/Pro.jsx</code>.
        </p>
      </section>
    </div>
  );
}