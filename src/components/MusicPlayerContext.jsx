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
        return {
          platform: "spotify",
          embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
          spotifyUri: `spotify:${type}:${id}`
        };
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
// The floating vinyl button is a real play/pause shortcut (not a "reopen
// modal" button) — it controls playback directly via each platform's API.
export function MusicPlayerProvider({ userId, toast: externalToast, children }) {
  const [songs, setSongs] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null); // song row currently loaded in the persistent embed
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

  // ---- YouTube playback control (postMessage to the embed's iframe) ----
  const ytIframeRef = useRef(null);

  useEffect(() => {
    // Sync isPaused with YouTube's own state (e.g. if the user pauses using
    // the iframe's built-in controls instead of our vinyl button).
    function handleMessage(e) {
      if (!e.origin || !e.origin.includes("youtube.com")) return;
      try {
        const data = JSON.parse(e.data);
        if (data.event === "infoDelivery" && data.info && typeof data.info.playerState === "number") {
          setIsPaused(data.info.playerState === 2);
        }
      } catch {
        // not a JSON message we care about
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // ---- Spotify playback control (official iFrame API, loaded once) ----
  const spotifyApiRef = useRef(null);
  const spotifyControllerRef = useRef(null);
  const spotifyContainerRef = useRef(null);

  useEffect(() => {
    if (window.Spotify?.Iframe || document.getElementById("spotify-iframe-api")) return;
    const script = document.createElement("script");
    script.id = "spotify-iframe-api";
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!nowPlaying) return;
    const { platform, spotifyUri } = parseMusicLink(nowPlaying.url);
    if (platform !== "spotify" || !spotifyUri) return;

    const setup = (IFrameAPI) => {
      spotifyApiRef.current = IFrameAPI;
      if (!spotifyControllerRef.current) {
        IFrameAPI.createController(spotifyContainerRef.current, { uri: spotifyUri, width: "100%", height: "152" }, (controller) => {
          spotifyControllerRef.current = controller;
          setIsPaused(false);
          controller.addListener("playback_update", (e) => {
            setIsPaused(!!e.data.isPaused);
          });
        });
      } else {
        spotifyControllerRef.current.loadUri(spotifyUri);
        setIsPaused(false);
      }
    };

    if (spotifyApiRef.current) {
      setup(spotifyApiRef.current);
    } else {
      const prevReady = window.onSpotifyIframeApiReady;
      window.onSpotifyIframeApiReady = (IFrameAPI) => {
        prevReady?.(IFrameAPI);
        setup(IFrameAPI);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.id]);

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

  const playSong = (song) => {
    setNowPlaying(song);
    setIsPaused(false);
  };

  const stopSong = () => setNowPlaying(null);

  // The vinyl button (and the "pause/play" button in the modal) call this.
  const togglePause = () => {
    if (!nowPlaying) return;
    const { platform } = parseMusicLink(nowPlaying.url);
    if (platform === "youtube") {
      const iframe = ytIframeRef.current;
      if (!iframe?.contentWindow) return;
      const cmd = isPaused ? "playVideo" : "pauseVideo";
      iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: cmd, args: "" }), "*");
      setIsPaused(!isPaused);
    } else if (platform === "spotify") {
      spotifyControllerRef.current?.togglePlay();
      setIsPaused(!isPaused);
    }
  };

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  const nowPlayingEmbed = nowPlaying ? parseMusicLink(nowPlaying.url) : null;

  const value = useMemo(
    () => ({
      songs,
      isOpen,
      open,
      close,
      addSong,
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

      {/* Floating vinyl: a real play/pause shortcut, visible whenever a song
          is loaded, regardless of whether the modal is open or closed. To
          reopen the full panel, use the "Favorite Music" entry point again. */}
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

      {/* The actual embed lives ONCE in the tree and is portaled between the
          modal (when open) and the hidden vinyl slot (when closed), so it
          never unmounts — that's what keeps playback going. Pause/resume is
          done via the platform APIs above, not by removing this element. */}
      {nowPlayingEmbed?.embedUrl &&
        createPortal(
          <div className="now-playing-embed-wrap">
            {nowPlayingEmbed.platform === "youtube" && (
              <iframe
                ref={ytIframeRef}
                src={nowPlayingEmbed.embedUrl}
                height="160"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={nowPlaying.url}
              />
            )}
            {nowPlayingEmbed.platform === "spotify" && <div ref={spotifyContainerRef} />}
          </div>,
          modalSlotNode || vinylSlotNode || document.body
        )}

      {!externalToast && internalToastMsg && <div className="music-toast">{internalToastMsg}</div>}
    </MusicPlayerCtx.Provider>
  );
}