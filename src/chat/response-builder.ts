import * as vscode from 'vscode';

/**
 * Response Builder
 *
 * Utility for building rich, interactive chat responses with consistent formatting.
 * Provides methods for headers, code blocks, tables, buttons, and more.
 */
export class ChatResponseBuilder {
    constructor(private stream: vscode.ChatResponseStream) {}

    /**
     * Add a header with emoji
     */
    header(text: string, emoji?: string): this {
        const prefix = emoji ? `${emoji} ` : '';
        this.stream.markdown(`### ${prefix}**${text}**\n\n`);
        return this;
    }

    /**
     * Add a subheader
     */
    subheader(text: string): this {
        this.stream.markdown(`#### ${text}\n\n`);
        return this;
    }

    /**
     * Add a paragraph of text
     */
    text(text: string): this {
        this.stream.markdown(`${text}\n\n`);
        return this;
    }

    /**
     * Add an info message
     */
    info(text: string): this {
        this.stream.markdown(`💡 **Info:** ${text}\n\n`);
        return this;
    }

    /**
     * Add a warning message
     */
    warning(text: string): this {
        this.stream.markdown(`⚠️  **Warning:** ${text}\n\n`);
        return this;
    }

    /**
     * Add an error message
     */
    error(text: string): this {
        this.stream.markdown(`❌ **Error:** ${text}\n\n`);
        return this;
    }

    /**
     * Add a success message
     */
    success(text: string): this {
        this.stream.markdown(`✅ **Success:** ${text}\n\n`);
        return this;
    }

    /**
     * Add a tip
     */
    tip(text: string): this {
        this.stream.markdown(`💡 **Tip:** ${text}\n\n`);
        return this;
    }

    /**
     * Add a SQL code block
     */
    sql(code: string, title?: string): this {
        if (title) {
            this.stream.markdown(`**${title}:**\n\n`);
        }
        this.stream.markdown(`\`\`\`sql\n${code}\n\`\`\`\n\n`);
        return this;
    }

    /**
     * Add a code block with language
     */
    code(code: string, language: string = 'text'): this {
        this.stream.markdown(`\`\`\`${language}\n${code}\n\`\`\`\n\n`);
        return this;
    }

    /**
     * Add an inline code snippet
     */
    inline(code: string): this {
        this.stream.markdown(`\`${code}\``);
        return this;
    }

    /**
     * Add a bullet list
     */
    list(items: string[]): this {
        for (const item of items) {
            this.stream.markdown(`- ${item}\n`);
        }
        this.stream.markdown('\n');
        return this;
    }

    /**
     * Add a numbered list
     */
    numberedList(items: string[]): this {
        items.forEach((item, index) => {
            this.stream.markdown(`${index + 1}. ${item}\n`);
        });
        this.stream.markdown('\n');
        return this;
    }

    /**
     * Add a table
     */
    table(headers: string[], rows: string[][]): this {
        // Header
        this.stream.markdown(`| ${headers.join(' | ')} |\n`);

        // Separator
        this.stream.markdown(`| ${headers.map(() => '---').join(' | ')} |\n`);

        // Rows
        for (const row of rows) {
            this.stream.markdown(`| ${row.join(' | ')} |\n`);
        }

        this.stream.markdown('\n');
        return this;
    }

    /**
     * Add a horizontal rule
     */
    hr(): this {
        this.stream.markdown('---\n\n');
        return this;
    }

    /**
     * Add a divider with text
     */
    divider(text?: string): this {
        if (text) {
            this.stream.markdown(`\n**${text}**\n\n`);
        } else {
            this.stream.markdown('\n');
        }
        return this;
    }

    /**
     * Add a button
     */
    button(title: string, command: string, args?: unknown[]): this {
        this.stream.button({
            title,
            command,
            arguments: args
        });
        return this;
    }

    /**
     * Add multiple buttons in a row
     */
    buttons(buttons: Array<{ title: string; command: string; args?: unknown[] }>): this {
        for (const btn of buttons) {
            this.stream.button({
                title: btn.title,
                command: btn.command,
                arguments: btn.args
            });
        }
        return this;
    }

    /**
     * Add a file reference
     */
    fileReference(uri: vscode.Uri, range?: vscode.Range): this {
        this.stream.markdown(`📄 `);
        // VSCode ChatResponseStream.reference expects (uri, iconPath?) not (uri, range?)
        // Range information is not supported in the API
        this.stream.reference(uri);
        this.stream.markdown('\n\n');
        return this;
    }

    /**
     * Add a link
     */
    link(text: string, url: string): this {
        this.stream.markdown(`[${text}](${url})`);
        return this;
    }

    /**
     * Show progress message
     */
    progress(message: string): this {
        this.stream.progress(message);
        return this;
    }

