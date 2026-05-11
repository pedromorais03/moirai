// src/routes/remediation.js
export async function remediationRoutes(fastify) {
  /**
   * POST /remediation
   * Body: { finding, fileContent? }
   * Calls Anthropic API and returns { snippet, explanation }
   */
  fastify.post("/", {
    schema: {
      body: {
        type: "object",
        required: ["finding"],
        properties: {
          finding:     { type: "object" },
          fileContent: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const { finding, fileContent } = request.body;

    const fileSection = fileContent
      ? `\n\nConteúdo atual do arquivo:\n\`\`\`\n${fileContent.slice(0, 4000)}\n\`\`\``
      : "";

    const prompt = `Você é um especialista em segurança DevSecOps. Um scanner encontrou a seguinte misconfiguration:

ID: ${finding.id}
Título: ${finding.title}
Severidade: ${finding.severity}
Arquivo: ${finding.file}
Tipo: ${finding.type}
Descrição: ${finding.description || ""}
Mensagem: ${finding.message || ""}
Resolução sugerida: ${finding.resolution || ""}${fileSection}

Responda APENAS em JSON válido, sem markdown, sem explicação fora do JSON:
{
  "snippet": "o trecho de código corrigido (apenas as linhas relevantes, não o arquivo inteiro)",
  "explanation": "explicação curta em português de o que foi corrigido e por quê (2-3 frases)"
}`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();

      if (data.error) {
        return reply.status(500).send({ error: data.error.message });
      }

      const text = data.content?.[0]?.text || "{}";

      let parsed;
      try {
        parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch {
        return reply.status(500).send({ error: "Falha ao parsear resposta da IA" });
      }

      return reply.send({
        snippet:     parsed.snippet     || "",
        explanation: parsed.explanation || "",
      });
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });
}