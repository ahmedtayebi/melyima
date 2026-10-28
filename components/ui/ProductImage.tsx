'use client'

import { useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react'
import Image, { type ImageProps } from 'next/image'
import { productImageBackupUrl } from '@/lib/product-image-sources.mjs'

function useProductImage(source: string) {
  const backup = productImageBackupUrl(source)
  const [failed, setFailed] = useState(false)
  const src = failed && backup ? backup : source
  const onError = () => { if (backup && !failed) setFailed(true) }
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    // Cloudinary can return a one-pixel error GIF instead of a broken-image event.
    const image = event.currentTarget
    if (backup && !failed && image.naturalWidth <= 1 && image.naturalHeight <= 1) setFailed(true)
  }
  const ref = (image: HTMLImageElement | null) => {
    // An SSR image may have failed before hydration attached the event handlers.
    if (image?.complete && backup && !failed && image.naturalWidth <= 1 && image.naturalHeight <= 1) setFailed(true)
  }
  return { src, onError, onLoad, ref }
}

type NativeProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'onError' | 'onLoad'> & { src: string }

function NativeImage({ src, alt = '', ...props }: NativeProps) {
  const image = useProductImage(src)
  // Product photos are already optimized on Cloudinary, with a compressed backup.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} {...image} />
}

export function ProductImg(props: NativeProps) {
  // Reset failure state when switching color, carousel image or product.
  return <NativeImage key={props.src} {...props} />
}

type NextProps = Omit<ImageProps, 'src' | 'onError' | 'onLoad' | 'onLoadingComplete' | 'loader' | 'overrideSrc'> & { src: string }

function NextProductImage({ src, alt, ...props }: NextProps) {
  const image = useProductImage(src)
  return <Image {...props} alt={alt} {...image} unoptimized />
}

export default function ProductImage(props: NextProps) {
  return <NextProductImage key={props.src} {...props} />
}
