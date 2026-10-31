import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * The portal is client-rendered behind a single API proxy route. There is no
 * ISR or server cache to persist, so no R2 incremental cache is configured.
 */
export default defineCloudflareConfig({});
