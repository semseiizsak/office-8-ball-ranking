import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FACE_Y, PHOTO_ASPECT, cropToPhoto, loadImageFile } from '../utils/image';

const MAX_ZOOM = 4;

/**
 * Frames a picked photo 4:5 before it is saved: drag to move, pinch, scroll
 * or slide to zoom. The whole frame is what full-art cards print, the circle
 * guide is what avatars and the round card photos show.
 */
export const PhotoCropper: React.FC<{
  file: File;
  onDone: (dataUrl: string) => void;
  onCancel: () => void;
}> = ({ file, onDone, onCancel }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const frameW = Math.min(300, (typeof window !== 'undefined' ? window.innerWidth : 360) - 64);
  const frameH = Math.round(frameW / PHOTO_ASPECT);

  useEffect(() => {
    let url = '';
    loadImageFile(file)
      .then((img) => {
        url = img.src;
        setImage(img);
      })
      .catch(() => setFailed(true));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  // Escape closes only the cropper, not the sheet underneath.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const base = image ? Math.max(frameW / image.naturalWidth, frameH / image.naturalHeight) : 1;
  const scale = base * zoom;
  const dispW = image ? image.naturalWidth * scale : frameW;
  const dispH = image ? image.naturalHeight * scale : frameH;

  // The photo must always cover the whole frame.
  const clamp = (o: { x: number; y: number }, w = dispW, h = dispH) => {
    const mx = Math.max(0, (w - frameW) / 2);
    const my = Math.max(0, (h - frameH) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };

  const applyZoom = (next: number) => {
    if (!image) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const s = base * z;
    setZoom(z);
    setOffset((o) => clamp({ x: (o.x * z) / zoom, y: (o.y * z) / zoom }, image.naturalWidth * s, image.naturalHeight * s));
  };

  const down = (event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const move = (event: React.PointerEvent) => {
    const prev = pointers.current.get(event.pointerId);
    if (!prev) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      applyZoom((pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist);
    } else if (pointers.current.size === 1) {
      setOffset((o) => clamp({ x: o.x + event.clientX - prev.x, y: o.y + event.clientY - prev.y }));
    }
  };
  const up = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const confirm = () => {
    if (!image) return;
    onDone(
      cropToPhoto(image, {
        x: ((dispW - frameW) / 2 - offset.x) / scale,
        y: ((dispH - frameH) / 2 - offset.y) / scale,
        w: frameW / scale,
        h: frameH / scale,
      }),
    );
  };

  const faceTop = FACE_Y * (frameH - frameW);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Frame your photo" className="anim-fade fixed inset-0 z-[90] flex flex-col items-center justify-center gap-5 bg-black/90 px-4">
      <h2 className="text-[22px]">Frame your photo</h2>
      <div
        className="relative touch-none select-none overflow-hidden rounded-2xl bg-surface"
        style={{ width: frameW, height: frameH, cursor: image ? 'grab' : 'default' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={(event) => applyZoom(zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08))}
      >
        {image && (
          <img
            src={image.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ width: dispW, height: dispH, left: (frameW - dispW) / 2 + offset.x, top: (frameH - dispH) / 2 + offset.y }}
          />
        )}
        {/* The circle is what avatars show; everything outside it is dimmed a touch but still printed on cards. */}
        <span
          className="pointer-events-none absolute left-0 rounded-full border-2 border-white"
          style={{ top: faceTop, width: frameW, height: frameW, boxShadow: '0 0 0 999px rgba(10,10,10,.35)' }}
        />
        {failed && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm font-semibold">That image could not be loaded.</p>}
      </div>
      <input
        type="range"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        onChange={(event) => applyZoom(Number(event.target.value))}
        aria-label="Zoom"
        className="w-full max-w-[300px] accent-white"
      />
      <p className="max-w-[300px] text-center text-sm text-white/70">
        Drag to move, pinch or slide to zoom. The circle is your profile picture, the whole frame goes on your cards.
      </p>
      <div className="flex w-full max-w-[300px] gap-3">
        <button type="button" onClick={onCancel} className="press h-12 flex-1 rounded-full bg-surface-alt text-[13px] font-extrabold uppercase tracking-[0.06em]">
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!image}
          className="press h-12 flex-1 rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg disabled:opacity-50"
        >
          Use photo
        </button>
      </div>
    </div>,
    document.body,
  );
};
