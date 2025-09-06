import { GoogleGenAI, Type } from "@google/genai";
import { Book, Chapter } from '../types';

if (!process.env.API_KEY) {
    console.warn("API_KEY environment variable not set. Using a placeholder. App will not function correctly without a valid key.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "YOUR_API_KEY_HERE" });

/**
 * A wrapper for API calls that implements a retry mechanism with exponential backoff.
 * This is used to gracefully handle API rate limit errors (429).
 * @param apiCall The async function to call.
 * @param maxRetries The maximum number of retries.
 * @param initialDelay The initial delay in milliseconds before the first retry.
 * @returns The result of the API call.
 */
const makeApiCallWithRetry = async <T>(
    apiCall: () => Promise<T>,
    maxRetries: number = 5,
    initialDelay: number = 3000
): Promise<T> => {
    let retries = 0;
    let delay = initialDelay;

    while (true) {
        try {
            return await apiCall();
        } catch (error: any) {
            // Check for various signatures of a rate limit error
            const isRateLimitError =
                (error.httpStatus === 429) ||
                (error.status === 'RESOURCE_EXHAUSTED') ||
                (typeof error.message === 'string' && (error.message.toLowerCase().includes('quota') || error.message.toLowerCase().includes('rate limit')));

            if (isRateLimitError && retries < maxRetries) {
                retries++;
                const jitter = Math.random() * 1000; // Add jitter to prevent synchronized retries
                const waitTime = delay + jitter;
                console.warn(`Rate limit hit. Retrying in ${Math.round(waitTime / 1000)}s... (Attempt ${retries}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                delay *= 2; // Exponential backoff
            } else {
                console.error("API call failed due to a non-retryable error or after exhausting retries.", error);
                throw error; // Re-throw the error if it's not a rate limit issue or retries are exhausted
            }
        }
    }
};


const bookPlanSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A captivating, marketable title for the book." },
        author: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING, description: "A plausible, creative author name that fits the book's genre." },
                bio: { type: Type.STRING, description: "A short, interesting author biography (around 100 words)." },
            },
            required: ["name", "bio"],
        },
        plotSummary: { type: Type.STRING, description: "A detailed summary of the entire plot, including the beginning, rising action, climax, falling action, and resolution (300-400 words)." },
        preface: { type: Type.STRING, description: "An introductory preface for the book, setting the tone (150-200 words)." },
        coverPrompt: { type: Type.STRING, description: "A detailed, artistic prompt for generating a book cover image. Should include the book title, author name, and evoke the mood of the story." },
        chapters: {
            type: Type.ARRAY,
            description: "An array of 10 to 12 chapters, forming a complete narrative arc.",
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "An evocative title for the chapter." },
                    summary: { type: Type.STRING, description: "A detailed summary of this chapter's key events, character development, and plot progression. Should clearly state how it connects to the previous and next chapters (100-150 words)." },
                    imagePrompt: { type: Type.STRING, description: "A detailed prompt for generating a moody, atmospheric illustration for this chapter, focusing on a key scene." },
                },
                required: ["title", "summary", "imagePrompt"],
            },
        },
    },
    required: ["title", "author", "plotSummary", "preface", "coverPrompt", "chapters"],
};

export const generateBookPlan = async (prompt: string): Promise<Omit<Book, 'coverImageUrl'>> => {
    try {
        const response = await makeApiCallWithRetry(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Based on this core idea: "${prompt}", generate a comprehensive plan for a full-length novel. The plan should be detailed enough to ensure a cohesive and captivating story.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: bookPlanSchema,
            },
        }));
        
        const jsonText = response.text.trim();
        const parsedData = JSON.parse(jsonText);

        // Initialize empty content/imageUrls
        const chaptersWithPlaceholders = parsedData.chapters.map((ch: Omit<Chapter, 'content' | 'imageUrl'>) => ({
            ...ch,
            content: '',
            imageUrl: '',
        }));

        return { ...parsedData, chapters: chaptersWithPlaceholders };

    } catch (error) {
        console.error("Error generating book plan:", error);
        throw new Error("Failed to generate book plan. The model response may have been invalid or the API failed permanently.");
    }
};

export const generateChapterContent = async (bookTitle: string, plotSummary: string, chapter: { title: string, summary: string }, previousChapterSummary: string | null): Promise<string> => {
    const context = previousChapterSummary
        ? `The story so far: ${plotSummary}. The previous chapter's events were: ${previousChapterSummary}.`
        : `The story begins here. The overall plot is: ${plotSummary}.`;
    
    const prompt = `You are a world-class novelist, known for writing captivating, immersive stories.
    Write the full content for the chapter titled "${chapter.title}" of the book "${bookTitle}".
    ${context}
    This chapter must accomplish the following: "${chapter.summary}".
    Maintain a consistent, high-quality literary tone and style. The chapter should be substantial, around 2000-2500 words, to contribute to a full-length novel.
    Do NOT include the chapter title in your response. Begin directly with the chapter text.`;
    
    const response = await makeApiCallWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    }));
    return response.text;
};

export const proofreadText = async (text: string): Promise<string> => {
    const prompt = `You are a meticulous editor. Proofread the following text for spelling, grammar, punctuation, and clarity. Make necessary corrections to improve the flow and readability, acting as a final polish before publication. Return ONLY the corrected, clean text. ORIGINAL TEXT: "${text}"`;
    const response = await makeApiCallWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    }));
    return response.text;
};

export const generateImage = async (prompt: string): Promise<string> => {
    const response = await makeApiCallWithRetry(() => ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `An artistic, atmospheric book illustration. Style: moody, evocative, high-quality. Subject: ${prompt}`,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '3:4', // Portrait for book illustrations
        },
    }));

    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64ImageBytes}`;
};