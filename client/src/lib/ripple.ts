/**
 * Waterlog's one recurring motion gesture: a single ring that expands and
 * fades from a point of contact. Used for taps, saves, and other moments
 * of confirmation across the app — the animated counterpart to the loud
 * toast, spinner, or checkmark those actions usually get. Reuses the same
 * `ripple-expand` keyframe as the map's reawakened-state pulse (see
 * client/src/index.css), just once instead of on loop.
 *
 * `container` must be a positioned element (`position: relative` or
 * similar) so the ring can be absolutely placed within it.
 */
export function spawnRipple(container: HTMLElement, color: string, durationMs = 900) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ring = document.createElement("div");
  ring.style.position = "absolute";
  ring.style.inset = "0";
  ring.style.borderRadius = "9999px";
  ring.style.border = `1.5px solid ${color}`;
  ring.style.pointerEvents = "none";
  ring.style.animation = `ripple-expand ${durationMs}ms var(--ease-ripple) forwards`;
  ring.addEventListener("animationend", () => ring.remove());
  container.appendChild(ring);
}
