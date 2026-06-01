<script lang="ts">
import type { AuthController } from '$shared/signalk';

interface Props {
  auth: AuthController;
}

const { auth }: Props = $props();
</script>

{#if auth.status === 'requesting'}
  <div class="auth-banner">
    Requesting access. Approve <strong>Binnacle</strong> in Signal K under Security, then Access
    Requests.
  </div>
{:else if auth.status === 'denied'}
  <div class="auth-banner denied">
    Access was denied.
    <button type="button" onclick={() => auth.requestAccess()}>Request again</button>
  </div>
{/if}

<style>
.auth-banner {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  background: var(--surface-raised);
  color: var(--text);
  border-block-end: 1px solid var(--border);
}
.auth-banner.denied {
  color: var(--alarm);
}
.auth-banner button {
  font: inherit;
  margin-inline-start: 0.5rem;
  padding: 0.15rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--accent);
  cursor: pointer;
}
</style>
