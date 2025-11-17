import { Router } from "express";
import { AppDataSource } from "../data-source";
import { KnowledgeBaseDoc } from "../entities/KnowledgeBaseDoc";
import { requireApiKey } from "../middleware/apiKey";
import { rateLimit } from "../middleware/rateLimit";

const router = Router();

router.get("/search", requireApiKey, rateLimit, async (req, res) => {
  const q = (req.query.q as string) ?? "";
  if (!q) {
    return res.json({ results: [] });
  }

  const docs = await AppDataSource.getRepository(KnowledgeBaseDoc)
    .createQueryBuilder("doc")
    .where("doc.title ILIKE :q OR doc.content_text ILIKE :q", { q: `%${q}%` })
    .limit(10)
    .getMany();

  res.json({
    results: docs.map((doc) => ({
      docId: doc.id,
      title: doc.title,
      anchor: doc.anchor,
      extract: doc.contentText.slice(0, 200)
    }))
  });
});

export default router;

