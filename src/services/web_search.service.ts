export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export class WebSearchService {
  /**
   * Performs a web search and returns relevant result snippets.
   * Uses DuckDuckGo HTML / Instant Answers with standard fetch (no API key required).
   */
  async search(query: string, limit: number = 5): Promise<SearchResult[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    try {
      // 1. First attempt: DuckDuckGo HTML search
      const results = await this.searchDuckDuckGoHtml(cleanQuery, limit);
      if (results.length > 0) return results;

      // 2. Fallback: DuckDuckGo Instant Answer API
      return await this.searchDuckDuckGoInstant(cleanQuery, limit);
    } catch (err: any) {
      console.warn(`[WebSearch] Search error for "${cleanQuery}": ${err.message}`);
      return [];
    }
  }

  private async searchDuckDuckGoHtml(query: string, limit: number): Promise<SearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!response.ok) return [];

    const html = await response.text();
    const results: SearchResult[] = [];

    // Lightweight Regex extraction of DuckDuckGo results
    const resultBlocks = html.split('<div class="result results_links results_links_deep web-result');
    for (let i = 1; i < resultBlocks.length && results.length < limit; i++) {
      const block = resultBlocks[i];

      // Extract title
      const titleMatch = block.match(/<a class="result__url" href="([^"]+)">|<a class="result__snippet[^>]*>|<a class="result__a"[^>]*>(.*?)<\/a>/s);
      const mainLinkMatch = block.match(/<a class="result__a"[^>]*>(.*?)<\/a>/s);
      const urlMatch = block.match(/href="([^"]+)"/);
      const snippetMatch = block.match(/<a class="result__snippet"[^>]*>(.*?)<\/a>/s);

      const title = mainLinkMatch ? this.cleanHtml(mainLinkMatch[1]) : '';
      let resultUrl = urlMatch ? urlMatch[1] : '';
      const snippet = snippetMatch ? this.cleanHtml(snippetMatch[1]) : '';

      // Unpack DuckDuckGo redirect URL: //duckduckgo.com/l/?uddg=...
      if (resultUrl.includes('uddg=')) {
        const decoded = decodeURIComponent(resultUrl.split('uddg=')[1].split('&')[0]);
        resultUrl = decoded;
      }

      if (title && (snippet || resultUrl)) {
        results.push({
          title,
          snippet: snippet || title,
          url: resultUrl
        });
      }
    }

    return results;
  }

  private async searchDuckDuckGoInstant(query: string, limit: number): Promise<SearchResult[]> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return [];

    const data: any = await response.json();
    const results: SearchResult[] = [];

    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL || ''
      });
    }

    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= limit) break;
        if (topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text,
            snippet: topic.Text,
            url: topic.FirstURL || ''
          });
        }
      }
    }

    return results;
  }

  private cleanHtml(raw: string): string {
    return raw
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export const webSearchService = new WebSearchService();
