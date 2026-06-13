import { Client } from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

function usage() {
  console.log(`Usage:
  node scripts/mcp-organize-by-date.mjs --source <dir> --dest <dir> [--copy|--move] [--recursive] [--date-type modified|created]

Examples:
  node scripts/mcp-organize-by-date.mjs --source "C:\\Users\\user\\Downloads" --dest "C:\\Users\\user\\Documents\\PDFs" --copy
  node scripts/mcp-organize-by-date.mjs --source "C:\\Users\\user\\Downloads" --dest "C:\\Users\\user\\Documents\\PDFs" --move --recursive
`);
}

function parseArgs(argv) {
  const args = {
    dateType: 'modified',
    copy: true,
    recursive: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--source' || arg === '-s') {
      args.source = next;
      i += 1;
    } else if (arg === '--dest' || arg === '--base' || arg === '-d') {
      args.dest = next;
      i += 1;
    } else if (arg === '--date-type') {
      args.dateType = next;
      i += 1;
    } else if (arg === '--copy') {
      args.copy = true;
    } else if (arg === '--move') {
      args.copy = false;
    } else if (arg === '--recursive' || arg === '-r') {
      args.recursive = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.source || !args.dest) {
  usage();
  process.exit(args.help ? 0 : 1);
}

if (!['modified', 'created'].includes(args.dateType)) {
  throw new Error('--date-type must be "modified" or "created"');
}

const client = new Client({ name: 'pdf-organizer-cli', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
  cwd: process.cwd(),
});

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: 'organize_by_file_date',
    arguments: {
      source_dir: args.source,
      base_dir: args.dest,
      date_type: args.dateType,
      copy: args.copy,
      recursive: args.recursive,
    },
  });

  for (const item of result.content ?? []) {
    if (item.type === 'text') {
      console.log(item.text);
    }
  }
} finally {
  await client.close();
}
