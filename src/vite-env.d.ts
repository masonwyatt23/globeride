/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string;

  // AI Workout Designer
  /** 'xai' | 'ollama' | 'auto' — default 'auto' */
  readonly VITE_AI_PROVIDER?: string;
  /** xAI secret key — never log or expose */
  readonly VITE_XAI_API_KEY?: string;
  /** xAI model name — default 'grok-4.3' */
  readonly VITE_XAI_MODEL?: string;
  /** Ollama base URL — default 'http://localhost:11434' */
  readonly VITE_OLLAMA_URL?: string;
  /** Ollama model name — default 'llama3.1' */
  readonly VITE_OLLAMA_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
