<main class="binnacle-shell">
  <header class="topbar">Binnacle</header>
  <section class="chart-host" aria-label="Chart">
    <p class="placeholder">Chart canvas mounts here in Phase 3.</p>
  </section>
  <footer class="status-strip">Not connected</footer>
</main>

<style>
.binnacle-shell {
  display: grid;
  grid-template-rows: auto 1fr auto;
  block-size: 100vh;
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #06090d;
  color: #e7edf3;
}
.topbar {
  padding: 0.75rem 1rem;
  font-weight: 600;
  border-block-end: 1px solid #243140;
}
.chart-host {
  display: grid;
  place-items: center;
}
.placeholder {
  color: #6f8aa3;
}
.status-strip {
  padding: 0.5rem 1rem;
  border-block-start: 1px solid #243140;
  color: #6f8aa3;
}
</style>
