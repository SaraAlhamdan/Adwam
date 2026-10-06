import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { transcribeAudio } from "./voiceTranscription";
import { performWordAlignment, expandMuqattaatText } from "../../supabase/functions/analyze-recitation/index";
import { processAssistantQuery } from "../ragEngine";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.post("/api/recitation/analyze", async (req, res) => {
    try {
      const { audioBase64, mimeType, expectedText, expectedAyahs } = req.body || {};
      if (typeof audioBase64 !== "string" || !audioBase64 || typeof expectedText !== "string" || !expectedText.trim()) {
        res.status(400).json({ error: "INVALID_RECITATION_INPUT", message: "التسجيل أو النص المتوقع غير صالح." });
        return;
      }
      const safeMime = typeof mimeType === "string" && /^audio\//.test(mimeType) ? mimeType : "audio/webm";
      const audioUrl = `data:${safeMime};base64,${audioBase64}`;
      const spokenPrompt = expandMuqattaatText(expectedText).trim();
      const result = await transcribeAudio({
        audioUrl,
        language: "ar",
        prompt: spokenPrompt,
      });
      if ("error" in result) {
        const arabicMsg = (result.details && !result.details.includes("API_KEY") && !result.details.includes("Set "))
          ? result.details
          : "خدمة المعالجة الصوتية غير متوفرة حالياً، يرجى المحاولة لاحقاً.";
        res.status(503).json({ error: result.error, code: result.code, message: arabicMsg });
        return;
      }

      const rawTranscript = (result.text || "").trim();
      if (!rawTranscript) {
        res.json({
          status: "uncertain",
          transcript: "",
          match: 0,
          weakAyahs: [],
          differences: [],
          wordAlignment: [],
          message: "التسجيل الصوتي صامت أو لم يتم التقاط كلام واضح (غير مؤكد). تأكد من وضوح الصوت.",
          supportedBy: "whisper-large-v3",
        });
        return;
      }

      // Check confidence metrics: no_speech_prob and avg_logprob from verbose_json segments
      const segments = result.segments || [];
      let totalNoSpeech = 0;
      let totalLogprob = 0;
      let segmentCount = 0;
      for (const seg of segments) {
        if (typeof seg.no_speech_prob === "number") totalNoSpeech += seg.no_speech_prob;
        if (typeof seg.avg_logprob === "number") totalLogprob += seg.avg_logprob;
        segmentCount++;
      }
      const avgNoSpeech = segmentCount > 0 ? totalNoSpeech / segmentCount : 0;
      const avgLogprob = segmentCount > 0 ? totalLogprob / segmentCount : 0;

      if (avgNoSpeech > 0.65 || (segmentCount > 0 && avgLogprob < -1.25)) {
        res.json({
          status: "uncertain",
          transcript: rawTranscript,
          message: "التسجيل الصوتي غير مؤكد أو منخفض الوضوح (قد يكون هادئًا جدًا أو محاطًا بضوضاء). لم نقم باختلاق أخطاء؛ يرجى إعادة التسميع بنبرة أوضح وقريبة من الميكروفون.",
          supportedBy: "whisper-large-v3",
        });
        return;
      }

      const alignment = performWordAlignment(expectedText, rawTranscript, expectedAyahs);
      const weakAyahs = Array.from(new Set(alignment.differences.map(d => d.ayah).filter((v): v is number => typeof v === "number")));

      res.json({
        status: "success",
        transcript: rawTranscript,
        match: alignment.matchRate,
        weakAyahs,
        differences: alignment.differences,
        wordAlignment: alignment.wordAlignment,
        expectedWordsCount: alignment.expectedWordsCount,
        actualWordsCount: alignment.actualWordsCount,
        correctWordsCount: alignment.correctCount,
        uncertainWordsCount: alignment.uncertainCount,
        substitutionWordsCount: alignment.substitutionCount,
        omissionWordsCount: alignment.omissionCount,
        additionWordsCount: alignment.additionCount,
        errorCount: alignment.errorCount,
        supportedBy: "OpenAI Audio STT + Normalized Quran Alignment with Tolerance",
      });
    } catch (error) {
      console.error("[Recitation] analysis failed", error);
      res.status(500).json({ error: "RECITATION_ANALYSIS_FAILED", message: error instanceof Error ? error.message : "فشل تحليل التسجيل." });
    }
  });

  app.post("/api/assistant/query", async (req, res) => {
    try {
      const { question, mode, locale, context } = req.body || {};
      const result = await processAssistantQuery({
        question: typeof question === "string" ? question : "",
        mode,
        locale,
        context,
      });
      res.json(result);
    } catch (error) {
      console.error("[Assistant] query failed", error);
      res.status(500).json({
        status: "error",
        title: "تعذر معالجة الطلب",
        answer: "حدث خطأ غير متوقع أثناء معالجة السؤال. يرجى المحاولة لاحقاً.",
        citations: [],
        reason: "service_unavailable",
      });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
