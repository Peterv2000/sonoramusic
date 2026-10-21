import { NavLink } from 'react-router-dom';
import { useI18n } from '../i18n/useI18n.jsx';
import Icon from './Icon.jsx';

export default function BottomNav() {
  const { t } = useI18n();
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end><span><Icon name="home" /></span>{t('home')}</NavLink>
      <NavLink to="/explore"><span><Icon name="explore" /></span>{t('explore')}</NavLink>
      <NavLink to="/library"><span><Icon name="library" /></span>{t('library')}</NavLink>
      <NavLink to="/settings"><span><Icon name="settings" /></span>{t('settings')}</NavLink>
    </nav>
  );
}