    /**
     * Add a collapsible details section
     */
    details(summary: string, content: string): this {
        this.stream.markdown(`<details>\n<summary>${summary}</summary>\n\n${content}\n\n</details>\n\n`);
        return this;
    }

    /**
     * Add a metrics box
     */
    metrics(metrics: Record<string, string | number>): this {
        this.stream.markdown('**Metrics:**\n\n');
        for (const [key, value] of Object.entries(metrics)) {
            this.stream.markdown(`- **${key}:** ${value}\n`);
        }
        this.stream.markdown('\n');
        return this;
    }

    /**
     * Add a before/after comparison
     */
    comparison(before: string, after: string, title?: string): this {
        if (title) {
            this.subheader(title);
        }

        this.stream.markdown('**Before:**\n\n');
        this.stream.markdown(`\`\`\`sql\n${before}\n\`\`\`\n\n`);

        this.stream.markdown('**After:**\n\n');
        this.stream.markdown(`\`\`\`sql\n${after}\n\`\`\`\n\n`);

        return this;
    }

    /**
     * Add a query result preview
     */
    resultPreview(columns: string[], rows: unknown[][], totalRows: number): this {
        const displayRows = rows.slice(0, 10);
        const hasMore = totalRows > displayRows.length;

        this.stream.markdown('**Query Results:**\n\n');

        // Build table
        const headers = columns;
        const tableRows = displayRows.map(row =>
            row.map(cell => String(cell ?? 'NULL'))
        );

        this.table(headers, tableRows);

        if (hasMore) {
            this.stream.markdown(`*Showing ${displayRows.length} of ${totalRows} rows*\n\n`);
            this.button('Show All Results', 'mydba.showQueryResults', [rows]);
        }

        return this;
    }

    /**
     * Add a key-value pair display
     */
    keyValue(key: string, value: string | number): this {
        this.stream.markdown(`**${key}:** ${value}\n\n`);
        return this;
    }

    /**
     * Add an analysis summary box
     */
    analysisSummary(summary: {
        queryType?: string;
        complexity?: number;
        estimatedRows?: number;
        usesIndex?: boolean;
        antiPatterns?: number;
        suggestions?: number;
    }): this {
        this.stream.markdown('**Analysis Summary:**\n\n');

        if (summary.queryType) {
            this.stream.markdown(`- **Query Type:** ${summary.queryType}\n`);
        }
        if (summary.complexity !== undefined) {
            const complexityEmoji = summary.complexity <= 3 ? '🟢' : summary.complexity <= 7 ? '🟡' : '🔴';
            this.stream.markdown(`- **Complexity:** ${complexityEmoji} ${summary.complexity}/10\n`);
        }
        if (summary.estimatedRows !== undefined) {
            this.stream.markdown(`- **Estimated Rows:** ${summary.estimatedRows.toLocaleString()}\n`);
        }
        if (summary.usesIndex !== undefined) {
            const indexEmoji = summary.usesIndex ? '✅' : '❌';
            this.stream.markdown(`- **Uses Index:** ${indexEmoji} ${summary.usesIndex ? 'Yes' : 'No'}\n`);
        }
        if (summary.antiPatterns !== undefined) {
            this.stream.markdown(`- **Anti-patterns Found:** ${summary.antiPatterns}\n`);
        }
        if (summary.suggestions !== undefined) {
            this.stream.markdown(`- **Suggestions:** ${summary.suggestions}\n`);
        }

        this.stream.markdown('\n');
        return this;
    }

    /**
     * Add a performance rating
     */
    performanceRating(score: number, label?: string): this {
        const stars = '⭐'.repeat(Math.max(1, Math.min(5, Math.round(score))));
        const text = label || 'Performance Rating';
        this.stream.markdown(`**${text}:** ${stars} (${score}/5)\n\n`);
        return this;
    }

    /**
     * Add an execution time display
     */
    executionTime(milliseconds: number): this {
        const formatted = milliseconds < 1000
            ? `${milliseconds.toFixed(2)}ms`
            : `${(milliseconds / 1000).toFixed(2)}s`;

        const emoji = milliseconds < 100 ? '⚡' : milliseconds < 1000 ? '✅' : '⚠️';

        this.stream.markdown(`${emoji} **Execution Time:** ${formatted}\n\n`);
        return this;
    }

    /**
     * Add a quick actions section
     */
    quickActions(actions: Array<{ label: string; command: string; args?: unknown[] }>): this {
        this.stream.markdown('**Quick Actions:**\n\n');
        for (const action of actions) {
            this.button(action.label, action.command, action.args);
        }
        this.stream.markdown('\n');
        return this;
    }
}
