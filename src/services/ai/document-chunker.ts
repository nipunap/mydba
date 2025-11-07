/**
 * Document Chunking Strategies
 * 
 * Splits large documents into smaller, semantically meaningful chunks
 * for better embedding and retrieval accuracy
 */

export interface DocumentChunk {
    text: string;
    metadata: {
        title: string;
        chunkIndex: number;
        totalChunks: number;
        startChar: number;
        endChar: number;
        [key: string]: unknown;
    };
}

export interface ChunkingOptions {
    maxChunkSize?: number; // Maximum characters per chunk
    minChunkSize?: number; // Minimum characters per chunk
    overlap?: number; // Character overlap between chunks
    strategy?: 'sentence' | 'paragraph' | 'fixed' | 'markdown';
}

/**
 * Document Chunker
 */
export class DocumentChunker {
    private defaultOptions: Required<ChunkingOptions> = {
        maxChunkSize: 1000,
        minChunkSize: 100,
        overlap: 200,
        strategy: 'paragraph',
    };

    /**
     * Chunk a document
     */
    chunk(
        text: string,
        title: string,
        options?: ChunkingOptions
    ): DocumentChunk[] {
        const opts = { ...this.defaultOptions, ...options };

        switch (opts.strategy) {
            case 'sentence':
                return this.chunkBySentence(text, title, opts);
            case 'paragraph':
                return this.chunkByParagraph(text, title, opts);
            case 'markdown':
                return this.chunkByMarkdown(text, title, opts);
            case 'fixed':
            default:
                return this.chunkByFixedSize(text, title, opts);
        }
    }

    /**
     * Fixed-size chunking with overlap
     */
    private chunkByFixedSize(
        text: string,
        title: string,
        options: Required<ChunkingOptions>
    ): DocumentChunk[] {
        const chunks: DocumentChunk[] = [];
        const step = options.maxChunkSize - options.overlap;

        for (let start = 0; start < text.length; start += step) {
            const end = Math.min(start + options.maxChunkSize, text.length);
            const chunkText = text.slice(start, end).trim();

            if (chunkText.length >= options.minChunkSize) {
                chunks.push({
                    text: chunkText,
                    metadata: {
                        title,
                        chunkIndex: chunks.length,
                        totalChunks: 0, // Will be set later
                        startChar: start,
                        endChar: end,
                    },
                });
            }
        }

        // Update total chunks
        chunks.forEach(chunk => {
            chunk.metadata.totalChunks = chunks.length;
        });

        return chunks;
    }

    /**
     * Sentence-based chunking
     */
    private chunkBySentence(
        text: string,
        title: string,
        options: Required<ChunkingOptions>
    ): DocumentChunk[] {
        // Split into sentences
        const sentences = text.split(/[.!?]+\s+/).filter(s => s.trim().length > 0);
        
        const chunks: DocumentChunk[] = [];
        let currentChunk = '';
        let startChar = 0;

        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i] + (i < sentences.length - 1 ? '. ' : '');
            
