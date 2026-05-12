/*
Copyright (C) 2025 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import React, { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

const ImageLightbox = ({ images, index, onClose, onNav }) => {
  const hasPrev = onNav && index > 0;
  const hasNext = onNav && index < images.length - 1;

  const handleKey = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNav(index - 1);
      if (e.key === 'ArrowRight' && hasNext) onNav(index + 1);
    },
    [onClose, onNav, index, hasPrev, hasNext],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div
      className='fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center'
      onClick={onClose}
    >
      <button
        className='absolute top-4 right-4 text-white/70 hover:text-white p-2'
        onClick={onClose}
      >
        <X size={22} />
      </button>

      {hasPrev && (
        <button
          className='absolute left-4 text-white/70 hover:text-white p-3'
          onClick={(e) => {
            e.stopPropagation();
            onNav(index - 1);
          }}
        >
          <ChevronLeft size={32} />
        </button>
      )}

      <img
        src={images[index]}
        className='max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      />

      {hasNext && (
        <button
          className='absolute right-4 text-white/70 hover:text-white p-3'
          onClick={(e) => {
            e.stopPropagation();
            onNav(index + 1);
          }}
        >
          <ChevronRight size={32} />
        </button>
      )}

      {images.length > 1 && (
        <div className='absolute bottom-4 text-white/60 text-sm tabular-nums'>
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
};

export default ImageLightbox;
