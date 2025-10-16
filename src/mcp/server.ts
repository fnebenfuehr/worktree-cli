import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	type CallToolRequest,
	CallToolRequestSchema,
	type ListToolsRequest,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import packageJson from '../../package.json';

export async function startMCPServer(): Promise<void> {
	const server = new Server(
		{
			name: 'worktree-cli',
			version: packageJson.version,
		},
		{
			capabilities: {
				tools: {},
			},
		}
	);

	server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => {
		return {
			tools: [],
		};
	});

	server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
		throw new Error(`Unknown tool: ${request.params.name}`);
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
}
