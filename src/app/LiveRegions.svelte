<script lang="ts">
// The assertive and polite aria live regions. Three separate keyed assertive regions (collision,
// anchor, MOB) keep a distinct screen-reader region identity per channel, so a drag alarm is
// announced even while a collision alert holds another region; the mute note is polite. The
// .visually-hidden utility is global (src/styles/a11y.css), so no scoped style is needed here.
let {
  collision,
  anchor,
  mob,
  mute,
}: {
  collision: string;
  anchor: string;
  mob: string;
  mute: string;
} = $props();
</script>

<div class="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
  {collision}
</div>
<div class="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
  {anchor}
</div>
<div class="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
  {mob}
</div>
<div class="visually-hidden" aria-live="polite" aria-atomic="true">{mute}</div>
