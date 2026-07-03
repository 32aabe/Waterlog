// Populates the running dev server's local demo store with a handful of
// varied water spots/moments — dev-only, blocked in production (see
// server/_core/index.ts). Run `pnpm dev` first, then `pnpm seed`.
const port = process.env.PORT || 3000;
const url = `http://localhost:${port}/api/dev/seed-demo-data`;

try {
  const res = await fetch(url, { method: "POST" });
  const body = await res.json();
  if (!res.ok || !body.success) {
    console.error(`Seeding failed: ${body.error ?? res.statusText}`);
    process.exit(1);
  }
  console.log(`Seeded ${body.spots} water spots and ${body.moments} moments. Reload the app to see them.`);
} catch (err) {
  console.error(`Couldn't reach ${url} — is \`pnpm dev\` running in another terminal?`);
  console.error(String(err));
  process.exit(1);
}
