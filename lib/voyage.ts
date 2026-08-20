export async function getVoyageQueryEmbedding(
  query: string,
): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VOYAGE_API_KEY is not configured. Please set your Voyage AI API key.",
    );
  }

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: [query],
      model: "voyage-code-3",
      input_type: "query",
      output_dimension: 1024,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Voyage AI request failed with status ${response.status}: ${errText}`,
    );
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding: number[] }>;
  };

  const embedding = data?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Invalid embedding response received from Voyage AI.");
  }

  return embedding;
}
