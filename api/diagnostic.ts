export default async function diagnostic(_req: unknown, res: { status(code: number): { json(body: unknown): void } }) {
  const checks: Record<string, string> = {};
  for (const [name, loader] of Object.entries({
    firebase: () => import("../server/firebase"),
    database: () => import("../server/db"),
    sdk: () => import("../server/_core/sdk"),
    context: () => import("../server/_core/context"),
    router: () => import("../server/routers"),
  })) {
    try {
      await loader();
      checks[name] = "ok";
    } catch (error) {
      checks[name] = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, failed: name, checks });
      return;
    }
  }
  res.status(200).json({ ok: true, checks });
}
