import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './state/AppState.jsx';
import { usePlayer } from './player/PlayerContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import BottomNav from './components/BottomNav.jsx';
import MiniPlayer from './components/MiniPlayer.jsx';
import FullPlayer from './components/FullPlayer.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Home from './pages/Home.jsx';
import Explore from './pages/Explore.jsx';
import Library from './pages/Library.jsx';
import Search from './pages/Search.jsx';
import Playlist from './pages/Playlist.jsx';
import Liked from './pages/Liked.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import Pro from './pages/Pro.jsx';
import Profile from './pages/Profile.jsx';
import Artist from './pages/Artist.jsx';
import Album from './pages/Album.jsx';
import Charts from './pages/Charts.jsx';
import Admin from './pages/Admin.jsx';
import { I18nCtx } from './i18n/useI18n.jsx';

export default function App() {
  const { state } = useApp();
  const { fullOpen } = usePlayer();

  return (
    <I18nCtx.Provider value={state.settings.lang}>
      <ToastProvider>
        <div className="app">
          <Sidebar />
          <div className="main">
            <TopBar />
            <main className="content">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/library" element={<Library />} />
                <Route path="/search" element={<Search />} />
                <Route path="/playlist/:id" element={<Playlist />} />
                <Route path="/liked" element={<Liked />} />
                <Route path="/history" element={<History />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/pro" element={<Pro />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/charts" element={<Charts />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/artist/:name" element={<Artist />} />
                <Route path="/album/:id" element={<Album />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
          <MiniPlayer />
          <BottomNav />
          {fullOpen && <FullPlayer />}
        </div>
      </ToastProvider>
    </I18nCtx.Provider>
  );
}
