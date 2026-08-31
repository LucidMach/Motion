/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicAttributes {
      'client:load'?: boolean;
      'client:idle'?: boolean | { timeout?: number };
      'client:visible'?: boolean | { rootMargin?: string };
      'client:media'?: string;
      'client:only'?: boolean | string;
      'server:defer'?: boolean;
      slot?: string;
    }
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_MAPBOX_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
