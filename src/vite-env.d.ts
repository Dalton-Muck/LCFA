/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COURSE_CATALOG_BASE_URL?: string;
  readonly VITE_OPENROUTER_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


