import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A QR straight to the real app's add-yourself screen. Dark-on-white rather
 * than the app's own dark theme — a camera locks onto that reliably in any
 * office lighting, and the quiet zone the `margin` gives it is what makes a
 * phone actually find the code in the first place.
 */
export const KioskJoinQr: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}/?join=1`;
    QRCode.toDataURL(url, { margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setDataUrl)
      .catch((error) => console.error('Could not generate the join QR code:', error));
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan to join"
      onClick={onClose}
      className="anim-fade fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-black p-6 text-center"
    >
      <div className="grid justify-items-center gap-5">
        <div className="grid place-items-center rounded-[28px] bg-white p-5 shadow-2xl">
          {dataUrl ? (
            <img src={dataUrl} alt="QR code to join the league" style={{ width: 'min(70vw, 70vh)', height: 'min(70vw, 70vh)' }} />
          ) : (
            <div style={{ width: 'min(70vw, 70vh)', height: 'min(70vw, 70vh)' }} />
          )}
        </div>
        <h1 className="text-[32px] leading-[.95]">Scan to join</h1>
        <p className="max-w-xs font-semibold text-white/70">
          Scan this with your phone's camera, add yourself, then add the page to your home screen so it opens like an installed app.
        </p>
      </div>
    </div>
  );
};
