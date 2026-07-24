import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function parseMusicLink(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      let videoId = "";
      if (u.hostname.includes("youtu.be")) {
        videoId = u.pathname.slice(1);
      } else {
        videoId = u.searchParams.get("v") || "";
        if (!videoId && u.pathname.startsWith("/embed/")) {
          videoId = u.pathname.split("/embed/")[1];
        }
      }
      if (videoId) return { platform: "youtube", embedUrl: `https://www.youtube.com/embed/${videoId}` };
    }
    if (u.hostname.includes("open.spotify.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const [type, id] = parts;
        return { platform: "spotify", embedUrl: `https://open.spotify.com/embed/${type}/${id}` };
      }
    }
    return { platform: "other", embedUrl: null };
  } catch {
    return { platform: "other", embedUrl: null };
  }
}

export default function MusicPanel({ userId, onClose, toast }) {
  const [songs, setSongs] = useState([]);
  const [url, setUrl] = useState("");

  const loadSongs = async () => {
    const { data, error } = await supabase
      .from("favorite_songs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      toast("Couldn't load your songs.");
      return;
    }
    setSongs(data || []);
  };

  useEffect(() => {
    loadSongs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    const { platform } = parseMusicLink(trimmed);

    const { error } = await supabase.from("favorite_songs").insert({ user_id: userId, url: trimmed, platform });
    if (error) {
      toast("Couldn't add that song.");
      return;
    }
    setUrl("");
    loadSongs();
  };

  const removeSong = async (id) => {
    await supabase.from("favorite_songs").delete().eq("id", id);
    loadSongs();
  };

  return (
    <div className="panel">
      <div className="panel-backdrop" onClick={onClose} />
      <div className="panel-content">
        <header className="panel-header">
          <h2>Favorite Music</h2>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </header>
        <form className="add-song-form" onSubmit={onSubmit}>
          <input
            type="url"
            placeholder="Paste a YouTube or Spotify link"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
        <div className="songs-list">
          {songs.map((row) => {
            const { embedUrl } = parseMusicLink(row.url);
            return (
              <div key={row.id} className="song-card">
                {embedUrl && row.platform === "youtube" && (
                  <iframe
                    src={embedUrl}
                    height="160"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    loading="lazy"
                    title={row.url}
                  />
                )}
                {embedUrl && row.platform === "spotify" && (
                  <iframe src={embedUrl} height="152" allow="encrypted-media" loading="lazy" title={row.url} />
                )}
                {!embedUrl && (
                  <div className="song-card-fallback">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M9 18V5l11-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="17" cy="16" r="3" />
                    </svg>
                    <a href={row.url} target="_blank" rel="noopener noreferrer">
                      {row.url}
                    </a>
                  </div>
                )}
                <div className="song-actions">
                  <button className="song-remove" title="Remove" onClick={() => removeSong(row.id)}>
                    &times;
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {songs.length === 0 && (
          <p className="empty-hint">No songs yet — paste a link above to add your first one.</p>
        )}
      </div>
    </div>
  );
}
