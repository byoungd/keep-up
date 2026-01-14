import { translationService } from "@ku0/translator";

export async function POST(req: Request) {
  const { text, targetLang = "zh" } = await req.json();

  if (!text || typeof text !== "string") {
    return Response.json({ error: "Text is required" }, { status: 400 });
  }

  try {
    const result = await translationService.translate(text, targetLang);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed";
    return Response.json({ error: message, success: false }, { status: 500 });
  }
}
