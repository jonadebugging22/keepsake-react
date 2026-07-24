export default function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="lightbox">
      <div className="lightbox-backdrop" onClick={onClose} />
      <div className="lightbox-content">
        <button className="close-btn" onClick={onClose}>
          &times;
        </button>
        <video src={src} controls playsInline autoPlay />
      </div>
    </div>
  );
}
