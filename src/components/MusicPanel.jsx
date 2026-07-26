import { getPlaybackInfo, useMusicPlayer } from "./MusicPlayerContext";
import { useEffect, useRef, useState } from "react";

function songLabel(row) {
  if (row.platform === "file") {
    try {
      const path = decodeURIComponent(new URL(row.url).pathname);
      return path.split("/").pop();
    } catch {
      return row.url;
    }
  }
  return row.url;
}

export default function MusicPanel({ onClose }) {
  const { songs, addSong, addSongFile, removeSong, playSong, stopSong, nowPlaying, isPaused, togglePause, registerModalSlot } =
    useMusicPlayer();
  const [url, setUrl] = useState("");
  const anchorRef = useRef(null);
  const fileInputRef = useRef(null);

  // Hand our anchor div to the shared player while this modal is mounted, so
  // the persistent "now playing" embed renders right here (inside the modal
  // layout) instead of next to the floating vinyl. On unmount, hand back null
  // so the provider re-docks the same embed next to the vinyl icon instead
  // of destroying it — that's what keeps playback going after you close this.
  useEffect(() => {
    registerModalSlot(anchorRef.current);
    return () => registerModalSlot(null);
  }, [registerModalSlot]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    await addSong(url);
    setUrl("");
  };

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await addSongFile(file);
    e.target.value = "";
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

        <button type="button" className="upload-audio-btn" onClick={() => fileInputRef.current?.click()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          <span>Or upload a music file from your phone</span>
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={onFileChosen} />

        {nowPlaying && (
          <div className="now-playing-card">
            <p className="now-playing-label">Now playing</p>
            <div ref={anchorRef} className="now-playing-modal-slot-anchor" />
            <div className="now-playing-actions">
              <a href={nowPlaying.url} target="_blank" rel="noopener noreferrer">
                {songLabel(nowPlaying)}
              </a>
              <div className="now-playing-buttons">
                <button className="stop-btn" onClick={togglePause}>
                  {isPaused ? "Resume" : "Pause"}
                </button>
                <button className="stop-btn stop-btn-outline" onClick={stopSong}>
                  Stop
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="songs-list">
          {songs.map((row) => {
            const isActive = nowPlaying?.id === row.id;
            return (
              <div key={row.id} className={`song-card ${isActive ? "song-card-active" : ""}`}>
                <div className="song-card-fallback">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M9 18V5l11-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="17" cy="16" r="3" />
                  </svg>
                  <a href={row.url} target="_blank" rel="noopener noreferrer">
                    {songLabel(row)}
                  </a>
                </div>
                <div className="song-actions">
                  {!isActive ? (
                    <button className="song-play" title="Play" onClick={() => playSong(row)}>
                      ▶
                    </button>
                  ) : (
                    <button className="song-play song-play-active" title={isPaused ? "Resume" : "Pause"} onClick={togglePause}>
                      {isPaused ? "▶" : "❚❚"}
                    </button>
                  )}
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