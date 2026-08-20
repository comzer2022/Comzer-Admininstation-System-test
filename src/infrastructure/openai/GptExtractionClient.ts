import OpenAI from 'openai';
import { extractionPrompt } from './extractionPrompt.js';
import type { BotConfig } from '../config/BotConfig.js';
import type { ParsedApplication, CompanionEntry } from '../../domain/model/ParsedApplication.js';
export class GptExtractionClient {
    private readonly client: OpenAI;
    constructor(config: BotConfig) {
        this.client = new OpenAI({ apiKey: config.openaiApiKey });
    }
    async extract(content: string): Promise<ParsedApplication> {
        const today = new Date().toISOString().slice(0, 10);
        const prompt = extractionPrompt.replace('__TODAY__', today);
        const gptRes = await this.client.chat.completions.create({
            model: 'gpt-4o',
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content },
            ],
        });
        const rawContent = gptRes.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(rawContent) as ParsedApplication;
        if (parsed.companions && Array.isArray(parsed.companions)) {
            parsed.companions = parsed.companions.map((c: CompanionEntry) => typeof c === 'string' ? { mcid: c } : c);
        }
        return parsed;
    }
}
