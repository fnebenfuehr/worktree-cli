import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	type CallToolRequest,
	CallToolRequestSchema,
	type ListToolsRequest,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import packageJson from '../../package.json';
import * as tools from './tools';

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
			tools: [
				{
					name: 'worktree_status',
					description: 'Check if repo uses worktrees. Call this first before other operations.',
					inputSchema: {
						type: 'object',
						properties: {},
					},
				},
				{
					name: 'worktree_list',
					description: 'List all worktrees. Use to check what exists or show user active work.',
					inputSchema: {
						type: 'object',
						properties: {},
					},
				},
				{
					name: 'worktree_create',
					description:
						'Create isolated worktree for features, bugfixes, or experiments. Use when user wants to work on something new without affecting current work. Branch format: feature/name, bugfix/name, or experiment/name. Check worktree_status first if unsure if repo is worktree-enabled.',
					inputSchema: {
						type: 'object',
						properties: {
							branch: {
								type: 'string',
								description: 'Branch name (e.g., feature/dark-mode)',
							},
							baseBranch: {
								type: 'string',
								description: 'Base branch to create from (defaults to main)',
							},
						},
						required: ['branch'],
					},
				},
				{
					name: 'worktree_switch',
					description:
						'Get the absolute path for a worktree branch. Use this path to read/write files in that worktree. You can access files at <path>/src/file.ts directly.',
					inputSchema: {
						type: 'object',
						properties: {
							branch: {
								type: 'string',
								description: 'Branch name or worktree identifier',
							},
						},
						required: ['branch'],
					},
				},
				{
					name: 'worktree_remove',
					description:
						'Delete worktree. Use after feature is merged. Never force unless user explicitly requests.',
					inputSchema: {
						type: 'object',
						properties: {
							identifier: {
								type: 'string',
								description: 'Branch name or path',
							},
							force: {
								type: 'boolean',
								description: 'Force removal (default: false)',
							},
						},
						required: ['identifier'],
					},
				},
				{
					name: 'worktree_setup',
					description:
						'Convert repo to worktree structure. Use when user wants to enable worktrees for first time. Moves current repo to bare structure with main worktree.',
					inputSchema: {
						type: 'object',
						properties: {
							targetDir: {
								type: 'string',
								description: 'Parent directory (defaults to ../)',
							},
						},
					},
				},
			],
		};
	});

	server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
		const { name, arguments: args } = request.params;

		switch (name) {
			case 'worktree_status': {
				const result = await tools.worktreeStatus();
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_list': {
				const result = await tools.worktreeList();
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_create': {
				const { branch, baseBranch } = args as { branch: string; baseBranch?: string };
				const result = await tools.worktreeCreate(branch, baseBranch);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_switch': {
				const { branch } = args as { branch: string };
				const result = await tools.worktreeSwitch(branch);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_remove': {
				const { identifier, force } = args as { identifier: string; force?: boolean };
				const result = await tools.worktreeRemove(identifier, force);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_setup': {
				const { targetDir } = args as { targetDir?: string };
				const result = await tools.worktreeSetup(targetDir);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
}
