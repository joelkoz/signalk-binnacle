<script lang="ts">
interface Props {
  title: string;
  visible: boolean;
  onToggle: (visible: boolean) => void;
}

const { title, visible, onToggle }: Props = $props();
</script>

<label class="layer-toggle">
  <input
    type="checkbox"
    checked={visible}
    aria-label={`Show ${title} on chart`}
    onchange={(e) => onToggle(e.currentTarget.checked)}
  >
  <span class="title" {title}>{title}</span>
</label>

<style>
.layer-toggle {
  display: flex;
  flex: 1;
  min-inline-size: 0;
  align-items: center;
  gap: var(--space-2);
  min-block-size: var(--control-size);
  font-size: var(--text-md);
  cursor: pointer;
}
.layer-toggle input[type="checkbox"] {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  /* Never let a long layer name shrink the box: the title ellipsizes, the checkbox stays square. */
  flex-shrink: 0;
  accent-color: var(--accent);
}
.layer-toggle .title {
  min-inline-size: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
