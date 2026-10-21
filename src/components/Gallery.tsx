'use client';

import { useState } from 'react';

export default function Gallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  if (!images.length) {
    return <div className="card grid aspect-square place-items-center text-7xl">🛍️</div>;
  }
  return (
    <div>
      <div className="card grid aspect-square place-items-center overflow-hidden p-6">
        <img src={images[active]} alt={title} className="max-h-full max-w-full object-contain" />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={src}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              aria-label={`Image ${i + 1}`}
              className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border-2 bg-white p-1 ${i === active ? 'border-brand' : 'border-slate-200'}`}
            >
              <img src={src} alt="" className="max-h-full max-w-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
