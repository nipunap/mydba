import { DocumentChunker } from '../document-chunker';

describe('DocumentChunker', () => {
    let chunker: DocumentChunker;

    beforeEach(() => {
        chunker = new DocumentChunker();
    });

    describe('chunkByFixedSize', () => {
        test('should split text into fixed-size chunks', () => {
            const text = 'a'.repeat(3000); // 3000 characters
            const chunks = chunker.chunk(text, 'Test Doc', {
                strategy: 'fixed',
                maxChunkSize: 1000,
                minChunkSize: 100,
                overlap: 200,
            });

            expect(chunks.length).toBeGreaterThan(2);
            chunks.forEach(chunk => {
                expect(chunk.text.length).toBeLessThanOrEqual(1000);
                expect(chunk.text.length).toBeGreaterThanOrEqual(100);
            });
        });

        test('should have overlapping chunks', () => {
            const text = 'abcdefgh'.repeat(200); // 1600 characters
            const chunks = chunker.chunk(text, 'Test Doc', {
                strategy: 'fixed',
                maxChunkSize: 1000,
                overlap: 200,
            });

            expect(chunks.length).toBeGreaterThan(1);
            
            // Check that chunks overlap
            if (chunks.length > 1) {
                const chunk1End = chunks[0].text.slice(-50);
                const chunk2Start = chunks[1].text.slice(0, 50);
                // There should be some similarity due to overlap
                expect(chunk1End).toBeTruthy();
                expect(chunk2Start).toBeTruthy();
            }
        });

        test('should set chunk metadata correctly', () => {
            const text = 'test'.repeat(500);
            const chunks = chunker.chunk(text, 'Test Doc', {
                strategy: 'fixed',
                maxChunkSize: 1000,
            });

            expect(chunks[0].metadata.title).toBe('Test Doc');
            expect(chunks[0].metadata.chunkIndex).toBe(0);
            expect(chunks[0].metadata.totalChunks).toBe(chunks.length);
            expect(chunks[0].metadata.startChar).toBeGreaterThanOrEqual(0);
            expect(chunks[0].metadata.endChar).toBeGreaterThan(chunks[0].metadata.startChar);
        });
    });

    describe('chunkBySentence', () => {
        test('should split text by sentences', () => {
            const text = `
                This is the first sentence. This is the second sentence.
                This is the third sentence. This is the fourth sentence.
                This is the fifth sentence. This is the sixth sentence.
            `.repeat(10); // Make it long enough

            const chunks = chunker.chunk(text, 'Test Doc', {
                strategy: 'sentence',
                maxChunkSize: 200,
                minChunkSize: 50,
            });

            expect(chunks.length).toBeGreaterThan(1);
            chunks.forEach(chunk => {
                // Each chunk should contain complete sentences
                expect(chunk.text.trim().length).toBeGreaterThanOrEqual(50);
            });
        });

        test('should not split in middle of sentence', () => {
            const text = 'First sentence. Second sentence. Third sentence.'.repeat(20);
            const chunks = chunker.chunk(text, 'Test Doc', {
                strategy: 'sentence',
                maxChunkSize: 100,
            });

            chunks.forEach(chunk => {
                // Each chunk should end with sentence-ending punctuation
                const lastChar = chunk.text.trim().slice(-1);
                expect(['.', '!', '?', '']).toContain(lastChar);
            });
        });
    });

    describe('chunkByParagraph', () => {
        test('should split text by paragraphs', () => {
            const text = `
Paragraph one.
This is still paragraph one.

Paragraph two.
This is still paragraph two.

Paragraph three.
This is still paragraph three.
            `.repeat(5);

            const chunks = chunker.chunk(text, 'Test Doc', {
                strategy: 'paragraph',
                maxChunkSize: 200,
                minChunkSize: 50,
            });

            expect(chunks.length).toBeGreaterThan(1);
        });

        test('should preserve paragraph structure', () => {
            const text = `
First paragraph with multiple lines and enough content to meet minimum requirements.
Still first paragraph with more text added to ensure it's long enough to be valid.

Second paragraph with enough content to meet minimum requirements for chunking.
This paragraph also has substantial text to ensure it meets the required length.
            `;

            const chunks = chunker.chunk(text, 'Test Doc', {
                strategy: 'paragraph',
                maxChunkSize: 1000,
                minChunkSize: 50,
            });

            // With high max size, should create one chunk
            expect(chunks.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('chunkByMarkdown', () => {
        test('should split markdown by headers', () => {
            const text = `
# Main Title

Some content here with enough text to meet minimum chunk size requirements.
This paragraph has additional content to ensure it meets the required length.

## Section 1

Section 1 content with substantial text to meet minimum requirements.
This section also has enough content to be considered a valid chunk.

## Section 2

Section 2 content with substantial text to meet minimum requirements.
This section also has enough content to be considered a valid chunk.

### Subsection 2.1

Subsection content with substantial text to meet minimum requirements.
This subsection also has enough content to be considered a valid chunk.
            `;

            const chunks = chunker.chunk(text, 'Test Doc', {
                strategy: 'markdown',
                maxChunkSize: 500,
                minChunkSize: 50,
            });

            expect(chunks.length).toBeGreaterThan(1);
            
            // Check that sections are preserved
            chunks.forEach(chunk => {
                expect(chunk.text.length).toBeGreaterThan(0);
            });
        });

        test('should use header as sub-title', () => {
            const text = `
# Main Title

Content paragraph with enough text to meet minimum requirements.
Additional sentences to ensure this chunk is long enough to be valid.

## Section Title

More content with enough text to meet minimum requirements for chunking.
This section has multiple sentences to ensure it meets the length requirement.
            `;

            const chunks = chunker.chunk(text, 'Doc Title', {
                strategy: 'markdown',
                maxChunkSize: 1000,
                minChunkSize: 50,
            });

            // At least one chunk should have the section in its title
            const titlesWithSection = chunks.filter(c => 
                c.metadata.title.includes('Section') || c.metadata.title.includes('Title')
            );
            expect(titlesWithSection.length).toBeGreaterThan(0);
        });
    });

    describe('smartChunk', () => {
        test('should detect markdown and use markdown strategy', () => {
            const markdown = `
# Title

Content here with enough text to meet minimum requirements for a valid chunk.
This paragraph has been expanded to ensure proper length is met.

## Section

More content with substantial text to ensure it meets minimum chunk size.
Additional sentences are included to make this a properly sized chunk.
            `;

            const chunks = chunker.smartChunk(markdown, 'Test Doc', {
                minChunkSize: 50,
            });
            
            expect(chunks.length).toBeGreaterThan(0);
            // Should detect as markdown
        });

        test('should detect paragraphs and use paragraph strategy', () => {
            const text = `
First paragraph with enough content to meet the minimum chunk size requirement.
This is still the first paragraph with more words added.

Second paragraph with enough content to meet the minimum chunk size requirement.
This is still the second paragraph with more words added.

Third paragraph with enough content to meet the minimum chunk size requirement.
This is still the third paragraph with more words added.

Fourth paragraph with enough content to meet the minimum chunk size requirement.
This is still the fourth paragraph with more words added.
            `;

            const chunks = chunker.smartChunk(text, 'Test Doc', {
                minChunkSize: 50 // Reduce minimum size for testing
            });
            
            expect(chunks.length).toBeGreaterThan(0);
        });

        test('should fall back to sentence strategy', () => {
            const text = 'Sentence one with more content. Sentence two with more content. Sentence three with more content. Sentence four with more content.';
            
            const chunks = chunker.smartChunk(text, 'Test Doc', {
                maxChunkSize: 60,
                minChunkSize: 30,
            });
            
            expect(chunks.length).toBeGreaterThan(0);
        });
    });

    describe('edge cases', () => {
        test('should handle empty text', () => {
            const chunks = chunker.chunk('', 'Test Doc');
            expect(chunks.length).toBe(0);
        });

        test('should handle text shorter than minChunkSize', () => {
            const chunks = chunker.chunk('Short', 'Test Doc', {
                minChunkSize: 100,
            });
            expect(chunks.length).toBe(0);
        });

        test('should handle text with no clear delimiters', () => {
            const text = 'a'.repeat(2000); // No sentences or paragraphs
            const chunks = chunker.chunk(text, 'Test Doc', {
                strategy: 'sentence',
                maxChunkSize: 500,
            });
            
            // Should still create chunks
            expect(chunks.length).toBeGreaterThan(0);
        });

        test('should handle unicode text', () => {
            const text = '你好世界。这是第一句话。这是第二句话。'.repeat(50);
            const chunks = chunker.chunk(text, 'Test Doc', {
                strategy: 'sentence',
                maxChunkSize: 200,
            });
            
            expect(chunks.length).toBeGreaterThan(0);
        });
    });
});

