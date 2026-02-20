/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_DEMO_RESET_ENABLED: string;
  readonly VITE_DEMO_RESET_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
