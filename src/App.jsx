import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Auth from "./components/Auth";
import Desk from "./components/Desk";
import PicturesScreen from "./components/PicturesScreen";
import VideosScreen from "./components/VideosScreen";
import MusicPanel from "./components/MusicPanel";
import { MusicPlayerProvider, useMusicPlayer } from "./components/MusicPlayerContext";
import Toast from "./components/Toast";
import "./App.css";
import "./MusicPlayer.css";

// Split out so it can call useMusicPlayer() — that hook only works INSIDE
// <MusicPlayerProvider>, so this inner component sits below it in the tree.
function AppContent({ userId, view, setView, toast }) {
  const { isOpen: musicOpen, open: openMusic, close: closeMusic } = useMusicPlayer();

  return (
    <>
      {view === "desk" && (
        <Desk
          userId={userId}
          onOpenPictures={() => setView("pictures")}
          onOpenVideos={() => setView("videos")}
          onOpenMusic={openMusic}
        />
      )}
      {view === "pictures" && <PicturesScreen userId={userId} onBack={() => setView("desk")} toast={toast} />}
      {view === "videos" && <VideosScreen userId={userId} onBack={() => setView("desk")} toast={toast} />}

      {musicOpen && <MusicPanel onClose={closeMusic} />}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [view, setView] = useState("desk"); // desk | pictures | videos
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(null);

  const toast = (msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setView("desk");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null; // brief initial load, avoid a flash of the auth screen
  if (!session) return <Auth />;

  const userId = session.user.id;

  return (
    <div className="app-shell">
      <MusicPlayerProvider userId={userId} toast={toast}>
        <AppContent userId={userId} view={view} setView={setView} toast={toast} />
      </MusicPlayerProvider>

      <Toast message={toastMsg} />
    </div>
  );
}