import { useEffect, useRef, useState } from "react";
import { supabase, MEDIA_BUCKET } from "../lib/supabaseClient";
import DomeGallery from "./DomeGallery";
import JSZip from "jszip";

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function PicturesScreen({ userId, onBack, toast }) {
  const [images, setImages] = useState(null); // null = loading
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef(null);

  const loadPictures = async () => {
    const { data, error } = await supabase
      .from("media_items")
      .select("*")
      .eq("user_id", userId)
      .eq("kind", "image")
      .order("created_at", { ascending: false });

    if (error) {
      toast("Couldn't load your pictures.");
      setImages([]);
      return;
    }

    const mapped = (data || []).map((row) => {
      const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(row.storage_path);
      return { src: pub.publicUrl, alt: row.file_name || "" };
    });
    setImages(mapped);
  };

  useEffect(() => {
    loadPictures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    toast(`Uploading ${files.length} photo${files.length > 1 ? "s" : ""}…`);

    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${userId}/images/${uuid()}.${ext}`;
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
        kind: "image",
        storage_path: path,
        file_name: file.name
      });
    }
    toast("Done!");
    e.target.value = "";
    loadPictures();
  };

  const isEmpty = images && images.length === 0;

  const exportAll = async () => {
    if (!images || images.length === 0) return;
    setExporting(true);
    toast("Preparing your photos…");
    try {
      const zip = new JSZip();
      await Promise.all(
        images.map(async (img, i) => {
          const res = await fetch(img.src);
          const blob = await res.blob();
          const fallbackExt = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
          const name = img.alt || `photo-${i + 1}.${fallbackExt}`;
          zip.file(name, blob);
        })
      );
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "keepsake-pictures.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast("Couldn't export your pictures.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section id="pictures-screen" className="screen dark">
      <header className="view-header">
        <button className="back-btn" onClick={onBack}>
          &larr; back
        </button>
        <h2>Pictures</h2>
        <div className="header-actions">
          <button
            type="button"
            className="link-btn export-all-btn"
            onClick={exportAll}
            disabled={exporting || isEmpty || !images}
          >
            {exporting ? "Exporting…" : "Export all"}
          </button>
          <label className="upload-label">
            <button
              type="button"
              className="wax-seal-btn"
              aria-label="Add pictures"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={onUpload}
            />
          </label>
        </div>
      </header>

      <div className="dome-container">
        {images === null && <p className="dome-loading">gathering your memories…</p>}
        {images && images.length > 0 && <DomeGallery images={images} grayscale={false} overlayBlurColor="#1B1712" segments={images.length < 8 ? 15 : 25} />}
      </div>

      {isEmpty && (
        <p className="empty-hint">No pictures yet — tap the wax seal above to upload your first memory.</p>
      )}
    </section>
  );
}