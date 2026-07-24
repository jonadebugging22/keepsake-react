import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabaseClient";

export function parseMusicLink(url) {
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
      if (videoId) return { platform: "youtube", embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1` };
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

const MusicPlayerCtx = createContext(null);

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerCtx);
  if (!ctx) throw new Error("useMusicPlayer must be used inside <MusicPlayerProvider>");
  return ctx;
}

// Mount this ONCE near the root of the app (in App.jsx), wrapping everything.
// It owns the song list + the "now playing" embed, and keeps that embed's
// iframe alive in the DOM (via portal) whether the modal is open or closed,
// so nothing pauses/resets when you navigate pages or close the panel.
export function MusicPlayerProvider({ userId, toast: externalToast, children }) {
  const [songs, setSongs] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null); // song row currently loaded in the persistent embed
  const [internalToastMsg, setInternalToastMsg] = useState(null);

  // Use the app's own toast if one was passed in (Keepsake's <Toast/>);
  // otherwise fall back to a tiny built-in one so this still works standalone.
  const internalToastTimer = useRef(null);
  const toast =
    externalToast ||
    ((msg) => {
      setInternalToastMsg(msg);
      window.clearTimeout(internalToastTimer.current);
      internalToastTimer.current = window.setTimeout(() => setInternalToastMsg(null), 2500);
    });

  // Two possible "docking" spots for the persistent iframe:
  // - modalSlotNode: an anchor div that MusicPanel itself registers while it's
  //   mounted (so the embed renders inline, inside the modal's own layout)
  // - vinylSlotRef: a tiny hidden placeholder next to the floating vinyl button,
  //   used whenever the modal ISN'T registering an anchor (i.e. it's closed)
  const vinylSlotRef = useRef(null);
  const [modalSlotNode, setModalSlotNode] = useState(null);
  const [vinylSlotNode, setVinylSlotNode] = useState(null);

  // Called by MusicPanel with its anchor div on mount, and with null on unmount.
  const registerModalSlot = useCallback((node) => setModalSlotNode(node), []);

  useEffect(() => {
    setVinylSlotNode(vinylSlotRef.current);
  }, []);

  const loadSongs = async () => {
    if (!userId) return;
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

  const addSong = async (url) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const { platform } = parseMusicLink(trimmed);
    const { error } = await supabase.from("favorite_songs").insert({ user_id: userId, url: trimmed, platform });
    if (error) {
      toast("Couldn't add that song.");
      return;
    }
    loadSongs();
  };

  const removeSong = async (id) => {
    if (nowPlaying?.id === id) setNowPlaying(null);
    await supabase.from("favorite_songs").delete().eq("id", id);
    loadSongs();
  };

  const playSong = (song) => setNowPlaying(song);
  const stopSong = () => setNowPlaying(null);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  const nowPlayingEmbed = nowPlaying ? parseMusicLink(nowPlaying.url) : null;

  const value = useMemo(
    () => ({ songs, isOpen, open, close, addSong, removeSong, playSong, stopSong, nowPlaying, registerModalSlot }),
    [songs, isOpen, nowPlaying]
  );

  return (
    <MusicPlayerCtx.Provider value={value}>
      {children}

      {/* Floating vinyl + its hidden docking slot, used while the modal is CLOSED
          (i.e. whenever no MusicPanel has registered a modal slot) */}
      {!isOpen && nowPlaying && (
        <button className="vinyl-fab" onClick={open} title={`Now playing: ${nowPlaying.url}`}>
          <svg className="vinyl-fab-icon" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" fill="#2E2A22" />
            <circle cx="24" cy="24" r="22" stroke="var(--brass)" strokeWidth="1.5" opacity="0.7" />
            <circle cx="24" cy="24" r="16" stroke="#EFE3D0" strokeWidth="0.75" opacity="0.4" />
            <circle cx="24" cy="24" r="10" stroke="#EFE3D0" strokeWidth="0.75" opacity="0.4" />
            <circle cx="24" cy="24" r="5" fill="var(--wax)" />
            <circle cx="24" cy="24" r="1.6" fill="#2E2A22" />
          </svg>
        </button>
      )}
      <div ref={vinylSlotRef} className="now-playing-vinyl-slot" />

      {/* The actual iframe lives ONCE in the tree and is portaled between slots,
          so it never unmounts => playback is never interrupted. */}
      {nowPlayingEmbed?.embedUrl &&
        createPortal(
          <div className="now-playing-embed-wrap">
            {nowPlayingEmbed.platform === "youtube" && (
              <iframe
                src={nowPlayingEmbed.embedUrl}
                height="160"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={nowPlaying.url}
              />
            )}
            {nowPlayingEmbed.platform === "spotify" && (
              <iframe src={nowPlayingEmbed.embedUrl} height="152" allow="encrypted-media" title={nowPlaying.url} />
            )}
          </div>,
          modalSlotNode || vinylSlotNode || document.body
        )}

      {!externalToast && internalToastMsg && <div className="music-toast">{internalToastMsg}</div>}
    </MusicPlayerCtx.Provider>
  );
}