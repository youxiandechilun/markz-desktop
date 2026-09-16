/// <reference types="vite/client" />

import type { NexusApi } from "./preload";

declare global {
  interface Window {
    nexus: NexusApi;
  }
}

export {};
