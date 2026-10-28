import type { Model } from "@/lib/data"

/** One-letter lab marks for the sidebar; neutral glyphs rather than brand logos. */
export const LAB_MARK: Record<string, string> = {
  Anthropic: "A",
  OpenAI: "O",
  Google: "G",
  xAI: "x",
  Cognition: "C",
  Moonshot: "K",
  Zhipu: "Z",
  DeepSeek: "D",
  Mistral: "M",
  Meta: "M",
  "Thinking Machines": "T",
  Other: "·",
}

/** The underlying lab behind the build-time lab group ("Open weights" / "Other"). */
export function labOf(model: Model): string {
  if (model.lab !== "Open weights" && model.lab !== "Other") return model.lab
  if (model.id.startsWith("kimi")) return "Moonshot"
  if (model.id.startsWith("glm")) return "Zhipu"
  if (model.id.startsWith("deepseek")) return "DeepSeek"
  if (model.id.startsWith("mistral")) return "Mistral"
  if (model.id.startsWith("muse")) return "Meta"
  if (model.id.startsWith("inkling")) return "Thinking Machines"
  return "Other"
}
