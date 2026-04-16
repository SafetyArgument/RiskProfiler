import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set. Please configure it in your environment or GitHub Secrets.");
  }
  return key;
};

export interface ResearchParams {
  title: string;
  jurisdiction: string;
  application: string;
  context: string;
}

export interface StepResult {
  step: number;
  content: string;
  image?: string;
  groundingMetadata?: any;
}

export async function runBasicResearch(
  params: ResearchParams,
  onStepComplete: (result: StepResult) => void
) {
  const apiKey = getApiKey();
  const genAI = new GoogleGenAI({ apiKey });
  const { title, jurisdiction, application, context } = params;

  // Step 1: Search
  const step1Prompt = `Standards in ${jurisdiction} mandatory for regulation/guidance of design and delivery of ${application} in ${context}`;
  const step1Response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: step1Prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const step1Result: StepResult = {
    step: 1,
    content: step1Response.text || "No results found.",
    groundingMetadata: step1Response.candidates?.[0]?.groundingMetadata,
  };
  onStepComplete(step1Result);

  // Step 2: Top-level guidelines
  const step2Prompt = `List all top-level guidelines which together contain a comprehensive list of standards due for consideration in design and delivery of ${application} in ${context}. Explicitly list all ${jurisdiction} or international standards or guides forming a distinct code of practice based on these top guidelines. 
  
  CRITICAL: You MUST use a Markdown table with the following columns: | Standard ID | Title | Description | Relevance |. 
  Ensure the table is formatted correctly with a header row and a separator row (e.g., |---|---|---|---|).
  If a cell contains multiple items, separate them with a <br> tag for clear line breaks.`;
  
  const step2Response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      { role: "user", parts: [{ text: step1Prompt }] },
      { role: "model", parts: [{ text: step1Response.text || "" }] },
      { role: "user", parts: [{ text: step2Prompt }] },
    ],
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const step2Result: StepResult = {
    step: 2,
    content: step2Response.text || "No results found.",
    groundingMetadata: step2Response.candidates?.[0]?.groundingMetadata,
  };
  onStepComplete(step2Result);

  // Step 3: Hazards and Mitigations (Detailed Descriptions)
  const step3Prompt = `Provide a detailed descriptive analysis of the hazards addressed by the prescribed codes of practice. For each hazard, provide a thorough description of the risk and a summary of the mitigation strategies mandated by the codes. 
  
  Focus on the *nature* and *context* of the hazards. Do NOT use a table here; use structured text with headings and bullet points.`;
  
  const step3Response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      { role: "user", parts: [{ text: step1Prompt }] },
      { role: "model", parts: [{ text: step1Response.text || "" }] },
      { role: "user", parts: [{ text: step2Prompt }] },
      { role: "model", parts: [{ text: step2Response.text || "" }] },
      { role: "user", parts: [{ text: step3Prompt }] },
    ],
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const step3Result: StepResult = {
    step: 3,
    content: step3Response.text || "No results found.",
    groundingMetadata: step3Response.candidates?.[0]?.groundingMetadata,
  };
  onStepComplete(step3Result);

  // Step 4: Tabulated Risk Profile (Correlation & Bibliography)
  const step4Prompt = `For ${application} in ${context}, create a final tabulated risk profile correlating [Hazard | Causes | Code/Reference | Mitigations]. 
  
  CRITICAL: 
  1. You MUST use a Markdown table with the following columns: | Hazard | Causes | Code/Reference | Mitigations |.
  2. Ensure the table is formatted correctly with a header row and a separator row.
  3. If a cell contains multiple items, separate them with a <br> tag for clear line breaks.
  4. At the end of your response, include a "Bibliography" section. List all sources as scientific references in a format similar to ISO 690 (Author. Title. Edition. Place of publication: Publisher, Year). Ensure each entry is clearly traceable.`;
  
  const step4Response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      { role: "user", parts: [{ text: step1Prompt }] },
      { role: "model", parts: [{ text: step1Response.text || "" }] },
      { role: "user", parts: [{ text: step2Prompt }] },
      { role: "model", parts: [{ text: step2Response.text || "" }] },
      { role: "user", parts: [{ text: step3Prompt }] },
      { role: "model", parts: [{ text: step3Response.text || "" }] },
      { role: "user", parts: [{ text: step4Prompt }] },
    ],
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const step4Result: StepResult = {
    step: 4,
    content: step4Response.text || "No results found.",
    groundingMetadata: step4Response.candidates?.[0]?.groundingMetadata,
  };
  onStepComplete(step4Result);
}
