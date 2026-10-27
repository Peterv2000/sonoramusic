import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';

export default function TopBar() {
  const nav = useNavigate();
  const { state } = useApp();
  const { t } = useI18n();
  const initial = (state.profile.name || ' Invitado').trim().charAt(0).toUpperCase();

  return (
    <header className="topbar">
      <button className="icon-btn only-mobile" onClick={() => nav('/')} aria-label="Inicio">
        <Logo size={26} />
      </button>
      <button className="search-pill search-pill-modern" onClick={() => nav('/search')} aria-label={t('search')}>
        <Icon name="search" size={18} />
        <span>{t('searchPlaceholder') || 'Buscar canciones, artistas...'}</span>
      </button>
      <div className="topbar-right">
        {state.pro.active && (
          <span className="badge-pro"><Icon name="star" size={12} /> {t('proBadge')}</span>
        )}
        <button className="icon-btn" onClick={() => nav('/settings')} aria-label={t('settings')}>
          <Icon name="settings" />
        </button>
        <button className="avatar-btn" onClick={() => nav('/profile')} aria-label={t('profile')}>
          {state.profile.avatar && state.profile.avatar !== '🎧' ? state.profile.avatar : initial || '🎧'}
        </button>
      </div>
    </header>
  );
}
