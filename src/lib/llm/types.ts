import { z } from 'zod';

export const SummaryResponseSchema = z.object({
  summary: z.string().min(1).max(2000),
  keyTopics: z.array(z.string().max(100)).max(10),
  noteCount: z.number().int().min(0),
});

export interface SummaryResponse {
  summary: string;
  keyTopics: string[];
  noteCount: number;
}

export interface SummaryProvider {
  summarize(notes: { title: string; content: string }[]): Promise<SummaryResponse>;
}
