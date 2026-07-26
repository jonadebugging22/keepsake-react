import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Desk({ userId, onOpenPictures, onOpenVideos, onOpenMusic }) {
  const [counts, setCounts] = useState({ pictures: 0, videos: 0 });

  useEffect(() => {
    let cancelled = false;
    async function loadCounts() {
      if (!userId) return;
      const { data } = await supabase.from("media_items").select("kind").eq("user_id", userId);
      if (cancelled) return;
      const items = data || [];
      setCounts({
        pictures: items.filter((i) => i.kind === "image").length,
        videos: items.filter((i) => i.kind === "video").length
      });
    }
    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section id="desk-screen" className="screen">
      <header className="desk-header">
        <h1 className="brand">Alvebum</h1>
        <button className="link-btn" onClick={() => supabase.auth.signOut()}>
          sign out
        </button>
      </header>
      <hr className="stitch-divider" />

      <div className="folders">
        <button className="folder-card" onClick={onOpenPictures}>
          <div className="folder-icon folder-icon--pictures">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6" width="18" height="14" rx="2" />
              <circle cx="12" cy="13" r="3.5" />
              <path d="M8 6l1.5-2.5h5L16 6" />
            </svg>
          </div>
          <span className="folder-label">Pictures</span>
          <span className="folder-count">
            {counts.pictures} photo{counts.pictures === 1 ? "" : "s"}
          </span>
        </button>

        <button className="folder-card" onClick={onOpenVideos}>
          <div className="folder-icon folder-icon--videos">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6" width="14" height="12" rx="2" />
              <path d="M17 10l4-2.5v9L17 14" />
            </svg>
          </div>
          <span className="folder-label">Videos</span>
          <span className="folder-count">
            {counts.videos} clip{counts.videos === 1 ? "" : "s"}
          </span>
        </button>
      </div>

      <button className="music-fab" onClick={onOpenMusic}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l11-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
        </svg>
        <span>Favorite Music</span>
      </button>
    </section>
  );
}
