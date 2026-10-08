import { SummaryProvider, SummaryResponse } from './types';

export class MockSummaryProvider implements SummaryProvider {
  async summarize(
    notes: { title: string; content: string }[]
  ): Promise<SummaryResponse> {
    if (notes.length === 0) {
      return { summary: 'No notes to summarize.', keyTopics: [], noteCount: 0 };
    }

    const topics = notes
      .slice(0, 5)
      .map((n) => n.title.slice(0, 50));

    const contentPreview = notes
      .map((n) => n.content.slice(0, 80))
      .join(' ');

    return {
      summary: `Summary of ${notes.length} note(s): ${contentPreview.slice(0, 300)}`,
      keyTopics: topics,
      noteCount: notes.length,
    };
  }
}
