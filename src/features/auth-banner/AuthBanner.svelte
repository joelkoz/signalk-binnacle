<script lang="ts">
import type { AuthController } from '$shared/signalk';

interface Props {
  auth: AuthController;
  requestsUrl: string;
}

const { auth, requestsUrl }: Props = $props();
</script>

{#if auth.status === 'requesting'}
  <div class="auth-banner" role="status" aria-live="polite">
    Requesting access as <strong>{auth.clientId}</strong>. Approve it in Signal K under Security,
    then Access Requests, and this connects on its own.
    <a class="action" href={requestsUrl} target="_blank" rel="noopener noreferrer">
      Approve in Signal K
    </a>
  </div>
{:else if auth.status === 'denied'}
  <div class="auth-banner denied" role="alert">
    Access was denied.
    <button type="button" onclick={() => auth.requestAccess()}>Request again</button>
  </div>
{/if}

<style>
.auth-banner {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-base);
  background: var(--surface-raised);
  color: var(--text);
  border-block-end: 1px solid var(--border);
}
.auth-banner.denied {
  color: var(--alarm);
}
.auth-banner button,
.auth-banner .action {
  display: inline-flex;
  align-items: center;
  font: inherit;
  margin-inline-start: var(--space-2);
  padding: var(--space-2) var(--space-3);
  min-block-size: var(--control-size);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
}
</style>
