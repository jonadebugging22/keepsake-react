import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase, MEDIA_BUCKET } from "../lib/supabaseClient";

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
      if (videoId) {
        return {
          platform: "youtube",
          embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(
            window.location.origin
          )}`
        };
      }
    }
    if (u.hostname.includes("open.spotify.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const [type, id] = parts;
        return { platform: "spotify", embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator` };
      }
    }
    return { platform: "other", embedUrl: null };
  } catch {
    return { platform: "other", embedUrl: null };
  }
}

// Uploaded audio files are stored with platform === "file" and url === the
// public storage URL directly, so we don't need to guess anything about them.
export function getPlaybackInfo(row) {
  if (!row) return null;
  if (row.platform === "file") return { platform: "file", embedUrl: row.url };
  return parseMusicLink(row.url);
}

const MusicPlayerCtx = createContext(null);

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerCtx);
  if (!ctx) throw new Error("useMusicPlayer must be used inside <MusicPlayerProvider>");
  return ctx;
}

// Mount this ONCE near the root of the app (in App.jsx), wrapping everything.
// It owns the song list + the "now playing" embed, and keeps it alive in the
// DOM (via portal) whether the modal is open or closed, so nothing stops
// when you navigate pages or close the panel.
export function MusicPlayerProvider({ userId, toast: externalToast, children }) {
  const [songs, setSongs] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [internalToastMsg, setInternalToastMsg] = useState(null);

  const internalToastTimer = useRef(null);
  const toast =
    externalToast ||
    ((msg) => {
      setInternalToastMsg(msg);
      window.clearTimeout(internalToastTimer.current);
      internalToastTimer.current = window.setTimeout(() => setInternalToastMsg(null), 2500);
    });

  // ---- persistent docking (modal open vs. floating vinyl) ----
  const vinylSlotRef = useRef(null);
  const [modalSlotNode, setModalSlotNode] = useState(null);
  const [vinylSlotNode, setVinylSlotNode] = useState(null);
  const registerModalSlot = useCallback((node) => setModalSlotNode(node), []);
  useEffect(() => {
    setVinylSlotNode(vinylSlotRef.current);
  }, []);

  // ---- YouTube control: postMessage to the embed's iframe (no external script needed) ----
  const ytIframeRef = useRef(null);
  useEffect(() => {
    function handleMessage(e) {
      if (!e.origin || !e.origin.includes("youtube.com")) return;
      try {
        const data = JSON.parse(e.data);
        if (data.event === "infoDelivery" && data.info && typeof data.info.playerState === "number") {
          setIsPaused(data.info.playerState === 2);
        }
      } catch {
        // ignore non-JSON messages
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // ---- Spotify: plain, reliable iframe embed. Pause = unmount (stops audio
  // for certain), resume = remount (restarts the track). No external script,
  // no API race conditions — trades exact resume-position for reliability. ----

  // ---- Uploaded audio file: native <audio>, true pause/resume at position ----
  const audioElRef = useRef(null);

  const nowPlayingInfo = nowPlaying ? getPlaybackInfo(nowPlaying) : null;

  // Media Session API: gives the OS/lock-screen real play/pause controls and
  // helps some mobile browsers keep audio alive a little longer in the
  // background. It can't override each browser's own autoplay/background
  // rules, but it's the closest a plain web page can get.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!nowPlaying) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      return;
    }
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: nowPlaying.url,
      artist: "Keepsake"
    });
    navigator.mediaSession.playbackState = isPaused ? "paused" : "playing";
    navigator.mediaSession.setActionHandler("play", () => togglePauseRef.current());
    navigator.mediaSession.setActionHandler("pause", () => togglePauseRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.id, isPaused]);

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

  // Upload a local audio file (mp3, m4a, wav, etc.) from the user's device.
  const addSongFile = async (file) => {
    if (!file) return;
    toast(`Uploading ${file.name}…`);
    const ext = file.name.split(".").pop();
    const path = `${userId}/audio/${uuid()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });
    if (uploadError) {
      toast(`Upload failed: ${uploadError.message}`);
      return;
    }
    const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    const { error } = await supabase
      .from("favorite_songs")
      .insert({ user_id: userId, url: pub.publicUrl, platform: "file" });
    if (error) {
      toast("Couldn't save that song.");
      return;
    }
    toast("Song added!");
    loadSongs();
  };

  const removeSong = async (id) => {
    if (nowPlaying?.id === id) setNowPlaying(null);
    await supabase.from("favorite_songs").delete().eq("id", id);
    loadSongs();
  };

  const playSong = (song) => {
    setNowPlaying(song);
    setIsPaused(false);
  };

  const stopSong = () => setNowPlaying(null);

  const togglePause = () => {
    if (!nowPlaying) return;
    const { platform } = getPlaybackInfo(nowPlaying);
    if (platform === "youtube") {
      const iframe = ytIframeRef.current;
      if (!iframe?.contentWindow) return;
      const cmd = isPaused ? "playVideo" : "pauseVideo";
      iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: cmd, args: "" }), "*");
      setIsPaused(!isPaused);
    } else if (platform === "spotify") {
      // no persistent controller to call — just toggle mount/unmount below
      setIsPaused(!isPaused);
    } else if (platform === "file") {
      const audio = audioElRef.current;
      if (!audio) return;
      if (audio.paused) audio.play();
      else audio.pause();
      // isPaused updates via the audio element's own onPlay/onPause below
    }
  };
  const togglePauseRef = useRef(togglePause);
  togglePauseRef.current = togglePause;

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  const value = useMemo(
    () => ({
      songs,
      isOpen,
      open,
      close,
      addSong,
      addSongFile,
      removeSong,
      playSong,
      stopSong,
      nowPlaying,
      isPaused,
      togglePause,
      registerModalSlot
    }),
    [songs, isOpen, nowPlaying, isPaused]
  );

  return (
    <MusicPlayerCtx.Provider value={value}>
      {children}

      {/* Floating vinyl: play/pause shortcut, visible whenever a song is
          loaded, regardless of whether the modal is open or closed. */}
      {nowPlaying && (
        <button
          className={`vinyl-fab ${isPaused ? "vinyl-fab-paused" : ""}`}
          onClick={togglePause}
          title={isPaused ? "Resume" : "Pause"}
        >
          <svg className="vinyl-fab-icon" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" fill="#2E2A22" />
            <circle cx="24" cy="24" r="22" stroke="var(--brass)" strokeWidth="1.5" opacity="0.7" />
            <circle cx="24" cy="24" r="16" stroke="#EFE3D0" strokeWidth="0.75" opacity="0.4" />
            <circle cx="24" cy="24" r="10" stroke="#EFE3D0" strokeWidth="0.75" opacity="0.4" />
            <circle cx="24" cy="24" r="7" fill="var(--wax)" />
          </svg>
          {isPaused ? (
            <svg className="vinyl-fab-glyph" viewBox="0 0 24 24" fill="#FFF7EF">
              <path d="M9 7l9 5-9 5V7z" />
            </svg>
          ) : (
            <svg className="vinyl-fab-glyph" viewBox="0 0 24 24" fill="#FFF7EF">
              <rect x="8" y="7" width="3" height="10" />
              <rect x="14" y="7" width="3" height="10" />
            </svg>
          )}
        </button>
      )}
      <div ref={vinylSlotRef} className="now-playing-vinyl-slot" />

      {/* The actual embed/audio is portaled between the modal (when open)
          and the hidden vinyl slot (when closed) so it never unmounts on
          navigation — that's what keeps playback going between pages. */}
      {nowPlayingInfo?.embedUrl &&
        createPortal(
          <div className="now-playing-embed-wrap">
            {nowPlayingInfo.platform === "youtube" && (
              <iframe
                ref={ytIframeRef}
                src={nowPlayingInfo.embedUrl}
                height="160"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={nowPlaying.url}
              />
            )}
            {nowPlayingInfo.platform === "spotify" &&
              (!isPaused ? (
                <iframe
                  key={nowPlaying.id}
                  src={nowPlayingInfo.embedUrl}
                  height="152"
                  allow="autoplay; encrypted-media"
                  title={nowPlaying.url}
                />
              ) : (
                <div className="spotify-paused-placeholder">Naka-pause</div>
              ))}
            {nowPlayingInfo.platform === "file" && (
              <audio
                ref={audioElRef}
                src={nowPlayingInfo.embedUrl}
                controls
                autoPlay
                style={{ width: "100%" }}
                onPause={() => setIsPaused(true)}
                onPlay={() => setIsPaused(false)}
              />
            )}
          </div>,
          modalSlotNode || vinylSlotNode || document.body
        )}

      {!externalToast && internalToastMsg && <div className="music-toast">{internalToastMsg}</div>}
    </MusicPlayerCtx.Provider>
  );
}