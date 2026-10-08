import { PoolClient } from 'pg';
import { SummaryProvider, SummaryResponse, SummaryResponseSchema } from './types';
import { containsInjection, sanitizeForPrompt } from './sanitize';
import { listNotes } from '../dal/notes';
import { updateProjectSummary } from '../dal/projects';

export interface SummarizeResult {
  summary: SummaryResponse;
  flaggedNotes: string[];
}

export async function summarizeProject(
  client: PoolClient,
  provider: SummaryProvider,
  workspaceId: string,
  projectId: string
): Promise<SummarizeResult> {
  const notes = await listNotes(client, workspaceId, projectId);

  if (notes.length === 0) {
    const empty: SummaryResponse = {
      summary: 'No notes to summarize.',
      keyTopics: [],
      noteCount: 0,
    };
    await updateProjectSummary(client, workspaceId, projectId, empty as unknown as Record<string, unknown>);
    return { summary: empty, flaggedNotes: [] };
  }

  const flaggedNotes: string[] = [];
  const sanitizedNotes = notes.map((n) => {
    if (containsInjection(n.title) || containsInjection(n.content)) {
      flaggedNotes.push(n.id);
    }
    return {
      title: sanitizeForPrompt(n.title),
      content: sanitizeForPrompt(n.content),
    };
  });

  const raw = await provider.summarize(sanitizedNotes);
  const parsed = SummaryResponseSchema.parse(raw) as SummaryResponse;

  await updateProjectSummary(client, workspaceId, projectId, parsed as unknown as Record<string, unknown>);

  return { summary: parsed, flaggedNotes };
}
