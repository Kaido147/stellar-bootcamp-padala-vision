import { createApp } from "./app.js";
import { env, runtimeCapabilities } from "./config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Padala-Vision backend listening on http://localhost:${env.PORT}`);
  console.log(`Gemini proof analysis enabled: ${runtimeCapabilities.geminiProofAnalysisEnabled ? "yes" : "no"}`);
});