            if ((currentChunk + sentence).length > options.maxChunkSize && currentChunk.length > 0) {
                // Save current chunk
                if (currentChunk.length >= options.minChunkSize) {
                    chunks.push({
                        text: currentChunk.trim(),
                        metadata: {
                            title,
                            chunkIndex: chunks.length,
                            totalChunks: 0,
                            startChar,
                            endChar: startChar + currentChunk.length,
                        },
                    });
                }
                
                // Start new chunk with overlap (last sentence)
                startChar += currentChunk.length - sentence.length;
                currentChunk = sentence;
            } else {
                currentChunk += sentence;
            }
        }

        // Add final chunk
        if (currentChunk.trim().length >= options.minChunkSize) {
            chunks.push({
                text: currentChunk.trim(),
                metadata: {
                    title,
                    chunkIndex: chunks.length,
                    totalChunks: 0,
                    startChar,
                    endChar: startChar + currentChunk.length,
                },
            });
        }

        // Update total chunks
        chunks.forEach(chunk => {
            chunk.metadata.totalChunks = chunks.length;
        });

        return chunks;
    }

    /**
     * Paragraph-based chunking
     */
    private chunkByParagraph(
        text: string,
        title: string,
        options: Required<ChunkingOptions>
    ): DocumentChunk[] {
        // Split into paragraphs
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
        
        const chunks: DocumentChunk[] = [];
        let currentChunk = '';
        let startChar = 0;

        for (const para of paragraphs) {
            const paraText = para.trim() + '\n\n';

            if ((currentChunk + paraText).length > options.maxChunkSize && currentChunk.length > 0) {
                // Save current chunk
                if (currentChunk.length >= options.minChunkSize) {
                    chunks.push({
                        text: currentChunk.trim(),
                        metadata: {
                            title,
                            chunkIndex: chunks.length,
                            totalChunks: 0,
                            startChar,
                            endChar: startChar + currentChunk.length,
                        },
                    });
                }
                
                // Start new chunk
                startChar += currentChunk.length;
                currentChunk = paraText;
            } else {
                currentChunk += paraText;
            }
        }

        // Add final chunk
        if (currentChunk.trim().length >= options.minChunkSize) {
            chunks.push({
                text: currentChunk.trim(),
                metadata: {
                    title,
                    chunkIndex: chunks.length,
                    totalChunks: 0,
                    startChar,
                    endChar: startChar + currentChunk.length,
                },
            });
        }

        // Update total chunks
        chunks.forEach(chunk => {
            chunk.metadata.totalChunks = chunks.length;
        });

        return chunks;
    }

    /**
     * Markdown-aware chunking (splits by headers)
     */
    private chunkByMarkdown(
        text: string,
        title: string,
        options: Required<ChunkingOptions>
    ): DocumentChunk[] {
        const chunks: DocumentChunk[] = [];
        
        // Split by markdown headers
        const sections = text.split(/^#{1,6}\s+/m);
        
        let startChar = 0;

        for (let i = 0; i < sections.length; i++) {
            const section = sections[i].trim();
            
            if (section.length === 0) {
                continue;
            }

            // Extract header (first line)
            const lines = section.split('\n');
            const header = lines[0] || '';
            const content = lines.slice(1).join('\n').trim();
            
            // Use header as sub-title if available
            const chunkTitle = header ? `${title} - ${header}` : title;

            // If section is too large, further chunk it
            if (section.length > options.maxChunkSize) {
                const subChunks = this.chunkByParagraph(section, chunkTitle, options);
                
                subChunks.forEach(subChunk => {
                    chunks.push({
                        text: subChunk.text,
                        metadata: {
                            ...subChunk.metadata,
                            title: chunkTitle,
                            chunkIndex: chunks.length,
                            totalChunks: 0,
                            startChar: startChar + subChunk.metadata.startChar,
                            endChar: startChar + subChunk.metadata.endChar,
                        },
                    });
                });
            } else if (section.length >= options.minChunkSize) {
                chunks.push({
                    text: section,
                    metadata: {
                        title: chunkTitle,
                        chunkIndex: chunks.length,
                        totalChunks: 0,
                        startChar,
                        endChar: startChar + section.length,
                        header,
                    },
                });
            }

            startChar += section.length;
        }

        // Update total chunks
        chunks.forEach(chunk => {
            chunk.metadata.totalChunks = chunks.length;
        });

        return chunks;
    }

    /**
     * Smart chunking that auto-detects the best strategy
     */
    smartChunk(text: string, title: string, options?: ChunkingOptions): DocumentChunk[] {
        // Detect if it's markdown
        if (text.match(/^#{1,6}\s+/m)) {
            return this.chunk(text, title, { ...options, strategy: 'markdown' });
        }

        // Detect if it has clear paragraphs
        if (text.split(/\n\n+/).length > 3) {
            return this.chunk(text, title, { ...options, strategy: 'paragraph' });
        }

        // Fall back to sentence-based
        return this.chunk(text, title, { ...options, strategy: 'sentence' });
    }
}

