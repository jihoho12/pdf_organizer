import { Client } from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const defaultPdfRoot = process.env.PDF_ORGANIZER_BASE_DIR ?? 'C:\\Users\\user\\Documents\\PDFs';

const prompt = process.argv.slice(2).join(' ').trim();

if (!prompt || prompt === '--help' || prompt === '-h') {
  console.log(`Usage:
  node scripts/pdf-organizer-nl.mjs "<natural language request>" [--yes]

Example:
  node scripts/pdf-organizer-nl.mjs "pdf-organizer mcp로 C:\\Users\\user\\Downloads에 있는 pdf를 C:\\Users\\user\\Documents\\PDFs 에 오늘 날짜로 복사 정리해줘"
`);
  process.exit(prompt ? 0 : 1);
}

const assumeYes = process.argv.includes('--yes');
const parseOnly = process.argv.includes('--parse-only');
const cleanPrompt = process.argv
  .slice(2)
  .filter((arg) => arg !== '--yes' && arg !== '--parse-only')
  .join(' ')
  .trim();

const tools = [
  {
    type: 'function',
    function: {
      name: 'organize_pdf',
      description: 'Organize one PDF into a date folder. Defaults to moving unless copy is true.',
      parameters: {
        type: 'object',
        properties: {
          source_path: { type: 'string' },
          base_dir: { type: 'string' },
          copy: { type: 'boolean' },
          date_override: { type: 'string' },
        },
        required: ['source_path', 'base_dir'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'organize_directory',
      description: 'Organize all PDFs in a directory into a single date folder. Defaults to today when date_override is omitted.',
      parameters: {
        type: 'object',
        properties: {
          source_dir: { type: 'string' },
          base_dir: { type: 'string' },
          copy: { type: 'boolean' },
          date_override: { type: 'string' },
          recursive: { type: 'boolean' },
        },
        required: ['source_dir', 'base_dir'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'organize_by_file_date',
      description: 'Organize PDFs by each file date. Use date_type modified for modified date.',
      parameters: {
        type: 'object',
        properties: {
          source_dir: { type: 'string' },
          base_dir: { type: 'string' },
          date_type: { type: 'string', enum: ['modified', 'created'] },
          copy: { type: 'boolean' },
          recursive: { type: 'boolean' },
        },
        required: ['source_dir', 'base_dir'],
      },
    },
  },
];

function parseToolCall(message) {
  if (message.tool_calls?.length) {
    const call = message.tool_calls[0];
    const args =
      typeof call.function.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : call.function.arguments;
    return { name: call.function.name, arguments: args };
  }

  const match = message.content?.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  return JSON.parse(match[0]);
}

function isWindowsAbsolute(value) {
  return /^[a-zA-Z]:[\\/]/.test(value ?? '');
}

function stripPathSuffix(value) {
  return value
    .replace(/[.,;)\]}]+$/g, '')
    .replace(/(?:에서|으로|로|의|에)$/u, '');
}

function isPathPrefix(prefix, value) {
  const prefixLower = prefix.toLowerCase();
  const valueLower = value.toLowerCase();
  return (
    valueLower.startsWith(prefixLower) &&
    (value.length === prefix.length || ['\\', ' '].includes(value[prefix.length]))
  );
}

function extractWindowsPaths(text) {
  const paths = [];
  const seen = new Set();
  const add = (value) => {
    const clean = path.win32.normalize(stripPathSuffix(value.trim()));
    if (!isWindowsAbsolute(clean) || seen.has(clean)) {
      return;
    }

    const lower = clean.toLowerCase();
    if (paths.some((existing) => isPathPrefix(clean, existing))) {
      return;
    }

    for (let i = paths.length - 1; i >= 0; i -= 1) {
      const existing = paths[i];
      if (isPathPrefix(existing, clean)) {
        seen.delete(existing);
        paths.splice(i, 1);
      }
    }

    seen.add(clean);
    paths.push(clean);
  };

  for (const match of text.matchAll(/["'`]([a-zA-Z]:[\\/][^"'`]+)["'`]/g)) {
    add(match[1]);
  }

  for (const match of text.matchAll(/[a-zA-Z]:[\\/][^\s"'`<>|?*]+/g)) {
    add(match[0]);
  }

  return paths;
}

function toDateParts(year, month, day) {
  return {
    year: Number(year ?? new Date().getFullYear()),
    month: Number(month),
    day: Number(day),
  };
}

function datePartsToIso({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function datePartsToFolder({ year, month, day }) {
  return `${year}년 ${String(month).padStart(2, '0')}월 ${String(day).padStart(2, '0')}일`;
}

function extractDates(text) {
  const dates = [];
  const patterns = [
    /(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/g,
    /(\d{4})\s+(\d{1,2})\s+(\d{1,2})/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const parts =
        match.length === 4 && pattern.source.startsWith('(?:')
          ? toDateParts(match[1], match[2], match[3])
          : toDateParts(match[1], match[2], match[3]);
      dates.push({
        index: match.index ?? 0,
        iso: datePartsToIso(parts),
        folder: datePartsToFolder(parts),
      });
    }
  }

  return dates.sort((a, b) => a.index - b.index);
}

function dateFromText(text) {
  return extractDates(text)[0];
}

function normalizeToolCall(toolCall, userPrompt) {
  const args = toolCall.arguments ?? {};
  const promptDates = extractDates(userPrompt);
  const promptPaths = extractWindowsPaths(userPrompt);
  const promptRoot = promptPaths[0] ?? defaultPdfRoot;

  if (args.source_dir && !isWindowsAbsolute(args.source_dir)) {
    const sourceDate = dateFromText(args.source_dir) ?? promptDates[0];
    if (sourceDate) {
      args.source_dir = path.win32.join(promptRoot, sourceDate.folder);
    }
  }

  if (args.source_path && !isWindowsAbsolute(args.source_path)) {
    const sourceDate = dateFromText(args.source_path) ?? promptDates[0];
    if (sourceDate) {
      args.source_dir = path.win32.join(promptRoot, sourceDate.folder);
      delete args.source_path;
      toolCall.name = 'organize_directory';
    }
  }

  if (!args.base_dir || args.base_dir === '.' || !isWindowsAbsolute(args.base_dir)) {
    args.base_dir = promptRoot;
  }

  if (toolCall.name === 'organize_directory' && !args.date_override && promptDates.length >= 2) {
    args.date_override = promptDates[1].iso;
  }

  if (toolCall.name === 'organize_pdf' && args.source_path && !args.source_path.toLowerCase().endsWith('.pdf')) {
    args.source_dir = args.source_path;
    delete args.source_path;
    toolCall.name = 'organize_directory';
  }

  toolCall.arguments = args;
  return toolCall;
}

function inferCopy(userPrompt) {
  if (/복사|copy|keep|원본|남겨/i.test(userPrompt)) return true;
  if (/이동|옮겨|move/i.test(userPrompt)) return false;
  return true;
}

function inferRecursive(userPrompt) {
  return /하위|recursive|subfolder|sub folder/i.test(userPrompt);
}

function buildFallbackToolCall(userPrompt) {
  const dates = extractDates(userPrompt);
  const paths = extractWindowsPaths(userPrompt);
  if (dates.length >= 2) {
    const sourceRoot = paths[0] ?? defaultPdfRoot;
    const sourceRootIsDateFolder = path.win32.basename(sourceRoot) === dates[0].folder;
    const baseDir = paths[1] ?? (sourceRootIsDateFolder ? path.win32.dirname(sourceRoot) : sourceRoot);
    const sourceDir =
      sourceRootIsDateFolder
        ? sourceRoot
        : path.win32.join(sourceRoot, dates[0].folder);

    return {
      name: 'organize_directory',
      arguments: {
        source_dir: sourceDir,
        base_dir: baseDir,
        copy: inferCopy(userPrompt),
        date_override: dates[1].iso,
        recursive: inferRecursive(userPrompt),
      },
    };
  }

  return null;
}

let rawToolCall = buildFallbackToolCall(cleanPrompt);

if (!rawToolCall) {
  const ollamaResponse = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4:12b',
      stream: false,
      tools,
      messages: [
        {
          role: 'system',
          content: [
            'You convert Korean or English PDF organization requests into exactly one tool call.',
            'Use organize_directory when the user mentions a folder containing PDFs and asks to organize into today date.',
            'Use organize_by_file_date only when the user says modified date, created date, file date, or each file date.',
            'If the user says copy, keep original, 복사, or 원본 남겨, set copy true even if the text also contains 이동.',
            'If the user only says move, 이동, or 옮겨 without copy/복사, set copy false.',
            'If unclear, prefer copy true for safety.',
            'For today date folder, omit date_override unless the user explicitly gives YYYY-MM-DD.',
            'Use recursive false unless the user asks for subfolders.',
            'A Windows path without a .pdf extension is a directory, even if the word "pdf" appears right after it.',
            'Never include trailing Korean words, spaces, or the word "pdf" as part of a Windows path.',
            'If the user includes a Windows path anywhere in the sentence, use it before any default PDF root.',
            'If the destination is a specific date folder under a base folder, use the parent folder as base_dir and set date_override to that date in YYYY-MM-DD.',
            'For requests about PDFs in a folder, prefer organize_directory over organize_pdf.',
          ].join('\n'),
        },
        { role: 'user', content: cleanPrompt },
      ],
    }),
  });

  if (!ollamaResponse.ok) {
    throw new Error(`Ollama request failed: ${ollamaResponse.status} ${await ollamaResponse.text()}`);
  }

  const ollamaJson = await ollamaResponse.json();
  rawToolCall = parseToolCall(ollamaJson.message) ?? buildFallbackToolCall(cleanPrompt);
}

if (!rawToolCall) {
  throw new Error('No tool call could be inferred from the request.');
}

const toolCall = normalizeToolCall(rawToolCall, cleanPrompt);

console.log('Parsed MCP call:');
console.log(JSON.stringify(toolCall, null, 2));

if (parseOnly) {
  process.exit(0);
}

if (!assumeYes) {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question('Execute this MCP call? (y/N) ');
  rl.close();

  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Cancelled.');
    process.exit(0);
  }
}

const client = new Client({ name: 'pdf-organizer-natural-language', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
  cwd: process.cwd(),
});

try {
  await client.connect(transport);
  const result = await client.callTool(toolCall);

  for (const item of result.content ?? []) {
    if (item.type === 'text') {
      console.log(item.text);
    }
  }
} finally {
  await client.close();
}
