import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { safeCardmarketImage, safeCardmarketProduct } from '@/utils/cardmarketSync';
import { safeCardmarketPhotoData } from '@/utils/cardmarketPhotos';

export function CardmarketPhoto({ src, cachedSrc, name, seller = false, productUrl }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const dialog = useRef(null);
  const url = safeCardmarketImage(src, seller ? 'seller' : 'product');
  const local = seller && safeCardmarketPhotoData(cachedSrc);
  const image = local || url;
  const failed = failedSrc === image;
  if (!url) return null;
  const listing = safeCardmarketProduct(productUrl) ? productUrl : url;
  const alt = `${seller ? 'Seller photo' : 'Cardmarket reference'} of ${name}`;
  const preview = <>
    {!failed && <img src={image} alt={alt} loading="lazy" referrerPolicy="no-referrer" className="h-32 w-24 rounded-md border border-slate-200 bg-slate-50 object-contain" onError={() => setFailedSrc(image)} />}
    {failed && <span className="flex h-32 items-center rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-500 no-underline">Preview unavailable</span>}
    <span className="mt-1 block">{failed ? seller ? 'Open seller listing' : 'View product on Cardmarket' : seller ? 'Seller photo · enlarge' : 'Product reference'}</span>
    {!seller && <span className="mt-1 block text-[10px] leading-tight text-slate-500 no-underline">Pictured variant may differ</span>}
  </>;
  return <div className="w-24 shrink-0 text-center text-xs text-blue-800">
    {local && !failed ? <button type="button" className="block underline" aria-label={`Enlarge seller photo of ${name}`} onClick={event => { event.preventDefault(); event.stopPropagation(); dialog.current?.showModal(); }}>{preview}</button>
      : <a href={failed ? listing : url} target="_blank" rel="noopener noreferrer" className="block underline" onClick={event => event.stopPropagation()}>{preview}</a>}
    {local && createPortal(<dialog ref={dialog} aria-label={alt} className="max-h-[95vh] w-full max-w-3xl rounded-xl bg-white p-4 backdrop:bg-black/60" onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) dialog.current.close(); }}>
      <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-900">{alt}</p><button type="button" autoFocus className="rounded border px-3 py-2 text-sm" onClick={() => dialog.current.close()}>Close photo</button></div>
      <img src={local} alt={alt} className="mx-auto max-h-[75vh] max-w-full object-contain" />
      <p className="mt-3 text-xs text-slate-600">Preview saved with this browser’s capture. <a className="text-blue-800 underline" href={listing} target="_blank" rel="noopener noreferrer">View seller listing on Cardmarket</a></p>
    </dialog>, document.body)}
  </div>;
}
