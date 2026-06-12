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
    then Access Requests, and this connects on its own. Grant <strong>read and write</strong>:
    routes, waypoints, tracks, course control, alarms, and profiles all save to the server.
    <a class="btn btn-ghost btn-pill" href={requestsUrl} target="_blank" rel="noopener noreferrer">
      Approve in Signal K
    </a>
  </div>
{:else if auth.status === 'denied'}
  <div class="auth-banner denied" role="alert">
    Access was denied.
    <button type="button" class="btn btn-ghost btn-pill" onclick={() => auth.requestAccess()}>
      Request again
    </button>
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
/* The action reuses the shared .btn .btn-ghost .btn-pill vocabulary; only the display is overridden,
   since this button sits inline within a sentence rather than in a panel button row. */
.auth-banner .btn {
  display: inline-flex;
  margin-inline-start: var(--space-2);
  vertical-align: middle;
  text-decoration: none;
}
</style>
