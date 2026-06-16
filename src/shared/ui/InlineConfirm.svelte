<script lang="ts">
import { focusOnMount } from './focus';

interface Props {
  // The question shown beside the buttons, doubling as the group's accessible name.
  question: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const { question, confirmLabel = 'Delete', onConfirm, onCancel }: Props = $props();
</script>

<!-- An inline destructive confirm that replaces a card's action row: a clear question and a pair
     of full buttons, so confirming or backing out is a deliberate second tap. Cancel takes the
     focus on mount, so a double tap on the arming control cannot land on the destructive button. -->
<div class="confirm" role="group" aria-label={question}>
  <span class="confirm-text">{question}</span>
  <div class="panel-controls">
    <button type="button" class="btn btn-danger" onclick={onConfirm}>{confirmLabel}</button>
    <button type="button" class="btn" use:focusOnMount onclick={onCancel}>Cancel</button>
  </div>
</div>

<style>
.confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.confirm-text {
  font-size: var(--text-sm);
  font-weight: 600;
}
</style>
