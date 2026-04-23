#!/usr/bin/env node

/**
 * Node.js MCP Server for OptiResume
 * Proxies tools to the Python FastAPI backend
 * Compatible with Claude Desktop and other MCP clients
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import fetch from 'cross-fetch';
import fs from 'fs';
import FormData from 'form-data';

const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8000';

// Newer @modelcontextprotocol/sdk requires capabilities at construction
const server = new Server(
  {
    name: 'optiresume-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_templates',
        description: 'List available resume LaTeX templates',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'extract_resume_data',
        description: 'Parse uploaded resume and extract structured data',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to resume file (PDF/DOCX)',
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'generate_resume',
        description: 'Generate resume in html or pdf from structured data',
        inputSchema: {
          type: 'object',
          properties: {
            template: { type: 'string', default: 'billryan_basic.tex' },
            resume_data: { type: 'object' },
            format: { type: 'string', enum: ['html','pdf'], default: 'html' },
          },
          required: ['resume_data'],
        },
      },
      {
        name: 'generate_resume_html',
        description: 'Generate styled HTML resume from structured data',
        inputSchema: {
          type: 'object',
          properties: {
            template: {
              type: 'string',
              description: 'Template name',
              default: 'billryan_basic.tex',
            },
            resume_data: {
              type: 'object',
              description: 'Structured resume data',
            },
          },
          required: ['resume_data'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_templates': {
        const res = await fetch(`${FASTAPI_BASE_URL}/templates`);
        const data = await res.json();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case 'extract_resume_data': {
        const filePath = args.file_path;
        if (!filePath) throw new Error('file_path is required');
        if (!fs.existsSync(filePath)) throw new Error(`file not found: ${filePath}`);

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        const res = await fetch(`${FASTAPI_BASE_URL}/upload_resume`, {
          method: 'POST',
          body: form,
          headers: form.getHeaders(),
        });
        const data = await res.json();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'generate_resume_html': {
        const template = args.template || 'billryan_basic.tex';
        const resumeData = args.resume_data;

        if (!resumeData) {
          throw new Error('resume_data is required');
        }

        const res = await fetch(`${FASTAPI_BASE_URL}/generate_resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template,
            data: resumeData,
            format: 'html',
          }),
        });

        const html = await res.text();
        return { content: [{ type: 'text', text: html }] };
      }

      case 'generate_resume': {
        const template = args.template || 'billryan_basic.tex';
        const resumeData = args.resume_data;
        const format = (args.format || 'html').toLowerCase();
        if (!resumeData) throw new Error('resume_data is required');

        const res = await fetch(`${FASTAPI_BASE_URL}/generate_resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template, data: resumeData, format }),
        });

        if (format === 'pdf') {
          const buf = Buffer.from(await res.arrayBuffer());
          const b64 = buf.toString('base64');
          return { content: [{ type: 'text', text: `PDF_BASE64:${b64}` }] };
        }
        const html = await res.text();
        return { content: [{ type: 'text', text: html }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Handle prompts (optional)
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [],
  };
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OptiResume MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

