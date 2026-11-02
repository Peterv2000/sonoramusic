import { NavLink } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';

export default function Sidebar() {
  const { state } = useApp();
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const pl = state.library.playlists;

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo size={30} />
        <span className="brand-name">Sonora<em>Music</em></span>
      </div>

      <nav className="side-nav">
        <NavLink to="/" end title={t('home')}><span className="ico"><Icon name="home" /></span>{t('home')}</NavLink>
        <NavLink to="/explore" title={t('explore')}><span className="ico"><Icon name="explore" /></span>{t('explore')}</NavLink>
        <NavLink to="/library" title={t('library')}><span className="ico"><Icon name="library" /></span>{t('library')}</NavLink>
        <NavLink to="/search" title={t('search')}><span className="ico"><Icon name="search" /></span>{t('search')}</NavLink>
        <NavLink to="/charts" title={t('charts')}><span className="ico"><Icon name="charts" /></span>{t('charts')}</NavLink>
      </nav>

      <div className="side-section">
        <NavLink to="/library" className="side-head">{t('library')}</NavLink>
        <NavLink to="/liked" className="side-link"><span className="ico"><Icon name="heart" /></span>{t('likedSongs')}</NavLink>
        <NavLink to="/history" className="side-link"><span className="ico"><Icon name="history" /></span>{t('history')}</NavLink>
        <NavLink to="/library" className="side-link"><span className="ico"><Icon name="album" /></span>{t('albums')}</NavLink>
        <NavLink to="/library" className="side-link"><span className="ico"><Icon name="artist" /></span>{t('artists')}</NavLink>
      </div>

      <div className="side-section">
        <span className="side-head">{t('playlists')}</span>
        {pl.length === 0 && <p className="side-empty">—</p>}
        {pl.map((p) => (
          <NavLink key={p.id} to={`/playlist/${p.id}`} className="side-link">
            <span className="ico"><Icon name="playlist" /></span>{p.name}
          </NavLink>
        ))}
      </div>

      <div className="side-section side-admin">
        <NavLink to="/admin" className="side-link admin-link" title={t('admin')}>
          <span className="ico"><Icon name={isAdmin ? 'settings' : 'lock'} /></span>{t('admin')}
        </NavLink>
      </div>

      <div className="side-foot">
        <NavLink to="/pro" className="pro-card">
          <span className="pro-star"><Icon name="star" size={16} /></span>
          <span>
            <strong>{t('upgrade')}</strong>
            <small>{state.pro.active ? t('subActive') : 'Sonora · Demo'}</small>
          </span>
        </NavLink>
      </div>
    </aside>
  );
}
