import { useEffect, useRef, useState } from "react";
import { supabase, MEDIA_BUCKET } from "../lib/supabaseClient";
import Lightbox from "./Lightbox";

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function VideosScreen({ userId, onBack, toast }) {
  const [videos, setVideos] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const fileInputRef = useRef(null);

  const loadVideos = async () => {
    const { data, error } = await supabase
      .from("media_items")
      .select("*")
      .eq("user_id", userId)
      .eq("kind", "video")
      .order("created_at", { ascending: false });

    if (error) {
      toast("Couldn't load your videos.");
      setVideos([]);
      return;
    }

    const mapped = (data || []).map((row) => {
      const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(row.storage_path);
      return { id: row.id, src: pub.publicUrl };
    });
    setVideos(mapped);
  };

  useEffect(() => {
    loadVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    toast(`Uploading ${files.length} video${files.length > 1 ? "s" : ""}…`);

    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${userId}/videos/${uuid()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });
      if (uploadError) {
        toast(`Upload failed: ${uploadError.message}`);
        continue;
      }
      await supabase.from("media_items").insert({
        user_id: userId,
        kind: "video",
        storage_path: path,
        file_name: file.name
      });
    }
    toast("Done!");
    e.target.value = "";
    loadVideos();
  };

  const isEmpty = videos && videos.length === 0;

  return (
    <section id="videos-screen" className="screen">
      <header className="view-header">
        <button className="back-btn" onClick={onBack}>
          &larr; back
        </button>
        <h2>Videos</h2>
        <label className="upload-label">
          <button
            type="button"
            className="wax-seal-btn"
            aria-label="Add videos"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <input ref={fileInputRef} type="file" accept="video/*" multiple hidden onChange={onUpload} />
        </label>
      </header>

      <div className="videos-grid">
        {videos &&
          videos.map((v) => (
            <div key={v.id} className="video-card" onClick={() => setLightboxSrc(v.src)}>
              <video src={v.src} muted preload="metadata" />
              <div className="play-badge">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          ))}
      </div>

      {isEmpty && <p className="empty-hint">No videos yet — tap the wax seal above to upload your first clip.</p>}

      <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </section>
  );
}
